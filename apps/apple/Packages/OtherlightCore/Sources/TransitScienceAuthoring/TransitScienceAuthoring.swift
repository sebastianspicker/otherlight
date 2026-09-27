// Compiles accepted portable Education V4 scenarios into strict scientific V5 requests.
import Foundation
import TransitCore
import TransitEducation
import TransitScienceContracts

/// Reports an unsupported or physically invalid Education value without silently approximating it.
public enum ScienceAuthoringError: Error, LocalizedError, Equatable, Sendable {
  case invalid(String, String)

  /// Keeps the user-facing explanation attached to the unsupported authoring boundary.
  public var errorDescription: String? {
    switch self {
    case .invalid(let path, let rule): "\(path) must contain \(rule) for a Scientific V5 run."
    }
  }
}

/// Configures a bounded radial-velocity request generated from accepted Education authoring state.
public struct ScienceAuthoringConfiguration: Sendable, Equatable {
  public let startOffsetSec: Double
  public let endOffsetSec: Double
  public let sampleCadenceSec: Double
  public let seed: Int64
  public let epochJdTdb: Double

  /// Provides a short, bounded session-only run suitable for the native host's initial operation.
  public static let sessionDefault = Self(
    startOffsetSec: 0, endOffsetSec: 600, sampleCadenceSec: 60, seed: 42,
    epochJdTdb: 2_451_545.0)

  /// Retains explicit request controls rather than inferring scientific duration from an Education view.
  public init(
    startOffsetSec: Double, endOffsetSec: Double, sampleCadenceSec: Double, seed: Int64,
    epochJdTdb: Double
  ) {
    self.startOffsetSec = startOffsetSec
    self.endOffsetSec = endOffsetSec
    self.sampleCadenceSec = sampleCadenceSec
    self.seed = seed
    self.epochJdTdb = epochJdTdb
  }
}

/// Converts the intentionally small static V4 subset to barycentric SI V5 without a runtime fallback.
public enum TransitScienceAuthoring {
  private static let periodRelativeTolerance = 1e-4

  /// Compiles an already accepted Education V4 scenario and validates the complete strict request.
  public static func compile(
    _ education: EducationScenarioV4,
    configuration: ScienceAuthoringConfiguration = .sessionDefault
  ) throws -> ScientificForwardRequestV5 {
    let bodies = try scientificBodies(for: education)
    let maxStep = min(3_600, try shortestPeriod(for: education) / 100)
    let scenario = ScienceScenarioV5(
      schemaVersion: "v5", id: try identifier(for: education),
      epochJdTdb: try positive(configuration.epochJdTdb, "epochJdTdb"), timeScale: "TDB",
      bodies: bodies,
      observer: .init(lineOfSight: try .init(x: 0, y: 0, z: 1), targetBodyId: "star"),
      integrator: .init(
        positionToleranceM: 1e-3, velocityToleranceMps: 1e-6,
        relativeTolerance: 1e-11, maxStepSec: maxStep))
    let request = ScientificForwardRequestV5(
      kind: "forward", scenario: scenario, startOffsetSec: configuration.startOffsetSec,
      endOffsetSec: configuration.endOffsetSec, sampleCadenceSec: configuration.sampleCadenceSec,
      outputs: ["radial-velocity"], seed: configuration.seed)
    try request.validate()
    return request
  }

  /// Uses a stable V5 identifier while retaining the accepted Education scenario identity.
  private static func identifier(for education: EducationScenarioV4) throws -> String {
    let value = education.identifier.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.unicodeScalars.count <= 118 else {
      throw ScienceAuthoringError.invalid(
        "education.identifier",
        "a non-empty identifier of at most 118 Unicode scalars before the 'education-' prefix")
    }
    return "education-\(value)"
  }

  /// Builds either the supported star-planet-moon hierarchy or the explicit detached-binary case.
  private static func scientificBodies(for education: EducationScenarioV4) throws
    -> [ScientificBodyV5]
  {
    switch education.mode {
    case .generalLab:
      try generalBodies(for: education)
    case .detachedBinaryLab:
      try binaryBodies(for: education)
    }
  }

