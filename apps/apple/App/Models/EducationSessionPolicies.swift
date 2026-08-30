// Defines pure scenario, guided-learning, workspace, and history projections for EducationSession.
import Foundation
import TransitCore
import TransitEducation
import TransitVisualization

/// Provides the supported scenario choices and their stable lookup behavior.
enum EducationScenarioPolicy {
  /// Returns the built-in and bundled scenarios displayed by the education picker.
  static func options() -> [(id: String, title: String)] {
    [
      (ScenarioCatalog.default.identifier, "Default system"),
      (ScenarioCatalog.keplerPlanetOnly.identifier, "Kepler planet only"),
      (ScenarioCatalog.limbDarkeningVariation.identifier, "Limb-darkening variation"),
    ] + BundledRealSystems.labels.map { ($0.0, $0.1) }
  }

  /// Resolves a persisted scenario identifier into its education scenario model.
  static func scenario(id: String) -> EducationScenarioV4? {
    switch id {
    case ScenarioCatalog.default.identifier: ScenarioCatalog.default
    case ScenarioCatalog.keplerPlanetOnly.identifier: ScenarioCatalog.keplerPlanetOnly
    case ScenarioCatalog.limbDarkeningVariation.identifier: ScenarioCatalog.limbDarkeningVariation
    default: try? BundledRealSystems.scenario(id: id)
    }
  }
}

/// Formats accepted numeric drafts for stable editing and workspace round trips.
enum EducationDraftPolicy {
  /// Formats all editable draft values from one accepted scenario.
  static func values(
    for scenario: EducationScenarioV4
  ) -> (planet: String, moon: String, phase: String) {
    (
      text(scenario.planet.radiusMetres),
      text(scenario.moon?.radiusMetres ?? 0),
      text(scenario.moon?.orbit.meanAnomalyAtEpochRadians ?? 0)
    )
  }

  /// Formats a numeric draft without locale-dependent grouping or precision loss.
  static func text(_ value: Double) -> String { String(format: "%.15g", value) }

  /// Parses a finite draft number without attaching UI-specific validation state.
  static func finiteNumber(from text: String) -> Double? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value = Double(trimmed), value.isFinite else { return nil }
    return value
  }
}

/// Projects guided-learning state into durable session and completion identifiers.
enum GuidedLearningProjection {
  /// Evaluates the selected lesson against an accepted simulation step when one is available.
  static func lessonReport(lessonID: String, frame: PresentationFrame?) -> LessonReport? {
    frame.map { LessonEvaluator.report(for: lessonID, step: $0.currentStep) }
  }

  /// Clamps restored navigation state to the selected lesson's available phases.
  static func phaseIndex(_ preservedIndex: Int?, phases: [GuidedLabPhase]) -> Int {
    min(max(preservedIndex ?? 0, 0), max(phases.count - 1, 0))
  }

  /// Returns the selected phase when the projected index remains valid.
  static func currentPhase(phases: [GuidedLabPhase], index: Int) -> GuidedLabPhase? {
    phases.indices.contains(index) ? phases[index] : nil
  }

  /// Returns the hint aligned with a selected lesson and app-owned hint level.
  static func hint(level: HintLevel, lessonID: String) -> String {
    GuidedLearning.hint(for: hintLevel(for: level), lessonID: lessonID)
  }

