// Provides curated scenarios, compatible decoding, and lesson-evaluation models for education UI.
import Foundation
import TransitCore

/// Supplies bounded scenarios and learning materials used by the native education experience.
public enum ScenarioCatalog {
  private static let orbit = KeplerOrbit(
    semiMajorAxisMetres: 2.4e9, periodSeconds: 63_569.015297886115,
    inclinationRadians: 1.5603243512829308)
  private static let star = Star(
    radiusMetres: 695_700_000, massKilograms: 1.98847e30, limbDarkeningU1: 0.35,
    limbDarkeningU2: 0.25)
  private static let planet = Planet(
    radiusMetres: 150_000_000, massKilograms: 3.5e28, orbit: orbit)
  private static let moon = Moon(
    radiusMetres: 50_000_000, massKilograms: 5.9722e24,
    orbit: .init(
      semiMajorAxisMetres: 210_000_000, periodSeconds: 12_509.353831060787, inclinationRadians: 0))
  private static let planetPhase = PhaseCurve(
    enabled: true, reflectedAmplitude: 0.006, thermalAmplitude: 0.0003)
  private static let moonPhase = PhaseCurve(
    enabled: true, reflectedAmplitude: 0.002, thermalAmplitude: 0.00015)
  public static let `default` = EducationScenarioV4(
    identifier: "default", star: star, planet: planet, moon: moon, planetPhase: planetPhase,
    moonPhase: moonPhase)
  public static let keplerPlanetOnly = EducationScenarioV4(
    identifier: "kepler-planet-only", star: star, planet: planet)
  public static let limbDarkeningVariation = EducationScenarioV4(
    identifier: "limb-darkening-variation",
    star: .init(
      radiusMetres: star.radiusMetres, massKilograms: star.massKilograms, limbDarkeningU1: 0.55,
      limbDarkeningU2: 0.15), planet: planet, moon: moon, planetPhase: planetPhase,
    moonPhase: moonPhase)
  /// Decodes the native compatible scenario representation without applying browser migration rules.
  ///
  /// Missing required values or incompatible data fail decoding so callers retain their last valid
  /// scenario instead of presenting a partially defaulted physical model.
  public static func decodeCompatibleRealSystem(from data: Data) throws -> EducationScenarioV4 {
    try JSONDecoder().decode(EducationScenarioV4.self, from: data)
  }
}

/// Describes one catalogued lesson so UI and reports share stable learning metadata.
public struct LessonDefinition: Codable, Sendable, Hashable {
  public var id: String
  public var title: String
  public var objective: String
  /// Creates the lesson record from its stable identifier and learner-facing copy.
  public init(id: String, title: String, objective: String) {
    self.id = id
    self.title = title
    self.objective = objective
  }
}
/// Provides the fixed lesson sequence used to align navigation and evaluation.
public enum LessonCatalog {
  public static let lessons: [LessonDefinition] = [
    .init(
      id: "kepler-geometry", title: "Kepler geometry",
      objective: "Relate orbit position to the sky plane."),
    .init(
      id: "curve-reading-lab", title: "Curve reading",
      objective: "Connect occultation area to flux."),
    .init(
      id: "exomoon-transit-lab", title: "Exomoon transit", objective: "Inspect the moon geometry."),
    .init(
      id: "limb-darkening-lab", title: "Limb darkening",
      objective: "Compare centre and limb transit depth."),
  ]
}
/// Tracks the completed steps for one learner without coupling progress to presentation state.
public struct LessonSession: Codable, Sendable, Hashable {
  public var lessonID: String
  public private(set) var completedStepIDs: Set<String>
  /// Starts empty progress for the identified lesson.
  public init(lessonID: String) {
    self.lessonID = lessonID
    self.completedStepIDs = []
  }
  /// Records a completed stable step identifier so progress can be restored.
  public mutating func complete(stepID: String) { completedStepIDs.insert(stepID) }
}
/// Captures the outcome and explanatory message for one lesson evaluation criterion.
public struct LessonCheck: Codable, Sendable, Hashable {
  public var id: String
  public var passed: Bool
  public var message: String
  /// Creates a check result with a stable criterion identifier and learner-facing message.
  public init(id: String, passed: Bool, message: String) {
    self.id = id
    self.passed = passed
    self.message = message
  }
}
/// Aggregates lesson checks into a portable completion report.
public struct LessonReport: Codable, Sendable, Hashable {
  public var lessonID: String
  public var checks: [LessonCheck]
  /// Reports completion only when every required lesson check passed.
  public var isComplete: Bool { checks.allSatisfy(\.passed) }
  /// Creates the report for one lesson from its evaluated checks.
  public init(lessonID: String, checks: [LessonCheck]) {
    self.lessonID = lessonID
    self.checks = checks
  }
}
/// Adds presentation-independent export for lesson reports.
extension LessonReport {
  /// Renders the report as portable Markdown for sharing outside the native UI.
  public var markdown: String {
    let status = isComplete ? "Complete" : "In progress"
    let lines = checks.map { "- [\($0.passed ? "x" : " ")] \($0.id): \($0.message)" }.joined(
      separator: "\n")
    return
      "# Guided Lab Report\n\n- Lesson: `\(lessonID)`\n- Status: \(status)\n\n## Checks\n\n\(lines)\n"
  }
}
/// Evaluates simulation snapshots against each catalogue lesson's minimal objective.
public enum LessonEvaluator {
  /// Produces the check set for a lesson from the current simulation snapshot.
  public static func report(for lessonID: String, step: EducationStep) -> LessonReport {
    let check: LessonCheck
    switch lessonID {
    case "kepler-geometry":
      check = .init(
        id: "sky-points", passed: !step.skyPoints.isEmpty,
        message: "Sky-plane positions are available.")
    case "curve-reading-lab":
      check = .init(id: "flux", passed: step.flux < 1, message: "A measurable transit is present.")
    case "exomoon-transit-lab":
      check = .init(
        id: "moon", passed: step.skyPoints.contains { $0.body == "moon" },
        message: "Moon geometry is available.")
    case "limb-darkening-lab":
      check = .init(
        id: "occultation", passed: step.renderSignals.occultedFraction >= 0,
        message: "Limb-aware flux was calculated.")
    default: check = .init(id: "unknown-lesson", passed: false, message: "Unknown lesson.")
    }
    return .init(lessonID: lessonID, checks: [check])
  }
}