  /// Compiles the Education star, planet, and optional moon as a barycentric three-body initial state.
  private static func generalBodies(for education: EducationScenarioV4) throws -> [ScientificBodyV5]
  {
    let star = try input(id: "star", kind: .star, star: education.star, path: "education.star")
    let planet = try input(
      id: "planet", kind: .planet, planet: education.planet, path: "education.planet")
    if let moon = education.moon {
      let moonInput = try input(id: "moon", kind: .moon, moon: moon, path: "education.moon")
      let outer = try relativeState(
        orbit: education.planet.orbit, totalMass: star.mass + planet.mass + moonInput.mass,
        at: education.epochSeconds, path: "education.planet.orbit")
      let (starState, subsystemState) = split(
        primary: star, secondaryMass: planet.mass + moonInput.mass, relative: outer)
      let inner = try relativeState(
        orbit: moon.orbit, totalMass: planet.mass + moonInput.mass, at: education.epochSeconds,
        path: "education.moon.orbit")
      let (planetState, moonState) = split(
        primary: planet, secondaryMass: moonInput.mass, relative: inner, centre: subsystemState)
      return [
        try body(star, state: starState), try body(planet, state: planetState),
        try body(moonInput, state: moonState),
      ]
    }
    let relative = try relativeState(
      orbit: education.planet.orbit, totalMass: star.mass + planet.mass, at: education.epochSeconds,
      path: "education.planet.orbit")
    let (starState, planetState) = split(
      primary: star, secondaryMass: planet.mass, relative: relative)
    return [try body(star, state: starState), try body(planet, state: planetState)]
  }

  /// Compiles the V4 detached-binary teaching case without treating its placeholder planet as scientific.
  private static func binaryBodies(for education: EducationScenarioV4) throws -> [ScientificBodyV5]
  {
    guard let binary = education.detachedBinary else {
      throw ScienceAuthoringError.invalid(
        "education.detachedBinary", "a detached binary configuration")
    }
    let primary = try input(
      id: "star", kind: .star, star: binary.primary.star, path: "education.detachedBinary.primary")
    let secondary = try input(
      id: "companion", kind: .companion, star: binary.secondary.star,
      path: "education.detachedBinary.secondary")
    let relative = try relativeState(
      orbit: binary.relativeOrbit, totalMass: primary.mass + secondary.mass,
      at: education.epochSeconds, path: "education.detachedBinary.relativeOrbit")
    let (primaryState, secondaryState) = split(
      primary: primary, secondaryMass: secondary.mass, relative: relative)
    return [try body(primary, state: primaryState), try body(secondary, state: secondaryState)]
  }

  /// Selects the shortest compiled physical period so DOP853's maximum step cannot skip either orbit.
  private static func shortestPeriod(for education: EducationScenarioV4) throws -> Double {
    let periods: [Double]
    switch education.mode {
    case .generalLab:
      periods =
        [education.planet.orbit.periodSeconds]
        + (education.moon.map { [$0.orbit.periodSeconds] } ?? [])
    case .detachedBinaryLab:
      guard let binary = education.detachedBinary else {
        throw ScienceAuthoringError.invalid(
          "education.detachedBinary", "a detached binary configuration")
      }
      periods = [binary.relativeOrbit.periodSeconds]
    }
    let validated = try periods.map { try positive($0, "education.orbit.periodSeconds") }
    guard let shortest = validated.min() else {
      throw ScienceAuthoringError.invalid("education", "at least one supported orbit")
    }
    return shortest
  }

  /// Checks the V4 period against the Newtonian mass relation before using its static state.
  private static func relativeState(
    orbit: KeplerOrbit, totalMass: Double, at seconds: Double, path: String
  ) throws -> RelativeState {
    let semiMajor = try positive(orbit.semiMajorAxisMetres, "\(path).semiMajorAxisMetres")
    let mass = try positive(totalMass, "\(path).totalMass")
    let period = try positive(orbit.periodSeconds, "\(path).periodSeconds")
    guard orbit.eccentricity.isFinite, orbit.eccentricity >= 0, orbit.eccentricity < 1,
      orbit.inclinationRadians.isFinite, orbit.argumentOfPeriapsisRadians.isFinite,
      orbit.meanAnomalyAtEpochRadians.isFinite, seconds.isFinite
    else { throw ScienceAuthoringError.invalid(path, "finite bound-orbit elements") }
    let expected =
      2 * Double.pi * sqrt(pow(semiMajor, 3) / (ScienceLimits.gravitationalConstant * mass))
    guard expected.isFinite, abs(period - expected) / expected <= periodRelativeTolerance else {
      throw ScienceAuthoringError.invalid(
        path, "a period consistent with the two-body masses and semi-major axis")
    }
    let position = orbit.position(at: seconds)
    let velocity = orbit.velocity(at: seconds)
    try assertFinite(position, path: "\(path).position")
    try assertFinite(velocity, path: "\(path).velocity")
    return .init(position: position, velocity: velocity)
  }