  /// Requires a nonblank response for every prompt in a phase before advancement.
  static func isPhaseReady(
    _ phase: GuidedLabPhase?, responses: [String: GuidedLabResponse]
  ) -> Bool {
    guard let phase, !phase.prompts.isEmpty else { return true }
    return phase.prompts.allSatisfy {
      !(responses[$0.responseKey]?.primary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        .isEmpty
    }
  }

  /// Requires both the simulation check and guided-response rubric to pass.
  static func canComplete(report: LessonReport?, rubric: GuidedRubricResult) -> Bool {
    report?.isComplete == true && rubric.score == 1
  }
  /// Converts the app hint level into the education framework's hint level.
  static func hintLevel(for level: HintLevel) -> GuidedHintLevel {
    switch level {
    case .l1: .l1
    case .l2: .l2
    case .l3: .l3
    }
  }

  /// Returns the stable response key used for a lesson's comparison observation.
  static func comparisonResponseKey(lessonID: String) -> String { "\(lessonID).comparison" }

  /// Returns the stable completion identifier for one guided phase.
  static func phaseCompletionID(lessonID: String, phase: GuidedLabPhase) -> String {
    "\(lessonID)-\(phase.id)"
  }

  /// Merges persisted and newly completed lesson identifiers without duplicates.
  static func durablePassedStepIDs(_ preserved: [String]?, completed: Set<String>) -> [String] {
    var identifiers = preserved ?? []
    for identifier in completed.sorted() where !identifiers.contains(identifier) {
      identifiers.append(identifier)
    }
    return identifiers
  }

  /// Builds the education framework session projection from app-owned guided state.
  static func session(
    lessonID: String,
    phaseIndex: Int,
    phases: [GuidedLabPhase],
    passedStepIDs: [String],
    responses: [String: GuidedLabResponse],
    comparison: String
  ) -> GuidedLabSession {
    var promptResponses: [String: String] = [:]
    for prompt in phases.flatMap(\.prompts) {
      promptResponses[prompt.responseKey] = responses[prompt.responseKey]?.primary ?? ""
    }
    let passedPhases = Set(
      phases.compactMap { phase in
        passedStepIDs.contains(phaseCompletionID(lessonID: lessonID, phase: phase)) ? phase.id : nil
      })
    var session = GuidedLabSession(
      lessonID: lessonID, phaseIndex: phaseIndex,
      passedPhaseIDs: passedPhases, responses: promptResponses)
    let trimmedComparison = comparison.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmedComparison.isEmpty {
      session.setComparison(
        .init(leftLabel: "Baseline", rightLabel: "Current", observation: trimmedComparison))
    }
    return session
  }
}

/// Builds the versioned workspace payload persisted by an education session.
enum EducationWorkspacePayloadPolicy {
  /// Converts accepted session state into a workspace document payload.
  static func make(
    section: WorkspaceSection,
    scenario: EducationScenarioV4,
    selectedScenarioID: String,
    selectedLessonID: String,
    interfaceTier: InterfaceTier,
    learningStepIndex: Int,
    learningPhaseIndex: Int,
    passedStepIDs: [String],
    lastScore: Double?,
    responses: [String: GuidedLabResponse],
    hintLevel: HintLevel,
    binaryLab: BinaryLabWorkspace?
  ) -> OtherlightWorkspacePayload {
    let guidedLab = GuidedLabWorkspace(
      learning: .init(
        lessonID: selectedLessonID,
        stepIndex: learningStepIndex,
        phaseIndex: learningPhaseIndex,
        passedStepIDs: passedStepIDs,
        lastScore: lastScore),
      responses: responses,
      hintLevel: hintLevel,
      binaryLab: binaryLab)
    return OtherlightWorkspacePayload(
      productContext: .init(
        profile: .education,
        mode: section == .simulation ? .simulation : .lab,
        ui: interfaceTier == .essential ? .essential : .advanced,
        source: BundledRealSystems.labels.contains(where: { $0.0 == selectedScenarioID })
          ? .real : .preset,
        scenario: selectedScenarioID,
        lab: "transit-exomoon",
        lesson: selectedLessonID,
        runtime: .interactive),
      education: .init(
        scenario: BrowserV4Export.scenario(from: scenario, lessonID: selectedLessonID),
        guidedLab: guidedLab))
  }
}

/// Extracts durable transit timing events from an accepted presentation frame.
enum EducationHistoryPolicy {
  /// Counts all events retained in the bounded transit timing history.
  static func eventCount(in history: TransitEventHistory) -> Int {
    history.events.values.reduce(0) { $0 + $1.count }
  }

  /// Counts events for the diagnostic body selected by the workspace.
  static func eventCount(in history: TransitEventHistory, body: TransitBody) -> Int {
    history.events[body, default: []].count
  }

  /// Formats playback status without observing or mutating session state.
  static func playbackStatus(speed: PlaybackSpeed, updatesPerSecond: Double) -> String {
    guard updatesPerSecond > 0 else { return "Running · \(speed.title)" }
    return String(format: "Running · %@ · %.0f updates/s", speed.title, updatesPerSecond)
  }

  /// Converts a monotonic duration into seconds for playback and cadence calculations.
  static func seconds(_ duration: Duration) -> Double {
    let components = duration.components
    return Double(components.seconds) + Double(components.attoseconds) / 1e18
  }
  /// Converts diagnostic timing steps into body-specific transit events.
  static func events(from candidate: PresentationFrame) -> [TransitEvent] {
    candidate.series.timingDiagnosticSteps.flatMap { step in
      [
        step.transitTiming.planetTransitCenterSec.map {
          TransitEvent(body: .planet, centerSeconds: $0, observedFlux: step.flux, series: .raw)
        },
        step.transitTiming.moonTransitCenterSec.map {
          TransitEvent(body: .moon, centerSeconds: $0, observedFlux: step.flux, series: .raw)
        },
      ].compactMap { $0 }
    }
  }
}
