// Defines SI-domain models and scenario inputs for the deterministic simulation kernel.
import Foundation

/// Enumerates the SI units used by the simulation's physical quantities.
public enum SIUnit: String, Codable, Sendable { case metres, seconds, kilograms, radians, watts }

/// Couples a finite scalar with its declared SI unit for interchange boundaries.
public struct SIValue: Codable, Sendable, Hashable {
  public let value: Double
  public let unit: SIUnit
  /// Creates a finite scalar carrying the supplied SI unit.
  public init(_ value: Double, unit: SIUnit) throws {
    guard value.isFinite else { throw ValidationError([.nonFinite(field: unit.rawValue)]) }
    self.value = value
    self.unit = unit
  }
}

/// Represents a Cartesian vector for orbital positions and velocities in SI units.
public struct Vector3: Codable, Sendable, Hashable {
  public var x: Double
  public var y: Double
  public var z: Double
  /// Creates a Cartesian vector from its three components.
  public init(x: Double, y: Double, z: Double) {
    self.x = x
    self.y = y
    self.z = z
  }
  public static let zero = Vector3(x: 0, y: 0, z: 0)
  public var length: Double { sqrt(x * x + y * y + z * z) }
  /// Adds corresponding components of two vectors.
  public static func + (lhs: Self, rhs: Self) -> Self {
    .init(x: lhs.x + rhs.x, y: lhs.y + rhs.y, z: lhs.z + rhs.z)
  }
  /// Subtracts corresponding components of two vectors.
  public static func - (lhs: Self, rhs: Self) -> Self {
    .init(x: lhs.x - rhs.x, y: lhs.y - rhs.y, z: lhs.z - rhs.z)
  }
  /// Scales each vector component by a scalar.
  public static func * (lhs: Self, rhs: Double) -> Self {
    .init(x: lhs.x * rhs, y: lhs.y * rhs, z: lhs.z * rhs)
  }
}

/// Stores the fixed Keplerian elements used by the deterministic teaching model.
public struct KeplerOrbit: Codable, Sendable, Hashable {
  public var semiMajorAxisMetres: Double
  public var periodSeconds: Double
  public var eccentricity: Double
  public var inclinationRadians: Double
  public var argumentOfPeriapsisRadians: Double
  public var meanAnomalyAtEpochRadians: Double
  /// Creates a Keplerian orbit from its SI elements and optional defaults.
  public init(
    semiMajorAxisMetres: Double, periodSeconds: Double, eccentricity: Double = 0,
    inclinationRadians: Double = .pi / 2, argumentOfPeriapsisRadians: Double = 0,
    meanAnomalyAtEpochRadians: Double = 0
  ) {
    self.semiMajorAxisMetres = semiMajorAxisMetres
    self.periodSeconds = periodSeconds
    self.eccentricity = eccentricity
    self.inclinationRadians = inclinationRadians
    self.argumentOfPeriapsisRadians = argumentOfPeriapsisRadians
    self.meanAnomalyAtEpochRadians = meanAnomalyAtEpochRadians
  }
  /// Solves the orbit at elapsed seconds to project its body into the observer frame.
  public func position(at seconds: Double) -> Vector3 {
    let mean = Self.wrap(meanAnomalyAtEpochRadians + 2 * .pi * seconds / periodSeconds)
    var eccentric = mean
    for _ in 0..<12 {
      eccentric -=
        (eccentric - eccentricity * sin(eccentric) - mean) / (1 - eccentricity * cos(eccentric))
    }
    let orbitalX = semiMajorAxisMetres * (cos(eccentric) - eccentricity)
    let orbitalY =
      semiMajorAxisMetres * sqrt(max(0, 1 - eccentricity * eccentricity)) * sin(eccentric)
    let angle = argumentOfPeriapsisRadians
    let x = orbitalX * cos(angle) - orbitalY * sin(angle)
    let y = orbitalX * sin(angle) + orbitalY * cos(angle)
    return Vector3(x: -y * cos(inclinationRadians), y: x, z: y * sin(inclinationRadians))
  }
  /// Returns observer-frame velocity, using an exact circular path for parity fixtures.
  public func velocity(at seconds: Double) -> Vector3 {
    let mean = Self.wrap(meanAnomalyAtEpochRadians + 2 * .pi * seconds / periodSeconds)
    let rate = 2 * .pi / periodSeconds
    if eccentricity == 0 {
      return Vector3(
        x: -semiMajorAxisMetres * cos(mean) * cos(inclinationRadians) * rate,
        y: -semiMajorAxisMetres * sin(mean) * rate,
        z: semiMajorAxisMetres * cos(mean) * sin(inclinationRadians) * rate)
    }
    let dt = min(0.01, periodSeconds * 1e-6)
    return (position(at: seconds + dt) - position(at: seconds - dt)) * (0.5 / dt)
  }
  /// Reduces an angle to one signed revolution remainder.
  static func wrap(_ value: Double) -> Double { value.truncatingRemainder(dividingBy: 2 * .pi) }
}

