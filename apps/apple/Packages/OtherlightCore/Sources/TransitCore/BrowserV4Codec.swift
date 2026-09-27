// Converts between Browser V4 envelopes and accepted native scenario models.
import Foundation

/// Converts the bounded browser V4 interchange envelope into native simulation inputs.
public enum BrowserV4Import {
  /// Reads the V4 runtime selection while preserving the native app's local execution boundary.
  public static func runtimeConfiguration(
    from dto: BrowserV4ScenarioDTO
  ) -> EducationRuntimeConfiguration {
    .init(
      mode: dto.runtime?.mode == EducationRuntimeMode.reference.rawValue
        ? .reference : .interactive,
      referenceSubsteps: dto.runtime?.referenceSubsteps
        ?? EducationRuntimeConfiguration.defaultReferenceSubsteps)
  }

  /// Converts the supported browser V4 DTO into the native model, defaulting only optional V4 fields.
  public static func scenario(from dto: BrowserV4ScenarioDTO, identifier: String) throws
    -> EducationScenarioV4
  {
    guard dto.version == "4" else {
      throw ValidationError([
        .outOfRange(field: "version", value: Double(dto.version) ?? -.infinity)
      ])
    }
    guard let mode = EducationScenarioMode(rawValue: dto.mode) else {
      throw ValidationError([.nonPositive(field: "mode")])
    }
    guard let star = dto.bodies.stars.first else {
      throw ValidationError([.nonPositive(field: "bodies.stars")])
    }
    let limb = dto.photometry?.limbDarkeningModel?.default
    if mode == .detachedBinaryLab {
      return try detachedBinaryScenario(
        dto, identifier: identifier, star: star, limb: limb)
    }
    guard let planet = dto.bodies.planets.first else {
      throw ValidationError([.nonPositive(field: "bodies.planets")])
    }
    let scenario = EducationScenarioV4(
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
    return try validated(scenario)
  }

  /// Converts V4 orbit fields to the native SI orbit representation.
  static func orbit(_ value: BrowserV4ScenarioDTO.OrbitDTO) -> KeplerOrbit {
    .init(
      semiMajorAxisMetres: value.a, periodSeconds: value.period, eccentricity: value.e,
      inclinationRadians: value.inc, argumentOfPeriapsisRadians: value.omega,
      meanAnomalyAtEpochRadians: -2 * .pi * value.t0 / value.period)
  }

  /// Converts optional V4 phase parameters without inventing a missing curve.
  static func phase(_ value: BrowserV4ScenarioDTO.PhaseCurveDTO?) -> PhaseCurve? {
    value.map {
      .init(
        enabled: $0.enabled ?? false, reflectedAmplitude: $0.reflAmp ?? 0,
        thermalAmplitude: $0.thermAmp ?? 0, lambertian: $0.lambertian ?? false,
        reflectedOffsetRadians: $0.reflOffset ?? 0, thermalOffsetRadians: $0.thermOffset ?? 0,
        constantFlux: $0.constant ?? 0,
        reflectedModel: PhaseCurve.ReflectedModel(rawValue: $0.reflModel ?? "")
          ?? (($0.lambertian ?? false) ? .lambert : .cosine),
        thermalModel: PhaseCurve.ThermalModel(rawValue: $0.thermalModel ?? "") ?? .constant,
        clampsWeights: $0.clamp ?? true, usesPhysicalScaling: $0.physicalScaling ?? false)
    }
  }

  /// Converts the detached-binary V4 branch without allowing general-lab defaults to leak in.
  static func detachedBinaryScenario(
    _ dto: BrowserV4ScenarioDTO, identifier: String, star: BrowserV4ScenarioDTO.StarDTO,
    limb: BrowserV4ScenarioDTO.LimbDarkeningDTO?
  ) throws -> EducationScenarioV4 {
    guard let secondary = dto.bodies.stars.dropFirst().first,
      let binaryOrbit = dto.orbits?.binary,
      let binaryLab = dto.binaryLab
    else {
      throw ValidationError([.nonPositive(field: "bodies.stars/orbits.binary/binaryLab")])
    }
    let primary = BinaryStar(
      identifier: star.id,
      star: .init(
        radiusMetres: star.r, massKilograms: star.m, limbDarkeningU1: limb?.u1 ?? 0.3,
        limbDarkeningU2: limb?.u2 ?? 0.2), luminosityScale: star.luminosityScale ?? 1)
    let companion = BinaryStar(
      identifier: secondary.id,
      star: .init(
        radiusMetres: secondary.r, massKilograms: secondary.m,
        limbDarkeningU1: limb?.u1 ?? 0.3, limbDarkeningU2: limb?.u2 ?? 0.2),
      luminosityScale: secondary.luminosityScale ?? 0.3)
    let scenario = EducationScenarioV4(
      identifier: identifier, star: primary.star,
      planet: .init(radiusMetres: 1, orbit: orbit(binaryOrbit)),
      gridResolution: dto.photometry?.gridRes ?? 220, mode: .detachedBinaryLab,
      detachedBinary: .init(
        primary: primary, secondary: companion, relativeOrbit: orbit(binaryOrbit)),
      binaryLab: .init(
        enabled: binaryLab.enabled, hideSkyUntilReveal: binaryLab.hideSkyUntilReveal,
        requireHypothesis: binaryLab.requireHypothesis,
        lockParamsUntilHypothesis: binaryLab.lockParamsUntilHypothesis))
    return try validated(scenario)
  }

  /// Throws every ordered model validation issue before a decoded scenario can replace state.
  static func validated(_ scenario: EducationScenarioV4) throws -> EducationScenarioV4 {
    let issues = SimulationEngine.validate(scenario)
    guard issues.isEmpty else { throw ValidationError(issues) }
    return scenario
  }
}

/// Encodes native scenarios into the browser V4 envelope for parity-sensitive consumers.
public enum BrowserV4Export {
  /// Encodes the currently accepted native Education scenario as a canonical browser V4 envelope.
  public static func scenario(
    from scenario: EducationScenarioV4, lessonID: String? = nil,
    runtime: EducationRuntimeConfiguration = .init()
  ) -> BrowserV4ScenarioDTO {
    if let binary = scenario.detachedBinary {
      return detachedBinaryDTO(binary, scenario: scenario, lessonID: lessonID, runtime: runtime)
    }
    let planetOrbit = orbit(scenario.planet.orbit)
    var hierarchy = [
      BrowserV4ScenarioDTO.HierarchyDTO(
        childId: "planet-1", parentId: "star-a", relation: "orbits")
    ]
    if scenario.moon != nil {
      hierarchy.append(.init(childId: "moon-1", parentId: "planet-1", relation: "orbits"))
    }
    return BrowserV4ScenarioDTO(
      version: "4", mode: "general-lab", runtime: runtimeDTO(runtime),
      observer: .init(dir: .init(x: 0, y: 0, z: 1)),
      bodies: .init(
        stars: [
          .init(
            id: "star-a", r: scenario.star.radiusMetres, m: scenario.star.massKilograms,
            luminosityScale: 1),
          .init(id: "star-b", r: scenario.star.radiusMetres, m: 0, luminosityScale: 0),
        ],
        planets: [
          .init(
            id: "planet-1", r: scenario.planet.radiusMetres, m: scenario.planet.massKilograms,
            orbit: planetOrbit, parentStarId: "star-a", parentSystem: "star")
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
      didactics: .init(activeLessonId: lessonID), binaryLab: nil)
  }

  /// Converts native orbital elements while retaining V4's serialized field names.
  static func orbit(_ value: KeplerOrbit) -> BrowserV4ScenarioDTO.OrbitDTO {
    .init(
      a: value.semiMajorAxisMetres, e: value.eccentricity, inc: value.inclinationRadians,
      longitudeOfAscendingNode: 0, omega: value.argumentOfPeriapsisRadians,
      period: value.periodSeconds,
      t0: -value.meanAnomalyAtEpochRadians * value.periodSeconds / (2 * .pi))
  }

  /// Converts an optional native phase curve without changing absent-curve semantics.
  static func phase(_ value: PhaseCurve?) -> BrowserV4ScenarioDTO.PhaseCurveDTO? {
    value.map {
      .init(
        enabled: $0.enabled, reflAmp: $0.reflectedAmplitude, thermAmp: $0.thermalAmplitude,
        reflOffset: $0.reflectedOffsetRadians, thermOffset: $0.thermalOffsetRadians,
        constant: $0.constantFlux, reflModel: $0.reflectedModel.rawValue,
        thermalModel: $0.thermalModel.rawValue, lambertian: $0.lambertian,
        clamp: $0.clampsWeights, physicalScaling: $0.usesPhysicalScaling)
    }
  }

  /// Encodes a detached binary without manufacturing general-lab planets or moons.
  static func detachedBinaryDTO(
    _ binary: DetachedBinary, scenario: EducationScenarioV4, lessonID: String?,
    runtime: EducationRuntimeConfiguration
  ) -> BrowserV4ScenarioDTO {
    BrowserV4ScenarioDTO(
      version: "4", mode: EducationScenarioMode.detachedBinaryLab.rawValue,
      runtime: runtimeDTO(runtime), observer: .init(dir: .init(x: 0, y: 0, z: 1)),
      bodies: .init(
        stars: [
          .init(
            id: binary.primary.identifier, r: binary.primary.star.radiusMetres,
            m: binary.primary.star.massKilograms, luminosityScale: binary.primary.luminosityScale),
          .init(
            id: binary.secondary.identifier, r: binary.secondary.star.radiusMetres,
            m: binary.secondary.star.massKilograms,
            luminosityScale: binary.secondary.luminosityScale),
        ], planets: [], moons: []),
      orbits: .init(binary: orbit(binary.relativeOrbit), hierarchy: []),
      photometry: .init(
        gridRes: scenario.gridResolution,
        limbDarkeningModel: .init(
          default: .init(
            u1: binary.primary.star.limbDarkeningU1, u2: binary.primary.star.limbDarkeningU2)),
        phaseCurve: nil, moonPhaseCurve: nil),
      didactics: .init(activeLessonId: lessonID),
      binaryLab: .init(
        enabled: scenario.binaryLab?.enabled ?? true,
        hideSkyUntilReveal: scenario.binaryLab?.hideSkyUntilReveal ?? true,
        requireHypothesis: scenario.binaryLab?.requireHypothesis ?? true,
        lockParamsUntilHypothesis: scenario.binaryLab?.lockParamsUntilHypothesis ?? true))
  }

  /// Projects native runtime settings to the Browser V4 metadata envelope.
  static func runtimeDTO(_ runtime: EducationRuntimeConfiguration)
    -> BrowserV4ScenarioDTO.RuntimeDTO
  {
    .init(
      mode: runtime.mode.rawValue, executionMode: "interactive",
      referenceSubsteps: runtime.referenceSubsteps)
  }
}
