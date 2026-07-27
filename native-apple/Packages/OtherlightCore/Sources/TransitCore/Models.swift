// Defines SI-domain models, compatibility DTOs, validation errors, and simulation snapshots.
import Foundation

/// Enumerates the SI units used by the simulation's physical quantities.
public enum SIUnit: String, Codable, Sendable { case metres, seconds, kilograms, radians, watts }

/// Couples a finite scalar with its declared SI unit for interchange boundaries.
public struct SIValue: Codable, Sendable, Hashable {
  public let value: Double
  public let unit: SIUnit
  /// Creates a finite scalar at an interchange boundary so invalid quantities fail early.
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
  /// Creates a vector from its Cartesian components.
  public init(x: Double, y: Double, z: Double) {
    self.x = x
    self.y = y
    self.z = z
  }
  public static let zero = Vector3(x: 0, y: 0, z: 0)
  /// Returns the Euclidean magnitude used by phase and geometry calculations.
  public var length: Double { sqrt(x * x + y * y + z * z) }
  /// Adds like-coordinate vectors for orbital composition.
  public static func + (lhs: Self, rhs: Self) -> Self {
    .init(x: lhs.x + rhs.x, y: lhs.y + rhs.y, z: lhs.z + rhs.z)
  }
  /// Subtracts like-coordinate vectors to obtain a relative displacement.
  public static func - (lhs: Self, rhs: Self) -> Self {
    .init(x: lhs.x - rhs.x, y: lhs.y - rhs.y, z: lhs.z - rhs.z)
  }
  /// Scales a vector by a scalar, primarily for finite-difference velocity estimates.
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
  /// Creates an orbit using SI dimensions and radian angular elements.
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
    // Browser V4's observer frame has its unrotated circular orbit at (0, a, 0).
    return Vector3(x: -y * cos(inclinationRadians), y: x, z: y * sin(inclinationRadians))
  }
  /// Returns the observer-frame velocity, using an exact circular-orbit path for parity fixtures.
  public func velocity(at seconds: Double) -> Vector3 {
    let mean = Self.wrap(meanAnomalyAtEpochRadians + 2 * .pi * seconds / periodSeconds)
    let rate = 2 * .pi / periodSeconds
    // The active bounded parity fixtures are circular. This exact branch avoids
    // finite-difference drift in the browser interactive timing contract.
    if eccentricity == 0 {
      return Vector3(
        x: -semiMajorAxisMetres * cos(mean) * cos(inclinationRadians) * rate,
        y: -semiMajorAxisMetres * sin(mean) * rate,
        z: semiMajorAxisMetres * cos(mean) * sin(inclinationRadians) * rate)
    }
    let dt = min(0.01, periodSeconds * 1e-6)
    return (position(at: seconds + dt) - position(at: seconds - dt)) * (0.5 / dt)
  }
  /// Normalizes an angular value to a single signed revolution for Kepler iteration.
  static func wrap(_ value: Double) -> Double { value.truncatingRemainder(dividingBy: 2 * .pi) }
}

/// Defines the stellar physical and limb-darkening inputs for a scenario.
public struct Star: Codable, Sendable, Hashable {
  public var radiusMetres: Double
  public var massKilograms: Double
  public var limbDarkeningU1: Double
  public var limbDarkeningU2: Double
  /// Creates a star from SI radius and mass with quadratic limb-darkening coefficients.
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
  /// Creates a planet while retaining its SI dimensions and orbit.
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
  /// Creates a moon while retaining its SI dimensions and planet-relative orbit.
  public init(radiusMetres: Double, massKilograms: Double = 0, orbit: KeplerOrbit) {
    self.radiusMetres = radiusMetres
    self.massKilograms = massKilograms
    self.orbit = orbit
  }
}

/// Collects the bounded physical and rendering inputs for the education simulation.
public struct EducationScenarioV4: Codable, Sendable, Hashable {
  public var identifier: String
  public var epochSeconds: Double
  public var star: Star
  public var planet: Planet
  public var moon: Moon?
  public var gridResolution: Int
  public var planetPhase: PhaseCurve?
  public var moonPhase: PhaseCurve?
  /// Creates a scenario with stable identity and explicit optional phase behavior.
  public init(
    identifier: String = "education-default", epochSeconds: Double = 0, star: Star, planet: Planet,
    moon: Moon? = nil, gridResolution: Int = 220, planetPhase: PhaseCurve? = nil,
    moonPhase: PhaseCurve? = nil
  ) {
    self.identifier = identifier
    self.epochSeconds = epochSeconds
    self.star = star
    self.planet = planet
    self.moon = moon
    self.gridResolution = gridResolution
    self.planetPhase = planetPhase
    self.moonPhase = moonPhase
  }
}

