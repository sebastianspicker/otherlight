// Owns observable education state, validation recovery, and playback lifecycle for the workspace.
import Foundation
import OSLog
import Observation
import TransitCore
import TransitEducation
import TransitVisualization

/// Coordinates accepted simulation state, education progress, and playback for the workspace.
@MainActor @Observable
final class EducationSession {
  /// Names editable draft fields so validation errors remain attached to user input.
  enum DraftField: String, CaseIterable, Hashable {
    case planetRadius
    case moonRadius
    case moonPhase
  }

  /// Represents visible calculation state without discarding the last valid frame.
  enum DisplayState: Equatable {
    case loading, ready, empty
    case error(String)
  }

  private(set) var scenario = ScenarioCatalog.default
  private(set) var selectedScenarioID = ScenarioCatalog.default.identifier
  var draftPlanetRadiusMetres: String
  var draftMoonRadiusMetres: String
  var draftMoonPhaseRadians: String
  private(set) var draftValidationErrors: [DraftField: String] = [:]
  private(set) var sampleCount = 160
  private(set) var frame: PresentationFrame?
  private(set) var displayState: DisplayState = .loading
  private(set) var calculationStatus = "Loading"
  private(set) var generation = 0
  private(set) var isOccluded = false
  private(set) var isSceneActive = true
  private(set) var isRunning = false
  private(set) var playbackSpeed: PlaybackSpeed = .oneX
  private(set) var interfaceTier: InterfaceTier = .essential
  private(set) var sceneZoom = 1.0
  private(set) var presentationUpdatesPerSecond = 0.0
  private(set) var canExport = false
  private(set) var completedLessonIDs: Set<String> = []
  private(set) var selectedLessonID = LessonCatalog.lessons[0].id
  private(set) var guidedLabResponses: [String: GuidedLabResponse] = [:]
  private(set) var hintLevel: HintLevel = .l1
  private(set) var binaryLab: BinaryLabWorkspace?
  private(set) var lastLessonScore: Double?
  private(set) var lightCurveHistory = LightCurveHistory()
  private(set) var transitEventHistory = TransitEventHistory()
  private(set) var selectedTransitBody: TransitBody = .planet
  private var preservedPassedStepIDs: [String]?
  private var preservedLearningStepIndex = 0
  private var preservedLearningPhaseIndex: Int?

  private var simulationTimeSeconds: Double
  private var hasStarted = false
  private var seriesRevision = 0
  private var activityRevision = 0
  private var acceptedFramesInCadenceWindow = 0
  private var cadenceWindowStart: ContinuousClock.Instant?
  @ObservationIgnored private static let logger = Logger(
    subsystem: "com.sebastianspicker.Otherlight", category: "Playback")
  @ObservationIgnored private let clock = ContinuousClock()
  @ObservationIgnored private let runtime = SimulationRuntime()
  @ObservationIgnored private var playbackTask: Task<Void, Never>?