  /// Creates a mass input after rejecting the V4 teaching defaults that do not define scientific mass.
  private static func input(id: String, kind: ScientificBodyKind, star: Star, path: String) throws
    -> BodyInput
  {
    try .init(
      id: id, kind: kind, mass: positive(star.massKilograms, "\(path).massKilograms"),
      radius: positive(star.radiusMetres, "\(path).radiusMetres"))
  }

  /// Creates a planet input from explicit SI authoring values.
  private static func input(id: String, kind: ScientificBodyKind, planet: Planet, path: String)
    throws -> BodyInput
  {
    try .init(
      id: id, kind: kind, mass: positive(planet.massKilograms, "\(path).massKilograms"),
      radius: positive(planet.radiusMetres, "\(path).radiusMetres"))
  }

  /// Creates a moon input from explicit SI authoring values.
  private static func input(id: String, kind: ScientificBodyKind, moon: Moon, path: String) throws
    -> BodyInput
  {
    try .init(
      id: id, kind: kind, mass: positive(moon.massKilograms, "\(path).massKilograms"),
      radius: positive(moon.radiusMetres, "\(path).radiusMetres"))
  }

  /// Splits a relative state around its barycentre, optionally translated by an outer subsystem state.
  private static func split(
    primary: BodyInput, secondaryMass: Double, relative: RelativeState,
    centre: RelativeState = .zero
  ) -> (RelativeState, RelativeState) {
    let total = primary.mass + secondaryMass
    let primaryFraction = secondaryMass / total
    let secondaryFraction = primary.mass / total
    return (
      centre.adding(relative.scaled(by: -primaryFraction)),
      centre.adding(relative.scaled(by: secondaryFraction))
    )
  }

  /// Constructs the serialized V5 body only after the caller has produced a barycentric state.
  private static func body(_ input: BodyInput, state: RelativeState) throws -> ScientificBodyV5 {
    ScientificBodyV5(
      id: input.id, kind: input.kind, massKg: input.mass, radiusM: input.radius,
      state: .init(
        positionM: try ScienceVector3(
          x: state.position.x, y: state.position.y, z: state.position.z),
        velocityMps: try ScienceVector3(
          x: state.velocity.x, y: state.velocity.y, z: state.velocity.z)))
  }

  /// Rejects malformed scalar authoring values before they reach scientific contract construction.
  private static func positive(_ value: Double, _ path: String) throws -> Double {
    guard value.isFinite, value > 0 else {
      throw ScienceAuthoringError.invalid(path, "a finite positive SI value")
    }
    return value
  }

  /// Ensures V4's unconstrained value types cannot inject a non-finite initial state.
  private static func assertFinite(_ vector: Vector3, path: String) throws {
    guard vector.x.isFinite, vector.y.isFinite, vector.z.isFinite else {
      throw ScienceAuthoringError.invalid(path, "finite Cartesian components")
    }
  }

  /// Retains validated physical identity before a barycentric state is assigned.
  private struct BodyInput {
    let id: String
    let kind: ScientificBodyKind
    let mass: Double
    let radius: Double
  }

  /// Pairs one Cartesian relative position and velocity during barycentric composition.
  private struct RelativeState {
    static let zero = Self(position: .zero, velocity: .zero)
    let position: Vector3
    let velocity: Vector3
    /// Scales both Cartesian components by the same barycentric mass fraction.
    func scaled(by factor: Double) -> Self {
      .init(position: position * factor, velocity: velocity * factor)
    }
    /// Translates both Cartesian components into an outer subsystem state.
    func adding(_ other: Self) -> Self {
      .init(position: position + other.position, velocity: velocity + other.velocity)
    }
  }
}