/// Configures the simple reflected and thermal phase terms used by the teaching model.
public struct PhaseCurve: Codable, Sendable, Hashable {
  public var enabled: Bool
  public var reflectedAmplitude: Double
  public var thermalAmplitude: Double
  public var lambertian: Bool
  /// Creates a phase curve with independently configurable reflected and thermal amplitudes.
  public init(
    enabled: Bool, reflectedAmplitude: Double, thermalAmplitude: Double, lambertian: Bool = true
  ) {
    self.enabled = enabled
    self.reflectedAmplitude = reflectedAmplitude
    self.thermalAmplitude = thermalAmplitude
    self.lambertian = lambertian
  }
}

/// The bounded browser V4 input shape used by the active education fixtures.
/// Unknown browser fields are intentionally ignored; incompatible versions fail closed.
public struct BrowserV4ScenarioDTO: Codable, Sendable, Hashable {
  /// Mirrors the browser V4 orbit field names without changing their serialized contract.
  public struct OrbitDTO: Codable, Sendable, Hashable {
    public let a: Double
    public let e: Double
    public let inc: Double
    public let longitudeOfAscendingNode: Double
    public let omega: Double
    public let period: Double
    public let t0: Double
    /// Preserves browser V4's uppercase Omega key during Codable conversion.
    enum CodingKeys: String, CodingKey {
      case a, e, inc, omega, period, t0
      case longitudeOfAscendingNode = "Omega"
    }
  }
  /// Mirrors a browser V4 star record.
  public struct StarDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let luminosityScale: Double?
  }
  /// Mirrors a browser V4 planet record and its parent references.
  public struct PlanetDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let orbit: OrbitDTO
    public let parentStarId: String?
    public let parentSystem: String?
  }
  /// Mirrors a browser V4 moon record and its planet reference.
  public struct MoonDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let orbit: OrbitDTO
    public let parentPlanetId: String?
  }
  /// Groups browser V4 body arrays by physical kind.
  public struct BodiesDTO: Codable, Sendable, Hashable {
    public let stars: [StarDTO]
    public let planets: [PlanetDTO]
    public let moons: [MoonDTO]
  }
  /// Carries the two browser V4 quadratic limb-darkening coefficients.
  public struct LimbDarkeningDTO: Codable, Sendable, Hashable {
    public let u1: Double
    public let u2: Double
  }
  /// Retains the browser V4 default limb-darkening envelope.
  public struct LimbDarkeningModelDTO: Codable, Sendable, Hashable {
    public let `default`: LimbDarkeningDTO
  }
  /// Mirrors browser V4 phase-curve names for compatibility.
  public struct PhaseCurveDTO: Codable, Sendable, Hashable {
    public let enabled: Bool
    public let reflAmp: Double
    public let thermAmp: Double
    public let lambertian: Bool
  }
  /// Collects optional browser V4 photometry settings.
  public struct PhotometryDTO: Codable, Sendable, Hashable {
    public let gridRes: Int?
    public let limbDarkeningModel: LimbDarkeningModelDTO?
    public let phaseCurve: PhaseCurveDTO?
    public let moonPhaseCurve: PhaseCurveDTO?
  }
  /// Carries the browser V4 active-lesson selection.
  public struct DidacticsDTO: Codable, Sendable, Hashable { public let activeLessonId: String? }
  /// Mirrors browser V4 runtime metadata without interpreting it as native behavior.
  public struct RuntimeDTO: Codable, Sendable, Hashable {
    public let mode: String
    public let executionMode: String
    public let referenceSubsteps: Int?
  }
  /// Carries the browser V4 observer direction.
  public struct ObserverDTO: Codable, Sendable, Hashable {
    public let dir: Vector3
  }
  /// Represents one browser V4 parent-child body relationship.
  public struct HierarchyDTO: Codable, Sendable, Hashable {
    public let childId: String
    public let parentId: String
    public let relation: String
  }
  /// Groups browser V4 binary and hierarchy orbit metadata.
  public struct OrbitsDTO: Codable, Sendable, Hashable {
    public let binary: OrbitDTO
    public let hierarchy: [HierarchyDTO]
  }
  public let version: String
  public let mode: String
  public let runtime: RuntimeDTO?
  public let observer: ObserverDTO?
  public let bodies: BodiesDTO
  public let orbits: OrbitsDTO?
  public let photometry: PhotometryDTO?
  public let didactics: DidacticsDTO?
}