  /// Seeds editable text and playback time from the default scenario without starting work.
  init() {
    let draft = EducationDraftPolicy.values(for: ScenarioCatalog.default)
    draftPlanetRadiusMetres = draft.planet
    draftMoonRadiusMetres = draft.moon
    draftMoonPhaseRadians = draft.phase
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: ScenarioCatalog.default)
  }

  /// Starts the session after a mounted SwiftUI view takes ownership.
  func start() {
    guard !hasStarted else { return }
    hasStarted = true
    requestCalculation(refreshSeries: true)
  }

  var scenarioOptions: [(id: String, title: String)] {
    EducationScenarioPolicy.options()
  }

  var currentLessonReport: LessonReport? {
    GuidedLearningProjection.lessonReport(lessonID: selectedLessonID, frame: frame)
  }

  var guidedPhases: [GuidedLabPhase] { GuidedLearning.phases(for: selectedLessonID) }

  var guidedPhaseIndex: Int {
    GuidedLearningProjection.phaseIndex(preservedLearningPhaseIndex, phases: guidedPhases)
  }

  var currentGuidedPhase: GuidedLabPhase? {
    GuidedLearningProjection.currentPhase(phases: guidedPhases, index: guidedPhaseIndex)
  }

  var currentGuidedRubric: GuidedRubricResult { GuidedLearning.rubric(session: guidedSession()) }

  var guidedHintText: String {
    GuidedLearningProjection.hint(level: hintLevel, lessonID: selectedLessonID)
  }

  var guidedPhaseReady: Bool {
    GuidedLearningProjection.isPhaseReady(currentGuidedPhase, responses: guidedLabResponses)
  }

  var canCompleteGuidedLesson: Bool {
    GuidedLearningProjection.canComplete(report: currentLessonReport, rubric: currentGuidedRubric)
  }

  var guidedReportMarkdown: String { GuidedLearning.markdownReport(session: guidedSession()) }

  var transitEventCount: Int { EducationHistoryPolicy.eventCount(in: transitEventHistory) }

  var selectedTransitEventCount: Int {
    EducationHistoryPolicy.eventCount(in: transitEventHistory, body: selectedTransitBody)
  }

  var selectedTransitLatestResidualMilliseconds: Double? {
    transitEventHistory.latestResidualMilliseconds(for: selectedTransitBody)
  }

  var selectedTransitRMSMilliseconds: Double? {
    transitEventHistory.rmsResidualMilliseconds(for: selectedTransitBody)
  }

  var exportDocument: ExportDocument {
    ExportDocument(
      frame: frame, planetRadius: scenario.planet.radiusMetres,
      moonRadius: scenario.moon?.radiusMetres ?? 0,
      moonOffset: scenario.moon?.orbit.meanAnomalyAtEpochRadians ?? 0,
      lightCurveHistory: lightCurveHistory, transitEventHistory: transitEventHistory,
      lessonMarkdown: guidedReportMarkdown)
  }

  /// Selects a known scenario and resets dependent histories before recalculation.
  func selectScenario(id: String) {
    let next = EducationScenarioPolicy.scenario(id: id)
    guard let next else { return }
    scenario = next
    selectedScenarioID = next.identifier
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: next)
    resetHistories()
    resetDraft()
    requestCalculation(refreshSeries: true)
  }

  /// Validates draft text without replacing invalid input or accepted simulation state.
  func applyDraft() {
    draftValidationErrors = [:]
    guard let planet = parseDraft(draftPlanetRadiusMetres, field: .planetRadius) else {
      return presentDraftErrors()
    }
    var candidate = scenario
    candidate.planet.radiusMetres = planet
    if var moon = candidate.moon {
      guard let moonRadius = parseDraft(draftMoonRadiusMetres, field: .moonRadius),
        let phase = parseDraft(draftMoonPhaseRadians, field: .moonPhase)
      else { return presentDraftErrors() }
      moon.radiusMetres = moonRadius
      moon.orbit.meanAnomalyAtEpochRadians = phase
      candidate.moon = moon
    }
    let issues = SimulationEngine.validate(candidate)
    guard issues.isEmpty else {
      displayState = .error(ValidationError(issues).localizedDescription)
      calculationStatus = "Parameters need attention"
      for field in DraftField.allCases {
        draftValidationErrors[field] = ValidationError(issues).localizedDescription
      }
      return
    }
    if scenario != candidate { resetHistories() }
    scenario = candidate
    requestCalculation(refreshSeries: true)
  }

  /// Restores editable draft text from the accepted scenario and clears field errors.
  func resetDraft() {
    let draft = EducationDraftPolicy.values(for: scenario)
    draftPlanetRadiusMetres = draft.planet
    draftMoonRadiusMetres = draft.moon
    draftMoonPhaseRadians = draft.phase
    draftValidationErrors = [:]
    displayState = frame == nil ? .empty : .ready
  }

  /// Starts or stops playback while cancelling stale scheduled ticks when paused.
  func toggleRunning() {
    if !hasStarted { start() }
    isRunning.toggle()
    if isRunning {
      if playbackSpeed == .paused { playbackSpeed = .oneX }
      calculationStatus = isRenderingActive ? "Running" : "Paused while hidden"
      if isRenderingActive { startPlayback() }
    } else {
      playbackTask?.cancel()
      playbackTask = nil
      generation += 1
      calculationStatus = "Paused"
    }
  }

  /// Moves the current time to the scenario's nominal transit focus.
  func jumpToTransit() {
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: scenario)
    requestCalculation(refreshSeries: false)
  }

  /// Stops playback and restores transit-focused time without rebuilding the series.
  func resetSimulation() {
    playbackTask?.cancel()
    playbackTask = nil
    isRunning = false
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: scenario)
    calculationStatus = "Paused"
    requestCalculation(refreshSeries: false, announcesWork: false)
  }

  /// Requests a fresh sampled series for the current accepted scenario.
  func recalculate() { requestCalculation(refreshSeries: true) }

  /// Updates playback speed, treating the paused speed as a stop request.
  func setPlaybackSpeed(_ speed: PlaybackSpeed) {
    playbackSpeed = speed
    if speed == .paused, isRunning { toggleRunning() }
  }

  /// Changes the control-detail tier without changing simulation state.
  func setInterfaceTier(_ tier: InterfaceTier) { interfaceTier = tier }

  /// Clamps scene zoom to safe view bounds.
  func setSceneZoom(_ zoom: Double) { sceneZoom = min(max(zoom, 0.5), 4) }

  /// Restores the neutral scene zoom used by reset controls.
  func resetSceneZoom() { sceneZoom = 1 }

  /// Clears light-curve history while preserving its one-level undo state.
  func clearLightCurveHistory() { lightCurveHistory.clear() }

  /// Restores light-curve history from the last clear when available.
  func undoClearLightCurveHistory() { lightCurveHistory.undoClear() }

  /// Clears transit timing history while preserving its one-level undo state.
  func clearTransitEventHistory() { transitEventHistory.clear() }

  /// Restores transit timing history from the last clear when available.
  func undoClearTransitEventHistory() { transitEventHistory.undoClear() }

  /// Chooses the body whose timing diagnostics are shown.
  func setSelectedTransitBody(_ body: TransitBody) { selectedTransitBody = body }

  /// Selects a valid lesson and resets transient phase navigation for it.
  func selectLesson(id: String) {
    guard LessonCatalog.lessons.contains(where: { $0.id == id }), selectedLessonID != id else {
      return
    }
    selectedLessonID = id
    preservedLearningStepIndex = 0
    preservedLearningPhaseIndex = 0
    lastLessonScore = currentGuidedRubric.score
  }

  /// Reads a primary response as an empty string when the prompt is unanswered.
  func guidedResponse(for key: String) -> String {
    guidedLabResponses[key]?.primary ?? ""
  }

  /// Updates one prompt response while retaining its optional secondary value.
  func setGuidedResponse(_ response: String, for key: String) {
    let prior = guidedLabResponses[key]
    guidedLabResponses[key] = .init(primary: response, secondary: prior?.secondary)
    lastLessonScore = currentGuidedRubric.score
  }

  var guidedComparisonObservation: String {
    guidedResponse(
      for: GuidedLearningProjection.comparisonResponseKey(lessonID: selectedLessonID))
  }

  /// Stores the comparison observation under the current lesson's stable key.
  func setGuidedComparisonObservation(_ observation: String) {
    setGuidedResponse(
      observation, for: GuidedLearningProjection.comparisonResponseKey(lessonID: selectedLessonID))
  }

  /// Changes guided hint depth without affecting answered prompts.
  func setHintLevel(_ level: HintLevel) { hintLevel = level }

  /// Moves within valid guided phases and records completion when advancing from a ready phase.
  func moveGuidedPhase(by offset: Int) {
    guard !guidedPhases.isEmpty else { return }
    if offset > 0, guidedPhaseReady { markCurrentGuidedPhasePassed() }
    preservedLearningPhaseIndex = min(max(guidedPhaseIndex + offset, 0), guidedPhases.count - 1)
    lastLessonScore = currentGuidedRubric.score
  }

  /// Persists completion only when the current lesson and rubric meet their gates.
  func completeCurrentLesson() {
    guard canCompleteGuidedLesson else { return }
    if guidedPhaseReady { markCurrentGuidedPhasePassed() }
    lastLessonScore = currentGuidedRubric.score
    completedLessonIDs.insert(selectedLessonID)
    var passedStepIDs = preservedPassedStepIDs ?? completedLessonIDs.sorted()
    if !passedStepIDs.contains(selectedLessonID) { passedStepIDs.append(selectedLessonID) }
    preservedPassedStepIDs = passedStepIDs
  }

  /// Encodes accepted education state into a validated versioned workspace document model.
  func workspace(section: WorkspaceSection) -> OtherlightWorkspacePayload {
    EducationWorkspacePayloadPolicy.make(
      section: section,
      scenario: scenario,
      selectedScenarioID: selectedScenarioID,
      selectedLessonID: selectedLessonID,
      interfaceTier: interfaceTier,
      learningStepIndex: preservedLearningStepIndex,
      learningPhaseIndex: guidedPhaseIndex,
      passedStepIDs: durablePassedStepIDs,
      lastScore: lastLessonScore,
      responses: guidedLabResponses,
      hintLevel: hintLevel,
      binaryLab: binaryLab)
  }

  /// Restores a validated education workspace and schedules a fresh accepted frame.
  func restore(workspace: OtherlightWorkspacePayload) throws {
    try workspace.validateForEducationSession()
    let restoredScenario = try workspace.educationScenario()
    scenario = restoredScenario
    selectedScenarioID = restoredScenario.identifier
    interfaceTier = workspace.productContext.ui == .essential ? .essential : .advanced
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: scenario)
    resetHistories()
    if let guidedLab = workspace.education.guidedLab {
      selectedLessonID = guidedLab.learning.lessonID
      completedLessonIDs = Set(
        guidedLab.learning.passedStepIDs.filter { id in
          LessonCatalog.lessons.contains { $0.id == id }
        })
      lastLessonScore = guidedLab.learning.lastScore
      preservedPassedStepIDs = guidedLab.learning.passedStepIDs
      preservedLearningStepIndex = guidedLab.learning.stepIndex
      let maximumPhase = max(GuidedLearning.phases(for: selectedLessonID).count - 1, 0)
      preservedLearningPhaseIndex = min(max(guidedLab.learning.phaseIndex ?? 0, 0), maximumPhase)
      guidedLabResponses = guidedLab.responses
      hintLevel = guidedLab.hintLevel
      binaryLab = guidedLab.binaryLab
    } else {
      selectedLessonID = LessonCatalog.lessons[0].id
      completedLessonIDs = []
      guidedLabResponses = [:]
      hintLevel = .l1
      binaryLab = nil
      lastLessonScore = nil
      preservedPassedStepIDs = nil
      preservedLearningStepIndex = 0
      preservedLearningPhaseIndex = 0
    }
    resetDraft()
    requestCalculation(refreshSeries: true)
  }

  /// Clamps sample density to supported bounds before invalidating the cached series.
  func setSampleCount(_ count: Int) {
    let supportedCount = min(max(count, 32), 512)
    guard sampleCount != supportedCount else { return }
    sampleCount = supportedCount
    requestCalculation(refreshSeries: true)
  }

  /// Suspends delivery and playback while the host reports the window as occluded.
  func setOccluded(_ occluded: Bool) {
    guard isOccluded != occluded else { return }
    let wasActive = isRenderingActive
    isOccluded = occluded
    updateRenderingActivity(wasActive: wasActive)
  }

  /// Applies scene lifecycle changes to calculation and playback activity.
  func setSceneActive(_ active: Bool) {
    guard isSceneActive != active else { return }
    let wasActive = isRenderingActive
    isSceneActive = active
    updateRenderingActivity(wasActive: wasActive)
  }

  /// Reports whether calculations and playback may consume rendering resources.
  private var isRenderingActive: Bool { hasStarted && isSceneActive && !isOccluded }

  /// Submits a generation-tagged calculation only while rendering activity is permitted.
  private func requestCalculation(refreshSeries: Bool, announcesWork: Bool = true) {
    if refreshSeries {
      seriesRevision += 1
      // The old frame remains visible during recalculation, but it must not be exported with
      // newly accepted parameters or freshly reset histories.
      canExport = false
    }
    guard isRenderingActive else { return }
    generation += 1
    displayState = frame == nil ? .loading : .ready
    if announcesWork, !isRunning { calculationStatus = "Calculating…" }
    let request = CalculationRequestBuilder(
      generation: generation, seriesRevision: seriesRevision, scenario: scenario,
      sampleCount: sampleCount, timeSeconds: simulationTimeSeconds
    ).build()
    Task { [weak self] in
      guard let self else { return }
      await runtime.submit(request) { [weak self] outcome in
        self?.receive(outcome)
      }
    }
  }

  /// Starts one cancellable cadence loop that advances time and coalesces requests.
  private func startPlayback() {
    guard isRunning, isRenderingActive else { return }
    playbackTask?.cancel()
    cadenceWindowStart = nil
    acceptedFramesInCadenceWindow = 0
    Self.logger.info("Playback started")
    let playbackScenario = scenario
    playbackTask = Task { [weak self] in
      let clock = ContinuousClock()
      var previousTick = clock.now
      let policy = PlaybackClockPolicy(scenario: playbackScenario)
      var nextTick = previousTick.advanced(by: PlaybackClockPolicy.interval)
      while !Task.isCancelled {
        do {
          try await clock.sleep(until: nextTick, tolerance: .milliseconds(1))
        } catch {
          return
        }
        let now = clock.now
        let elapsed = previousTick.duration(to: now)
        previousTick = now
        nextTick = policy.nextTick(after: nextTick, now: now)
        guard let self, self.isRunning, self.isRenderingActive else { return }
        self.advancePlayback(byRealSeconds: EducationHistoryPolicy.seconds(elapsed))
        self.requestCalculation(refreshSeries: false, announcesWork: false)
      }
    }
  }

  /// Advances simulation time through the policy so elapsed time stays bounded.
  private func advancePlayback(byRealSeconds elapsedSeconds: Double) {
    simulationTimeSeconds = PlaybackClockPolicy(scenario: scenario).advancedTime(
      from: simulationTimeSeconds, elapsedSeconds: elapsedSeconds, speed: playbackSpeed)
  }
  /// Exposes the policy's playback bounds for presentation and test consistency.
  static func playbackBounds(for scenario: EducationScenarioV4) -> ClosedRange<Double> {
    PlaybackClockPolicy(scenario: scenario).bounds
  }
  /// Synchronizes pause state with runtime activity revisions to reject stale resumes.
  private func updateRenderingActivity(wasActive: Bool) {
    let isActive = isRenderingActive
    guard wasActive != isActive else { return }
    activityRevision += 1
    let revision = activityRevision
    playbackTask?.cancel()
    playbackTask = nil

    if !isActive {
      generation += 1
      if isRunning { calculationStatus = "Paused while hidden" }
      Self.logger.info("Rendering suspended")
      Task { await runtime.setPaused(true, activityRevision: revision) }
      return
    }

    Self.logger.info("Rendering resumed")
    Task { [weak self] in
      guard let self else { return }
      await runtime.setPaused(false, activityRevision: revision)
      guard revision == activityRevision, isRenderingActive else { return }
      requestCalculation(refreshSeries: false, announcesWork: !isRunning)
      if isRunning {
        calculationStatus = "Running"
        startPlayback()
      }
    }
  }

  /// Accepts only current, active results so stale actor deliveries cannot mutate UI state.
  private func receive(_ outcome: CalculationOutcome) {
    guard outcome.generation == generation,
      outcome.seriesKey
        == CalculationRequestBuilder(
          generation: generation, seriesRevision: seriesRevision, scenario: scenario,
          sampleCount: sampleCount, timeSeconds: simulationTimeSeconds
        ).build().seriesKey,
      isRenderingActive
    else { return }
    switch outcome {
    case .success(let candidate):
      frame = candidate
      if !canExport { canExport = true }
      displayState = .ready
      let nextStatus = isRunning ? runningStatus : "Updated"
      if calculationStatus != nextStatus { calculationStatus = nextStatus }
      recordHistory(from: candidate)
      recordAcceptedFrame()
    case .failure(_, _, let message):
      displayState = .error(message)
      calculationStatus = message
    }
  }

  /// Measures accepted-frame cadence over one-second windows for playback status.
  private func recordAcceptedFrame() {
    let now = clock.now
    guard let start = cadenceWindowStart else {
      cadenceWindowStart = now
      acceptedFramesInCadenceWindow = 1
      return
    }
    acceptedFramesInCadenceWindow += 1
    let elapsed = EducationHistoryPolicy.seconds(start.duration(to: now))
    guard elapsed >= 1 else { return }
    presentationUpdatesPerSecond = Double(acceptedFramesInCadenceWindow - 1) / elapsed
    acceptedFramesInCadenceWindow = 1
    cadenceWindowStart = now
    if isRunning {
      calculationStatus = runningStatus
      Self.logger.debug("Accepted presentation cadence: \(self.presentationUpdatesPerSecond) Hz")
    }
  }

  /// Formats live playback status with cadence only after it has been measured.
  private var runningStatus: String {
    EducationHistoryPolicy.playbackStatus(
      speed: playbackSpeed, updatesPerSecond: presentationUpdatesPerSecond)
  }

  /// Merges restored and newly completed IDs without losing durable progress ordering.
  private var durablePassedStepIDs: [String] {
    GuidedLearningProjection.durablePassedStepIDs(
      preservedPassedStepIDs, completed: completedLessonIDs)
  }

  /// Builds the evaluator input from current prompts, phase progress, and comparison text.
  private func guidedSession() -> GuidedLabSession {
    GuidedLearningProjection.session(
      lessonID: selectedLessonID,
      phaseIndex: guidedPhaseIndex,
      phases: guidedPhases,
      passedStepIDs: durablePassedStepIDs,
      responses: guidedLabResponses,
      comparison: guidedComparisonObservation)
  }

  /// Records the current phase exactly once after its readiness condition succeeds.
  private func markCurrentGuidedPhasePassed() {
    guard let phase = currentGuidedPhase else { return }
    let identifier = GuidedLearningProjection.phaseCompletionID(
      lessonID: selectedLessonID, phase: phase)
    var passed = preservedPassedStepIDs ?? []
    if !passed.contains(identifier) { passed.append(identifier) }
    preservedPassedStepIDs = passed
  }

  /// Prevents light-curve and timing histories from crossing accepted scenario changes.
  private func resetHistories() {
    lightCurveHistory.reset()
    transitEventHistory.reset()
  }

  /// Extracts display and timing diagnostics from an accepted frame for local export.
  private func recordHistory(from candidate: PresentationFrame) {
    lightCurveHistory.append(
      timeSeconds: candidate.currentStep.timeSeconds, flux: candidate.currentStep.flux)
    let currentTime = candidate.currentStep.timeSeconds
    for event in EducationHistoryPolicy.events(from: candidate) {
      transitEventHistory.append(event, currentTimeSeconds: currentTime)
    }
  }

  /// Parses finite user text while attaching a field-specific recovery error on failure.
  private func parseDraft(_ text: String, field: DraftField) -> Double? {
    guard let value = EducationDraftPolicy.finiteNumber(from: text) else {
      draftValidationErrors[field] = "Enter a finite number."
      return nil
    }
    return value
  }

  /// Presents a non-destructive validation failure while retaining draft text and frame.
  private func presentDraftErrors() {
    displayState = .error("Correct the highlighted parameters before applying them.")
    calculationStatus = "Parameters need attention"
  }

}
