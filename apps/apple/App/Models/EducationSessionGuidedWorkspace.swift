// Implements guided-learning, binary-lab, and workspace state for EducationSession.
import Foundation
import TransitCore
import TransitEducation
import TransitVisualization

/// Provides guided-learning, binary-lab, and workspace state operations for an education session.
extension EducationSession {
  /// Reports whether the selected scenario activates the portable detached-binary teaching surface.
  var isDetachedBinaryLab: Bool {
    scenario.mode == .detachedBinaryLab && scenario.binaryLab?.enabled == true
  }

  /// Reports whether the binary-lab sky may be presented under its V4 reveal gate.
  var isBinaryLabSkyVisible: Bool {
    guard isDetachedBinaryLab, let configuration = scenario.binaryLab else { return true }
    return !configuration.hideSkyUntilReveal || binaryLab?.revealed == true
  }

  /// Reports whether V4 didactics require a hypothesis before native parameter controls unlock.
  var isParameterEditingLocked: Bool {
    guard isDetachedBinaryLab, let configuration = scenario.binaryLab else { return false }
    return configuration.lockParamsUntilHypothesis && binaryLab?.hypothesis == nil
  }

  /// Reports whether the selected hypothesis satisfies the V4 sky-reveal guard.
  var canRevealBinaryLabSky: Bool {
    guard isDetachedBinaryLab, let configuration = scenario.binaryLab else { return false }
    return !configuration.hideSkyUntilReveal || !configuration.requireHypothesis
      || binaryLab?.hypothesis != nil
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
    guard let next = EducationScenarioPolicy.scenario(id: id) else { return }
    scenario = next
    selectedScenarioID = next.identifier
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: next)
    resetHistories()
    binaryLab = configuredBinaryLabState(from: nil)
    resetDraft()
    requestCalculation(refreshSeries: true)
  }

  /// Stores the learner's explicit binary-eclipse claim without changing accepted simulation parameters.
  func setBinaryLabHypothesis(_ hypothesis: BinaryLabWorkspace.Hypothesis) {
    guard isDetachedBinaryLab else { return }
    binaryLab = .init(revealed: binaryLab?.revealed ?? false, hypothesis: hypothesis)
  }

  /// Reveals the binary sky only when the V4 didactic guard has been satisfied.
  func revealBinaryLabSky() {
    guard canRevealBinaryLabSky else { return }
    binaryLab = .init(revealed: true, hypothesis: binaryLab?.hypothesis)
  }

  /// Changes the control-detail tier without changing simulation state.
  func setInterfaceTier(_ tier: InterfaceTier) { interfaceTier = tier }

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
  func guidedResponse(for key: String) -> String { guidedLabResponses[key]?.primary ?? "" }

  /// Updates one prompt response while retaining its optional secondary value.
  func setGuidedResponse(_ response: String, for key: String) {
    let prior = guidedLabResponses[key]
    guidedLabResponses[key] = .init(primary: response, secondary: prior?.secondary)
    lastLessonScore = currentGuidedRubric.score
  }

  var guidedComparisonObservation: String {
    guidedResponse(for: GuidedLearningProjection.comparisonResponseKey(lessonID: selectedLessonID))
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
      section: section, scenario: scenario, selectedScenarioID: selectedScenarioID,
      selectedLessonID: selectedLessonID, interfaceTier: interfaceTier, runtimeMode: runtimeMode,
      referenceSubsteps: referenceSubsteps, learningStepIndex: preservedLearningStepIndex,
      learningPhaseIndex: guidedPhaseIndex, passedStepIDs: durablePassedStepIDs,
      lastScore: lastLessonScore, responses: guidedLabResponses, hintLevel: hintLevel,
      binaryLab: binaryLab)
  }

  /// Restores a validated education workspace and schedules a fresh accepted frame.
  func restore(workspace: OtherlightWorkspacePayload) throws {
    try workspace.validateForEducationSession()
    let restoredScenario = try workspace.educationScenario()
    let restoredRuntime = workspace.educationRuntimeConfiguration()
    scenario = restoredScenario
    selectedScenarioID = restoredScenario.identifier
    interfaceTier = workspace.productContext.ui == .essential ? .essential : .advanced
    runtimeMode = restoredRuntime.mode == .reference ? .reference : .interactive
    referenceSubsteps = restoredRuntime.referenceSubsteps
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
    binaryLab = configuredBinaryLabState(from: binaryLab)
    resetDraft()
    requestCalculation(refreshSeries: true)
  }

  /// Merges restored and newly completed IDs without losing durable progress ordering.
  private var durablePassedStepIDs: [String] {
    GuidedLearningProjection.durablePassedStepIDs(
      preservedPassedStepIDs, completed: completedLessonIDs)
  }

  /// Builds the evaluator input from current prompts, phase progress, and comparison text.
  private func guidedSession() -> GuidedLabSession {
    GuidedLearningProjection.session(
      lessonID: selectedLessonID, phaseIndex: guidedPhaseIndex, phases: guidedPhases,
      passedStepIDs: durablePassedStepIDs, responses: guidedLabResponses,
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

  /// Creates safe persisted binary-lab state while refusing a reveal that lacks a required hypothesis.
  private func configuredBinaryLabState(from restored: BinaryLabWorkspace?) -> BinaryLabWorkspace? {
    guard isDetachedBinaryLab, let configuration = scenario.binaryLab else { return nil }
    let hypothesis = restored?.hypothesis
    let revealAllowed =
      !configuration.hideSkyUntilReveal || !configuration.requireHypothesis || hypothesis != nil
    return .init(
      revealed: !configuration.hideSkyUntilReveal || (restored?.revealed == true && revealAllowed),
      hypothesis: hypothesis)
  }
}