/// Converts the bounded browser V4 interchange envelope into native simulation inputs.
public enum BrowserV4Import {
  /// Converts the supported browser V4 DTO into the native model, defaulting only optional V4 fields.
  ///
  /// Unknown DTO fields are ignored by `Codable`; an unsupported version or missing star/planet
  /// fails validation rather than silently constructing a different physical system.
  public static func scenario(from dto: BrowserV4ScenarioDTO, identifier: String) throws
    -> EducationScenarioV4
  {
    guard dto.version == "4" else {
      throw ValidationError([
        .outOfRange(field: "version", value: Double(dto.version) ?? -.infinity)
      ])
    }
    guard let star = dto.bodies.stars.first, let planet = dto.bodies.planets.first else {
      throw ValidationError([.nonPositive(field: "bodies.stars/planets")])
    }
    /// Converts V4 orbital fields to the native SI orbit representation.
    func orbit(_ value: BrowserV4ScenarioDTO.OrbitDTO) -> KeplerOrbit {
      .init(
        semiMajorAxisMetres: value.a, periodSeconds: value.period, eccentricity: value.e,
        inclinationRadians: value.inc, argumentOfPeriapsisRadians: value.omega,
        meanAnomalyAtEpochRadians: -2 * .pi * value.t0 / value.period)
    }
    let limb = dto.photometry?.limbDarkeningModel?.default
    /// Converts optional V4 phase parameters without inventing a missing curve.
    func phase(_ value: BrowserV4ScenarioDTO.PhaseCurveDTO?) -> PhaseCurve? {
      value.map {
        .init(
          enabled: $0.enabled, reflectedAmplitude: $0.reflAmp, thermalAmplitude: $0.thermAmp,
          lambertian: $0.lambertian)
      }
    }
    return EducationScenarioV4(
      identifier: identifier,
      star: .init(
        radiusMetres: star.r, massKilograms: star.m, limbDarkeningU1: limb?.u1 ?? 0.3,
        limbDarkeningU2: limb?.u2 ?? 0.2),
      planet: .init(
        radiusMetres: planet.r, massKilograms: planet.m, orbit: orbit(planet.orbit)),
      moon: dto.bodies.moons.first.map {
        .init(radiusMetres: $0.r, massKilograms: $0.m, orbit: orbit($0.orbit))
      },
      gridResolution: dto.photometry?.gridRes ?? 220,
      planetPhase: phase(dto.photometry?.phaseCurve),
      moonPhase: phase(dto.photometry?.moonPhaseCurve))
  }
}

