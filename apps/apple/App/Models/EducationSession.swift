// Owns observable education state; focused extensions implement drafts, workspace, and runtime work.
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
    case planetRadius, moonRadius, moonPhase, gridResolution, limbDarkeningU1, limbDarkeningU2
    case planetPhaseReflectedAmplitude, planetPhaseThermalAmplitude, planetPhaseConstantFlux
    case planetPhaseReflectedOffset, planetPhaseThermalOffset, moonPhaseReflectedAmplitude
    case moonPhaseThermalAmplitude, moonPhaseConstantFlux, moonPhaseReflectedOffset
    case moonPhaseThermalOffset
  }

  /// Represents visible calculation state without discarding the last valid frame.
  enum DisplayState: Equatable {
    case loading, ready, empty
    case error(String)
  }

  var scenario = ScenarioCatalog.default
  var selectedScenarioID = ScenarioCatalog.default.identifier
  var draftPlanetRadiusMetres: String
  var draftMoonRadiusMetres: String
  var draftMoonPhaseRadians: String
  var draftGridResolution: String
  var draftLimbDarkeningU1: String
  var draftLimbDarkeningU2: String
  var draftPlanetPhaseEnabled: Bool
  var draftPlanetPhaseReflectedAmplitude: String
  var draftPlanetPhaseThermalAmplitude: String
  var draftPlanetPhaseConstantFlux: String
  var draftPlanetPhaseReflectedOffsetRadians: String
  var draftPlanetPhaseThermalOffsetRadians: String
  var draftPlanetPhaseReflectedModel: PhaseCurve.ReflectedModel
  var draftPlanetPhaseThermalModel: PhaseCurve.ThermalModel
  var draftMoonPhaseEnabled: Bool
  var draftMoonPhaseReflectedAmplitude: String
  var draftMoonPhaseThermalAmplitude: String
  var draftMoonPhaseConstantFlux: String
  var draftMoonPhaseReflectedOffsetRadians: String
  var draftMoonPhaseThermalOffsetRadians: String
  var draftMoonPhaseReflectedModel: PhaseCurve.ReflectedModel
  var draftMoonPhaseThermalModel: PhaseCurve.ThermalModel
  var draftValidationErrors: [DraftField: String] = [:]
  var sampleCount = 160
  var frame: PresentationFrame?
  var displayState: DisplayState = .loading
  var calculationStatus = "Loading"
  var generation = 0
  var isOccluded = false
  var isSceneActive = true
  var isRunning = false
  var playbackSpeed: PlaybackSpeed = .oneX
  var interfaceTier: InterfaceTier = .essential
  var runtimeMode: NativeRuntimeMode = .interactive
  var referenceSubsteps = EducationRuntimeConfiguration.defaultReferenceSubsteps
  var sceneZoom = 1.0
  var presentationUpdatesPerSecond = 0.0
  var canExport = false
  var completedLessonIDs: Set<String> = []
  var selectedLessonID = LessonCatalog.lessons[0].id
  var guidedLabResponses: [String: GuidedLabResponse] = [:]
  var hintLevel: HintLevel = .l1
  var binaryLab: BinaryLabWorkspace?
  var lastLessonScore: Double?
  var lightCurveHistory = LightCurveHistory()
  var transitEventHistory = TransitEventHistory()
  var selectedTransitBody: TransitBody = .planet
  var preservedPassedStepIDs: [String]?
  var preservedLearningStepIndex = 0
  var preservedLearningPhaseIndex: Int?
  var simulationTimeSeconds: Double
  var hasStarted = false
  var seriesRevision = 0
  var activityRevision = 0
  var acceptedFramesInCadenceWindow = 0
  var cadenceWindowStart: ContinuousClock.Instant?
  @ObservationIgnored static let logger = Logger(
    subsystem: "com.sebastianspicker.Otherlight", category: "Playback")
  @ObservationIgnored let clock = ContinuousClock()
  @ObservationIgnored let runtime = SimulationRuntime()
  @ObservationIgnored var playbackTask: Task<Void, Never>?

  /// Seeds editable text and playback time from the default scenario without starting work.
  init() {
    let draft = EducationDraftPolicy.values(for: ScenarioCatalog.default)
    draftPlanetRadiusMetres = draft.planet
    draftMoonRadiusMetres = draft.moon
    draftMoonPhaseRadians = draft.phase
    draftGridResolution = draft.gridResolution
    draftLimbDarkeningU1 = draft.limbDarkeningU1
    draftLimbDarkeningU2 = draft.limbDarkeningU2
    draftPlanetPhaseEnabled = draft.planetPhase.enabled
    draftPlanetPhaseReflectedAmplitude = draft.planetPhase.reflectedAmplitude
    draftPlanetPhaseThermalAmplitude = draft.planetPhase.thermalAmplitude
    draftPlanetPhaseConstantFlux = draft.planetPhase.constantFlux
    draftPlanetPhaseReflectedOffsetRadians = draft.planetPhase.reflectedOffsetRadians
    draftPlanetPhaseThermalOffsetRadians = draft.planetPhase.thermalOffsetRadians
    draftPlanetPhaseReflectedModel = draft.planetPhase.reflectedModel
    draftPlanetPhaseThermalModel = draft.planetPhase.thermalModel
    draftMoonPhaseEnabled = draft.moonPhase.enabled
    draftMoonPhaseReflectedAmplitude = draft.moonPhase.reflectedAmplitude
    draftMoonPhaseThermalAmplitude = draft.moonPhase.thermalAmplitude
    draftMoonPhaseConstantFlux = draft.moonPhase.constantFlux
    draftMoonPhaseReflectedOffsetRadians = draft.moonPhase.reflectedOffsetRadians
    draftMoonPhaseThermalOffsetRadians = draft.moonPhase.thermalOffsetRadians
    draftMoonPhaseReflectedModel = draft.moonPhase.reflectedModel
    draftMoonPhaseThermalModel = draft.moonPhase.thermalModel
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: ScenarioCatalog.default)
  }

  /// Starts the session after a mounted SwiftUI view takes ownership.
  func start() {
    guard !hasStarted else { return }
    hasStarted = true
    requestCalculation(refreshSeries: true)
  }

  var scenarioOptions: [(id: String, title: String)] { EducationScenarioPolicy.options() }
}