/// Defines the stellar physical and limb-darkening inputs for a scenario.
public struct Star: Codable, Sendable, Hashable {
  public var radiusMetres: Double
  public var massKilograms: Double
  public var limbDarkeningU1: Double
  public var limbDarkeningU2: Double
  /// Creates a star from its physical properties and limb-darkening coefficients.
  public init(
    radiusMetres: Double, massKilograms: Double, limbDarkeningU1: Double = 0.3,
    limbDarkeningU2: Double = 0.2
  ) {
    self.radiusMetres = radiusMetres
    self.massKilograms = massKilograms
    self.limbDarkeningU1 = limbDarkeningU1
    self.limbDarkeningU2 = limbDarkeningU2
  }
}

/// Defines the transiting planet and its fixed orbit around the scenario star.
public struct Planet: Codable, Sendable, Hashable {
  public var radiusMetres: Double
  public var massKilograms: Double
  public var orbit: KeplerOrbit
  /// Creates a planet with its physical properties and orbit.
  public init(radiusMetres: Double, massKilograms: Double = 0, orbit: KeplerOrbit) {
    self.radiusMetres = radiusMetres
    self.massKilograms = massKilograms
    self.orbit = orbit
  }
}

/// Defines an optional moon relative to the scenario planet.
public struct Moon: Codable, Sendable, Hashable {
  public var radiusMetres: Double
  public var massKilograms: Double
  public var orbit: KeplerOrbit
  /// Creates a moon with its physical properties and relative orbit.
  public init(radiusMetres: Double, massKilograms: Double = 0, orbit: KeplerOrbit) {
    self.radiusMetres = radiusMetres
    self.massKilograms = massKilograms
    self.orbit = orbit
  }
}

/// Selects the bounded local Education model encoded by the browser V4 scenario.
public enum EducationScenarioMode: String, Codable, Sendable, Hashable {
  case generalLab = "general-lab"
  case detachedBinaryLab = "detached-binary-lab"
}

/// Controls the learner-facing gates carried by a V4 detached-binary lab scenario.
public struct BinaryLabConfiguration: Codable, Sendable, Hashable {
  public var enabled: Bool
  public var hideSkyUntilReveal: Bool
  public var requireHypothesis: Bool
  public var lockParamsUntilHypothesis: Bool
  public static let `default` = Self(
    enabled: true, hideSkyUntilReveal: true, requireHypothesis: true,
    lockParamsUntilHypothesis: true)
  /// Creates detached-binary learner gates from their V4 settings.
  public init(
    enabled: Bool, hideSkyUntilReveal: Bool, requireHypothesis: Bool,
    lockParamsUntilHypothesis: Bool
  ) {
    self.enabled = enabled
    self.hideSkyUntilReveal = hideSkyUntilReveal
    self.requireHypothesis = requireHypothesis
    self.lockParamsUntilHypothesis = lockParamsUntilHypothesis
  }
}

/// Stores one luminous component of a portable detached binary.
public struct BinaryStar: Codable, Sendable, Hashable {
  public var identifier: String
  public var star: Star
  public var luminosityScale: Double
  /// Creates a luminous binary component with its identifier and scale.
  public init(identifier: String, star: Star, luminosityScale: Double) {
    self.identifier = identifier
    self.star = star
    self.luminosityScale = luminosityScale
  }
}

/// Defines the fixed two-star relative orbit used by the local detached-binary teaching model.
public struct DetachedBinary: Codable, Sendable, Hashable {
  public var primary: BinaryStar
  public var secondary: BinaryStar
  public var relativeOrbit: KeplerOrbit
  /// Creates a detached binary from its components and relative orbit.
  public init(primary: BinaryStar, secondary: BinaryStar, relativeOrbit: KeplerOrbit) {
    self.primary = primary
    self.secondary = secondary
    self.relativeOrbit = relativeOrbit
  }
}