/// Encodes native scenarios into the browser V4 envelope for parity-sensitive consumers.
public enum BrowserV4Export {
  /// Encodes the currently accepted native Education scenario as a canonical browser V4 envelope.
  public static func scenario(from scenario: EducationScenarioV4, lessonID: String? = nil)
    -> BrowserV4ScenarioDTO
  {
    /// Converts native orbital elements while retaining V4's serialized field names.
    func orbit(_ value: KeplerOrbit) -> BrowserV4ScenarioDTO.OrbitDTO {
      .init(
        a: value.semiMajorAxisMetres, e: value.eccentricity,
        inc: value.inclinationRadians, longitudeOfAscendingNode: 0,
        omega: value.argumentOfPeriapsisRadians, period: value.periodSeconds,
        t0: -value.meanAnomalyAtEpochRadians * value.periodSeconds / (2 * .pi))
    }
    /// Converts an optional native phase curve without changing absent-curve semantics.
    func phase(_ value: PhaseCurve?) -> BrowserV4ScenarioDTO.PhaseCurveDTO? {
      value.map {
        .init(
          enabled: $0.enabled, reflAmp: $0.reflectedAmplitude,
          thermAmp: $0.thermalAmplitude, lambertian: $0.lambertian)
      }
    }
    let planetOrbit = orbit(scenario.planet.orbit)
    var hierarchy = [
      BrowserV4ScenarioDTO.HierarchyDTO(
        childId: "planet-1", parentId: "star-a", relation: "orbits")
    ]
    if scenario.moon != nil {
      hierarchy.append(
        .init(childId: "moon-1", parentId: "planet-1", relation: "orbits"))
    }
    return BrowserV4ScenarioDTO(
      version: "4",
      mode: "general-lab",
      runtime: .init(mode: "realtime", executionMode: "interactive", referenceSubsteps: 5),
      observer: .init(dir: .init(x: 0, y: 0, z: 1)),
      bodies: .init(
        stars: [
          .init(
            id: "star-a", r: scenario.star.radiusMetres, m: scenario.star.massKilograms,
            luminosityScale: 1),
          .init(
            id: "star-b", r: scenario.star.radiusMetres, m: 0,
            luminosityScale: 0),
        ],
        planets: [
          .init(
            id: "planet-1", r: scenario.planet.radiusMetres,
            m: scenario.planet.massKilograms, orbit: planetOrbit,
            parentStarId: "star-a", parentSystem: "star")
        ],
        moons: scenario.moon.map {
          [
            .init(
              id: "moon-1", r: $0.radiusMetres, m: $0.massKilograms,
              orbit: orbit($0.orbit), parentPlanetId: "planet-1")
          ]
        } ?? []),
      orbits: .init(binary: planetOrbit, hierarchy: hierarchy),
      photometry: .init(
        gridRes: scenario.gridResolution,
        limbDarkeningModel: .init(
          default: .init(
            u1: scenario.star.limbDarkeningU1, u2: scenario.star.limbDarkeningU2)),
        phaseCurve: phase(scenario.planetPhase), moonPhaseCurve: phase(scenario.moonPhase)),
      didactics: .init(activeLessonId: lessonID))
  }
}

/// Mirrors a compact real-system catalogue snapshot before its values are converted to SI units.
public struct RealSystemSnapshotDTO: Codable, Sendable, Hashable {
  /// Mirrors one real-system catalogue entry and its source units.
  public struct SystemDTO: Codable, Sendable, Hashable {
    public let id: String
    public let label: String
    public let starRadiusSolar: Double
    public let semiMajorAxisAu: Double
    public let periodDays: Double
    public let planetRadiusJupiter: Double
    public let starMassSolar: Double?
    public let eccentricity: Double?
    public let inclinationDeg: Double?
  }
  public let systems: [SystemDTO]
}

/// Converts real-system catalogue units into a native education scenario.
public enum RealSystemSnapshotImport {
  /// Converts catalog-scale solar, AU, day, and Jupiter-radius values to the engine's SI scenario.
  ///
  /// Optional catalog mass, eccentricity, and inclination receive documented neutral defaults;
  /// malformed or non-physical results are later rejected by `SimulationEngine` validation.
  public static func scenario(from system: RealSystemSnapshotDTO.SystemDTO) throws
    -> EducationScenarioV4
  {
    let solarRadius = 6.957e8
    let solarMass = 1.98847e30
    let au = 1.495978707e11
    let jupiterRadius = 7.1492e7
    return EducationScenarioV4(
      identifier: system.id,
      star: .init(
        radiusMetres: system.starRadiusSolar * solarRadius,
        massKilograms: (system.starMassSolar ?? 1) * solarMass),
      planet: .init(
        radiusMetres: system.planetRadiusJupiter * jupiterRadius,
        orbit: .init(
          semiMajorAxisMetres: system.semiMajorAxisAu * au,
          periodSeconds: system.periodDays * 86_400, eccentricity: system.eccentricity ?? 0,
          inclinationRadians: (system.inclinationDeg ?? 90) * .pi / 180)))
  }
}

/// Enumerates validation failures so callers can present every rejected physical input together.
public enum ValidationIssue: Codable, Sendable, Hashable, Error {
  case nonFinite(field: String)
  case nonPositive(field: String)
  case outOfRange(field: String, value: Double)
  case invalidIdentifier
}
/// Wraps one or more validation issues for throwing at model and simulation boundaries.
public struct ValidationError: Error, Sendable, LocalizedError {
  public let issues: [ValidationIssue]
  /// Creates an error that retains all discovered validation issues.
  public init(_ issues: [ValidationIssue]) { self.issues = issues }
  /// Joins the individual validation issues for localized error presentation.
  public var errorDescription: String? {
    issues.map { String(describing: $0) }.joined(separator: "; ")
  }
}