/// Collects the bounded physical and rendering inputs for the education simulation.
public struct EducationScenarioV4: Codable, Sendable, Hashable {
  public var mode: EducationScenarioMode
  public var identifier: String
  public var epochSeconds: Double
  public var star: Star
  public var planet: Planet
  public var moon: Moon?
  public var gridResolution: Int
  public var planetPhase: PhaseCurve?
  public var moonPhase: PhaseCurve?
  public var detachedBinary: DetachedBinary?
  public var binaryLab: BinaryLabConfiguration?
  /// Creates an education scenario from its physical, photometric, and teaching inputs.
  public init(
    identifier: String = "education-default", epochSeconds: Double = 0, star: Star, planet: Planet,
    moon: Moon? = nil, gridResolution: Int = 220, planetPhase: PhaseCurve? = nil,
    moonPhase: PhaseCurve? = nil, mode: EducationScenarioMode = .generalLab,
    detachedBinary: DetachedBinary? = nil, binaryLab: BinaryLabConfiguration? = nil
  ) {
    self.mode = mode
    self.identifier = identifier
    self.epochSeconds = epochSeconds
    self.star = star
    self.planet = planet
    self.moon = moon
    self.gridResolution = gridResolution
    self.planetPhase = planetPhase
    self.moonPhase = moonPhase
    self.detachedBinary = detachedBinary
    self.binaryLab = binaryLab
  }
}

/// Selects the portable execution semantics encoded by the browser V4 runtime field.
public enum EducationRuntimeMode: String, Codable, Sendable, Hashable {
  case interactive = "realtime"
  case reference
}

/// Carries the bounded reference sampling configuration without changing the native scenario model.
public struct EducationRuntimeConfiguration: Sendable, Hashable {
  public static let defaultReferenceSubsteps = 5
  public static let maximumReferenceSubsteps = 25
  public let mode: EducationRuntimeMode
  public let referenceSubsteps: Int
  /// Creates runtime configuration with bounded reference sampling.
  public init(
    mode: EducationRuntimeMode = .interactive,
    referenceSubsteps: Int = Self.defaultReferenceSubsteps
  ) {
    self.mode = mode
    self.referenceSubsteps = min(max(referenceSubsteps, 1), Self.maximumReferenceSubsteps)
  }
}

/// Configures the simple reflected and thermal phase terms used by the teaching model.
public struct PhaseCurve: Codable, Sendable, Hashable {
  /// Selects the reflected-light phase weighting model.
  public enum ReflectedModel: String, Codable, Sendable, Hashable, CaseIterable {
    case lambert, cosine
  }
  /// Selects the thermal-emission phase weighting model.
  public enum ThermalModel: String, Codable, Sendable, Hashable, CaseIterable {
    case constant, lambert, cosine
  }
  public var enabled: Bool
  public var reflectedAmplitude: Double
  public var thermalAmplitude: Double
  public var lambertian: Bool
  public var reflectedOffsetRadians: Double
  public var thermalOffsetRadians: Double
  public var constantFlux: Double
  public var reflectedModel: ReflectedModel
  public var thermalModel: ThermalModel
  public var clampsWeights: Bool
  public var usesPhysicalScaling: Bool
  /// Creates a phase curve from its reflected, thermal, and weighting controls.
  public init(
    enabled: Bool, reflectedAmplitude: Double, thermalAmplitude: Double, lambertian: Bool = true,
    reflectedOffsetRadians: Double = 0, thermalOffsetRadians: Double = 0,
    constantFlux: Double = 0, reflectedModel: ReflectedModel = .lambert,
    thermalModel: ThermalModel = .constant, clampsWeights: Bool = true,
    usesPhysicalScaling: Bool = false
  ) {
    self.enabled = enabled
    self.reflectedAmplitude = reflectedAmplitude
    self.thermalAmplitude = thermalAmplitude
    self.lambertian = lambertian
    self.reflectedOffsetRadians = reflectedOffsetRadians
    self.thermalOffsetRadians = thermalOffsetRadians
    self.constantFlux = constantFlux
    self.reflectedModel = reflectedModel
    self.thermalModel = thermalModel
    self.clampsWeights = clampsWeights
    self.usesPhysicalScaling = usesPhysicalScaling
  }
}