/// Names a simulated body and its sky-plane position for rendering.
public struct SkyPoint: Codable, Sendable, Hashable {
  public var body: String
  public var position: Vector3
  /// Creates a render point from a stable body name and observer-frame position.
  public init(body: String, position: Vector3) {
    self.body = body
    self.position = position
  }
}
/// Stores calculated and observed-minus-calculated timing information for one transit index.
public struct TransitTimingSignal: Codable, Sendable, Hashable {
  public var transitNumber: Int
  public var calculatedSeconds: Double
  public var observedMinusCalculatedSeconds: Double
  /// Creates the timing signal used by O-C visualizations.
  public init(transitNumber: Int, calculatedSeconds: Double, observedMinusCalculatedSeconds: Double)
  {
    self.transitNumber = transitNumber
    self.calculatedSeconds = calculatedSeconds
    self.observedMinusCalculatedSeconds = observedMinusCalculatedSeconds
  }
}
/// Holds optional contact and center times for planet and moon transits.
public struct TransitTimingDiagnostics: Codable, Sendable, Hashable {
  public var planetTransitCenterSec: Double?
  public var planetTransitDurationSec: Double?
  public var planetIngressSec: Double?
  public var planetEgressSec: Double?
  public var moonTransitCenterSec: Double?
  public var moonTransitDurationSec: Double?
  public var moonIngressSec: Double?
  public var moonEgressSec: Double?
  /// Starts with unavailable diagnostics until an observable transit is found.
  public init() {}
}
/// Breaks total flux into transit and phase contributions for explanation and plotting.
public struct FluxComponents: Codable, Sendable, Hashable {
  public var total: Double
  public var transitFactor: Double
  public var stellarPreTransit: Double
  public var planetPhase: Double
  public var moonPhase: Double
  /// Creates an explicit flux decomposition for a simulation step.
  public init(
    total: Double, transitFactor: Double, stellarPreTransit: Double, planetPhase: Double,
    moonPhase: Double
  ) {
    self.total = total
    self.transitFactor = transitFactor
    self.stellarPreTransit = stellarPreTransit
    self.planetPhase = planetPhase
    self.moonPhase = moonPhase
  }
}
/// Describes one named rendering condition for presentation layers.
public struct RenderEvent: Codable, Sendable, Hashable {
  public let id: String
  public let kind: String
  public let label: String
  public let active: Bool
  /// Creates an event with stable identity and learner-facing label.
  public init(id: String, kind: String, label: String, active: Bool) {
    self.id = id
    self.kind = kind
    self.label = label
    self.active = active
  }
}
/// Provides normalized phase, occultation, and event signals for view layers.
public struct RenderSignals: Codable, Sendable, Hashable {
  public var phase: Double
  public var dayNightFraction: Double
  public var occultedFraction: Double
  public var events: [RenderEvent]
  /// Creates the presentation signals for a step with optional active events.
  public init(
    phase: Double, dayNightFraction: Double, occultedFraction: Double, events: [RenderEvent] = []
  ) {
    self.phase = phase
    self.dayNightFraction = dayNightFraction
    self.occultedFraction = occultedFraction
    self.events = events
  }
}
/// Captures the complete simulation snapshot consumed by education and visualization modules.
public struct EducationStep: Codable, Sendable, Hashable {
  public var timeSeconds: Double
  public var skyPoints: [SkyPoint]
  public var flux: Double
  public var fluxComponents: FluxComponents
  public var timing: TransitTimingSignal
  public var transitTiming: TransitTimingDiagnostics
  public var renderSignals: RenderSignals
  public var warnings: [String]
  /// Creates a step while preserving legacy flux-only callers with a derived decomposition.
  public init(
    timeSeconds: Double, skyPoints: [SkyPoint], flux: Double, fluxComponents: FluxComponents? = nil,
    timing: TransitTimingSignal, transitTiming: TransitTimingDiagnostics = .init(),
    renderSignals: RenderSignals, warnings: [String]
  ) {
    self.timeSeconds = timeSeconds
    self.skyPoints = skyPoints
    self.flux = flux
    self.fluxComponents =
      fluxComponents
      ?? .init(total: flux, transitFactor: flux, stellarPreTransit: 1, planetPhase: 0, moonPhase: 0)
    self.timing = timing
    self.transitTiming = transitTiming
    self.renderSignals = renderSignals
    self.warnings = warnings
  }
}
