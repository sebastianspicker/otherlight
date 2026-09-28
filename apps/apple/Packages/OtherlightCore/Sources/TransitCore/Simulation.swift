// Implements the simplified orbital, photometric, and transit-timing simulation kernel.
import Foundation

/// Computes the overlap of two circular sky-plane silhouettes in square input units.
public enum CircularOccultation {
  /// Returns zero for invalid or disjoint geometry and uses the exact two-circle intersection otherwise.
  public static func overlapArea(radius first: Double, _ second: Double, separation: Double)
    -> Double
  {
    guard first > 0, second > 0, separation >= 0 else { return 0 }
    if separation >= first + second { return 0 }
    if separation <= abs(first - second) { return .pi * min(first, second) * min(first, second) }
    let a = acos(
      max(
        -1,
        min(
          1, (separation * separation + first * first - second * second) / (2 * separation * first))
      ))
    let b = acos(
      max(
        -1,
        min(
          1, (separation * separation + second * second - first * first) / (2 * separation * second)
        )))
    let radicand = max(
      0,
      (-separation + first + second) * (separation + first - second) * (separation - first + second)
        * (separation + first + second))
    return first * first * a + second * second * b - 0.5 * sqrt(radicand)
  }
}

/// Evaluates the normalized quadratic stellar limb-darkening approximation.
public enum QuadraticLimbDarkening {
  /// Clamps `mu` and the resulting intensity to the visible stellar disk's physical range.
  public static func intensity(mu: Double, u1: Double, u2: Double) -> Double {
    let x = 1 - max(0, min(1, mu))
    return max(0, 1 - u1 * x - u2 * x * x)
  }
}

/// Produces educational transit snapshots from Keplerian sky-plane geometry in SI units.
///
/// The engine uses fixed Kepler orbits, a sampled limb-darkened stellar disk, circular opaque
/// occulters, and additive phase terms. It intentionally omits N-body evolution and detailed
/// radiative transfer so results stay deterministic and responsive for the teaching workspace.
public struct SimulationEngine: Sendable {
  public let scenario: EducationScenarioV4

  /// Validates the scenario before accepting it; invalid physical inputs throw `ValidationError`.
  public init(scenario: EducationScenarioV4) throws {
    let issues = Self.validate(scenario)
    guard issues.isEmpty else { throw ValidationError(issues) }
    self.scenario = scenario
  }

  /// Evaluates positions, flux components, and timing diagnostics at an absolute SI time in seconds.
  public mutating func step(at timeSeconds: Double) throws -> EducationStep {
    guard timeSeconds.isFinite else { throw ValidationError([.nonFinite(field: "timeSeconds")]) }
    let elapsed = timeSeconds - scenario.epochSeconds
    if let binary = scenario.detachedBinary {
      return binaryStep(binary, elapsed: elapsed, at: timeSeconds)
    }
    let planet = scenario.planet.orbit.position(at: elapsed)
    let planetVelocity = scenario.planet.orbit.velocity(at: elapsed)
    var points = [SkyPoint(body: "planet", position: planet)]
    var occluders = [(position: planet, radius: scenario.planet.radiusMetres)]
    var moonPosition: Vector3?
    var moonVelocity: Vector3?
    if let moon = scenario.moon {
      moonPosition = planet + moon.orbit.position(at: elapsed)
      moonVelocity = planetVelocity + moon.orbit.velocity(at: elapsed)
      points.append(SkyPoint(body: "moon", position: moonPosition!))
      occluders.append((moonPosition!, moon.radiusMetres))
    }

    let transitFactor = limbDarkenedUnionFlux(occluders)
    let planetPhase = phaseFlux(scenario.planetPhase, at: planet)
    let moonPhase = moonPosition.map { phaseFlux(scenario.moonPhase, at: $0) } ?? 0
    let total = transitFactor + planetPhase + moonPhase
    let diagnostics = timingDiagnostics(
      at: timeSeconds, planet: planet, planetVelocity: planetVelocity, moon: moonPosition,
      moonVelocity: moonVelocity)
    let timingAvailable =
      diagnostics.planetTransitCenterSec != nil || diagnostics.moonTransitCenterSec != nil
    let events = [
      RenderEvent(
        id: "transit", kind: "transit", label: "Transit attenuation active",
        active: transitFactor < 0.999999),
      RenderEvent(id: "mutual", kind: "mutual-event", label: "Mutual event active", active: false),
      RenderEvent(
        id: "timing-correction", kind: "timing", label: "Timing diagnostics available",
        active: timingAvailable),
      RenderEvent(id: "conjunction", kind: "conjunction", label: "Conjunction", active: false),
    ]
    let period = scenario.planet.orbit.periodSeconds
    let transitNumber = Int((elapsed / period).rounded())
    let phase = (elapsed / period).truncatingRemainder(dividingBy: 1)
    let oc =
      moonPosition.map {
        $0.x / max(1, scenario.planet.orbit.semiMajorAxisMetres) * period / (2 * .pi) * 0.01
      } ?? 0
    return EducationStep(
      timeSeconds: timeSeconds, skyPoints: points, flux: total,
      fluxComponents: .init(
        total: total, transitFactor: transitFactor, stellarPreTransit: 1, planetPhase: planetPhase,
        moonPhase: moonPhase),
      timing: .init(
        transitNumber: transitNumber,
        calculatedSeconds: scenario.epochSeconds + Double(transitNumber) * period,
        observedMinusCalculatedSeconds: oc), transitTiming: diagnostics,
      renderSignals: .init(
        phase: phase < 0 ? phase + 1 : phase, dayNightFraction: 0.5 * (1 + cos(2 * .pi * phase)),
        occultedFraction: 1 - transitFactor, events: events), warnings: [])
  }

  /// Evaluates independent snapshots for each absolute SI time in seconds.
  public mutating func sample(times: [Double]) throws -> [EducationStep] {
    try times.map { try step(at: $0) }
  }

  /// Evaluates barycentric star positions and normalized luminous-disk overlap for a detached binary.
  private func binaryStep(_ binary: DetachedBinary, elapsed: Double, at timeSeconds: Double)
    -> EducationStep
  {
    let totalMass = binary.primary.star.massKilograms + binary.secondary.star.massKilograms
    let relative = binary.relativeOrbit.position(at: elapsed)
    let primary = relative * (-binary.secondary.star.massKilograms / totalMass)
    let secondary = relative * (binary.primary.star.massKilograms / totalMass)
    let primaryVisible = binaryVisibleFlux(
      source: binary.primary, position: primary, foreground: binary.secondary,
      foregroundPosition: secondary)
    let secondaryVisible = binaryVisibleFlux(
      source: binary.secondary, position: secondary, foreground: binary.primary,
      foregroundPosition: primary)
    let baseline = binary.primary.luminosityScale + binary.secondary.luminosityScale
    let visible = primaryVisible + secondaryVisible
    let normalized = baseline > 0 ? visible / baseline : 1
    let phase = (elapsed / binary.relativeOrbit.periodSeconds).truncatingRemainder(dividingBy: 1)
    return EducationStep(
      timeSeconds: timeSeconds,
      skyPoints: [
        .init(body: binary.primary.identifier, position: primary),
        .init(body: binary.secondary.identifier, position: secondary),
      ], flux: normalized,
      fluxComponents: .init(
        total: normalized, transitFactor: normalized, stellarPreTransit: baseline, planetPhase: 0,
        moonPhase: 0),
      timing: .init(
        transitNumber: Int((elapsed / binary.relativeOrbit.periodSeconds).rounded()),
        calculatedSeconds: timeSeconds, observedMinusCalculatedSeconds: 0),
      renderSignals: .init(
        phase: phase < 0 ? phase + 1 : phase, dayNightFraction: 0, occultedFraction: 1 - normalized,
        events: [
          .init(
            id: "binary-eclipse", kind: "binary-eclipse", label: "Binary eclipse active",
            active: normalized < 0.999999)
        ]),
      warnings: [])
  }

  /// Integrates the source disk once, masking it only when the other luminous star is in front.
  private func binaryVisibleFlux(
    source: BinaryStar, position: Vector3, foreground: BinaryStar, foregroundPosition: Vector3
  ) -> Double {
    guard source.luminosityScale > 0 else { return 0 }
    guard foregroundPosition.z > position.z else { return source.luminosityScale }
    let resolution = max(1, min(512, scenario.gridResolution))
    let radius = source.star.radiusMetres
    let dy = 2 * radius / Double(resolution)
    var total = 0.0
    var visible = 0.0
    for iy in 0..<resolution {
      let y = -radius + (Double(iy) + 0.5) * dy
      let xMax = sqrt(max(0, radius * radius - y * y))
      let dx = 2 * xMax / Double(resolution)
      for ix in 0..<resolution {
        let x = -xMax + (Double(ix) + 0.5) * dx
        let mu = sqrt(max(0, 1 - (x * x + y * y) / (radius * radius)))
        let weight =
          QuadraticLimbDarkening.intensity(
            mu: mu, u1: source.star.limbDarkeningU1, u2: source.star.limbDarkeningU2) * dx * dy
        total += weight
        let dxForeground = position.x + x - foregroundPosition.x
        let dyForeground = position.y + y - foregroundPosition.y
        if dxForeground * dxForeground + dyForeground * dyForeground >= foreground.star.radiusMetres
          * foreground.star.radiusMetres
        {
          visible += weight
        }
      }
    }
    return source.luminosityScale * (total > 0 ? visible / total : 1)
  }

  /// Samples the stellar disk once so overlapping occulters do not double-count blocked flux.
  private func limbDarkenedUnionFlux(_ input: [(position: Vector3, radius: Double)]) -> Double {
    let star = scenario.star
    let radius = star.radiusMetres
    let occulters = input.filter {
      $0.position.z > 0 && hypot($0.position.x, $0.position.y) < radius + $0.radius
    }
    guard !occulters.isEmpty else { return 1 }
    let resolution = max(1, min(1024, scenario.gridResolution))
    let dy = 2 * radius / Double(resolution)
    let r2 = radius * radius
    var total = 0.0
    var blocked = 0.0
    for iy in 0..<resolution {
      let y = -radius + (Double(iy) + 0.5) * dy
      let y2 = y * y
      let xMax = sqrt(max(0, r2 - y2))
      let dx = 2 * xMax / Double(resolution)
      let area = dx * dy
      for ix in 0..<resolution {
        let x = -xMax + (Double(ix) + 0.5) * dx
        let mu = sqrt(max(0, 1 - (x * x + y2) / r2))
        let intensity = QuadraticLimbDarkening.intensity(
          mu: mu, u1: star.limbDarkeningU1, u2: star.limbDarkeningU2)
        let weighted = intensity * area
        total += weighted
        if occulters.contains(where: {
          let dx = x - $0.position.x
          let dy = y - $0.position.y
          return dx * dx + dy * dy < $0.radius * $0.radius
        }) {
          blocked += weighted
        }
      }
    }
    return min(1, max(0, 1 - blocked / total))
  }

  /// Calculates the configured reflected and thermal phase contribution at a sky position.
  private func phaseFlux(_ curve: PhaseCurve?, at position: Vector3) -> Double {
    guard let curve, curve.enabled else { return 0 }
    let alpha = acos(max(-1, min(1, -position.z / max(position.length, .leastNonzeroMagnitude))))
    let reflectedAlpha = min(max(alpha - curve.reflectedOffsetRadians, 0), .pi)
    let thermalAlpha = min(max(alpha - curve.thermalOffsetRadians, 0), .pi)
    let reflected = phaseWeight(at: reflectedAlpha, model: curve.reflectedModel)
    let thermal = phaseWeight(at: thermalAlpha, model: curve.thermalModel)
    return max(
      0,
      curve.reflectedAmplitude * reflected + curve.thermalAmplitude * thermal + curve.constantFlux)
  }

  /// Evaluates the portable V4 phase weights after an optional phenomenological offset.
  private func phaseWeight(at alpha: Double, model: PhaseCurve.ReflectedModel) -> Double {
    switch model {
    case .lambert: (sin(alpha) + (.pi - alpha) * cos(alpha)) / .pi
    case .cosine: (1 + cos(alpha)) / 2
    }
  }

  /// Evaluates the portable thermal phase weights, including isotropic emission.
  private func phaseWeight(at alpha: Double, model: PhaseCurve.ThermalModel) -> Double {
    switch model {
    case .constant: 1
    case .lambert: phaseWeight(at: alpha, model: PhaseCurve.ReflectedModel.lambert)
    case .cosine: phaseWeight(at: alpha, model: PhaseCurve.ReflectedModel.cosine)
    }
  }

  /// Solves a linearized transit center and contacts when the body crosses the stellar disk.
  private func event(at time: Double, position: Vector3, velocity: Vector3, radius: Double) -> (
    Double, Double, Double, Double
  )? {
    let speed2 = velocity.x * velocity.x + velocity.y * velocity.y
    guard speed2 > 0 else { return nil }
    let dt = -(position.x * velocity.x + position.y * velocity.y) / speed2
    let x = position.x + velocity.x * dt
    let y = position.y + velocity.y * dt
    let z = position.z + velocity.z * dt
    let impact = hypot(x, y)
    let sum = scenario.star.radiusMetres + radius
    guard impact < sum, z > 0 else { return nil }
    let duration = 2 * sqrt(max(0, sum * sum - impact * impact)) / sqrt(speed2)
    let center = time + dt
    return (center, duration, center - duration / 2, center + duration / 2)
  }

  /// Builds optional planet and moon contact diagnostics from their current kinematics.
  private func timingDiagnostics(
    at time: Double, planet: Vector3, planetVelocity: Vector3, moon: Vector3?,
    moonVelocity: Vector3?
  ) -> TransitTimingDiagnostics {
    var result = TransitTimingDiagnostics()
    if let event = event(
      at: time, position: planet, velocity: planetVelocity, radius: scenario.planet.radiusMetres)
    {
      result.planetTransitCenterSec = event.0
      result.planetTransitDurationSec = event.1
      result.planetIngressSec = event.2
      result.planetEgressSec = event.3
    }
    if let moon, let moonVelocity, let radius = scenario.moon?.radiusMetres,
      let event = event(at: time, position: moon, velocity: moonVelocity, radius: radius)
    {
      result.moonTransitCenterSec = event.0
      result.moonTransitDurationSec = event.1
      result.moonIngressSec = event.2
      result.moonEgressSec = event.3
    }
    return result
  }

  /// Returns all bounded-model input violations without mutating the scenario.
  public static func validate(_ scenario: EducationScenarioV4) -> [ValidationIssue] {
    var issues: [ValidationIssue] = []
    validateIdentity(scenario, into: &issues)
    validatePrimaryValues(scenario, into: &issues)
    validateEccentricity(scenario, into: &issues)
    validateGridResolution(scenario, into: &issues)
    if scenario.mode == .detachedBinaryLab, !validateDetachedBinary(scenario, into: &issues) {
      return issues
    }
    validateLimbDarkening(scenario, into: &issues)
    validatePhaseCurve(scenario.planetPhase, field: "photometry.phaseCurve", into: &issues)
    validatePhaseCurve(scenario.moonPhase, field: "photometry.moonPhaseCurve", into: &issues)
    return issues
  }

  /// Reports the stable identifier violation before numerical violations.
  private static func validateIdentity(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) {
    if scenario.identifier.isEmpty { issues.append(.invalidIdentifier) }
  }

  /// Reports the general-lab positive SI quantities in their established error order.
  private static func validatePrimaryValues(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) {
    let positive: [(String, Double)] = [
      ("star.radiusMetres", scenario.star.radiusMetres),
      ("star.massKilograms", scenario.star.massKilograms),
      ("planet.radiusMetres", scenario.planet.radiusMetres),
      ("planet.orbit.semiMajorAxisMetres", scenario.planet.orbit.semiMajorAxisMetres),
      ("planet.orbit.periodSeconds", scenario.planet.orbit.periodSeconds),
    ]
    for (name, value) in positive {
      if !value.isFinite {
        issues.append(.nonFinite(field: name))
      } else if value <= 0 {
        issues.append(.nonPositive(field: name))
      }
    }
  }

  /// Reports the orbit eccentricity after the other primary orbital quantities.
  private static func validateEccentricity(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) {
    if !(0..<1).contains(scenario.planet.orbit.eccentricity) {
      issues.append(
        .outOfRange(field: "planet.orbit.eccentricity", value: scenario.planet.orbit.eccentricity))
    }
  }

  /// Reports a non-positive sampled disk resolution before detached-binary details.
  private static func validateGridResolution(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) {
    if scenario.gridResolution <= 0 { issues.append(.nonPositive(field: "gridResolution")) }
  }

  /// Validates binary components and reports whether its required model was present.
  private static func validateDetachedBinary(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) -> Bool {
    guard let binary = scenario.detachedBinary else {
      issues.append(.nonPositive(field: "detachedBinary"))
      return false
    }
    for (name, value) in [
      ("detachedBinary.primary.radiusMetres", binary.primary.star.radiusMetres),
      ("detachedBinary.secondary.radiusMetres", binary.secondary.star.radiusMetres),
      ("detachedBinary.primary.massKilograms", binary.primary.star.massKilograms),
      ("detachedBinary.secondary.massKilograms", binary.secondary.star.massKilograms),
      ("detachedBinary.primary.luminosityScale", binary.primary.luminosityScale),
      ("detachedBinary.secondary.luminosityScale", binary.secondary.luminosityScale),
    ] {
      if !value.isFinite {
        issues.append(.nonFinite(field: name))
      } else if value <= 0 && !name.hasSuffix("luminosityScale") {
        issues.append(.nonPositive(field: name))
      } else if name.hasSuffix("luminosityScale") && value < 0 {
        issues.append(.outOfRange(field: name, value: value))
      }
    }
    return true
  }

  /// Reports non-finite limb-darkening values after binary component validation.
  private static func validateLimbDarkening(
    _ scenario: EducationScenarioV4, into issues: inout [ValidationIssue]
  ) {
    for (name, value) in [
      ("star.limbDarkeningU1", scenario.star.limbDarkeningU1),
      ("star.limbDarkeningU2", scenario.star.limbDarkeningU2),
    ] where !value.isFinite {
      issues.append(.nonFinite(field: name))
    }
  }

  /// Reports invalid active or preserved phase parameters without changing their serialized values.
  private static func validatePhaseCurve(
    _ curve: PhaseCurve?, field: String, into issues: inout [ValidationIssue]
  ) {
    guard let curve else { return }
    for (name, value) in [
      ("reflectedAmplitude", curve.reflectedAmplitude),
      ("thermalAmplitude", curve.thermalAmplitude),
      ("constantFlux", curve.constantFlux),
    ] {
      guard value.isFinite else {
        issues.append(.nonFinite(field: "\(field).\(name)"))
        continue
      }
      if value < 0 { issues.append(.outOfRange(field: "\(field).\(name)", value: value)) }
    }
    for (name, value) in [
      ("reflectedOffsetRadians", curve.reflectedOffsetRadians),
      ("thermalOffsetRadians", curve.thermalOffsetRadians),
    ] where !value.isFinite {
      issues.append(.nonFinite(field: "\(field).\(name)"))
    }
  }
}

/// Evaluates the deterministic V4 reference path through temporal supersampling.
///
/// The reference path retains the center sample's geometry and timing diagnostics while averaging
/// flux-facing values across the fixed 0.2-second observation window used by the Browser runtime.
public struct ReferenceSimulationEngine: Sendable {
  public let scenario: EducationScenarioV4
  public let configuration: EducationRuntimeConfiguration
  private var interactive: SimulationEngine

  /// Creates a validated reference engine with a bounded deterministic sampling configuration.
  public init(
    scenario: EducationScenarioV4,
    configuration: EducationRuntimeConfiguration = .init(mode: .reference)
  ) throws {
    self.scenario = scenario
    self.configuration = configuration
    interactive = try SimulationEngine(scenario: scenario)
  }

  /// Evaluates the center snapshot and averages flux values over the V4 reference window.
  public mutating func step(at timeSeconds: Double) throws -> EducationStep {
    guard timeSeconds.isFinite else { throw ValidationError([.nonFinite(field: "timeSeconds")]) }
    guard configuration.mode == .reference else { return try interactive.step(at: timeSeconds) }

    let count = configuration.referenceSubsteps
    let samples = try (0..<count).map { index in
      let fraction = count <= 1 ? 0 : Double(index) / Double(count - 1)
      return try interactive.step(at: timeSeconds + (fraction - 0.5) * 0.2)
    }
    let center = samples[count / 2]
    let divisor = Double(samples.count)
    let components = FluxComponents(
      total: samples.reduce(0) { $0 + $1.fluxComponents.total } / divisor,
      transitFactor: samples.reduce(0) { $0 + $1.fluxComponents.transitFactor } / divisor,
      stellarPreTransit: samples.reduce(0) { $0 + $1.fluxComponents.stellarPreTransit } / divisor,
      planetPhase: samples.reduce(0) { $0 + $1.fluxComponents.planetPhase } / divisor,
      moonPhase: samples.reduce(0) { $0 + $1.fluxComponents.moonPhase } / divisor)
    var reference = center
    reference.flux = components.total
    reference.fluxComponents = components
    reference.renderSignals.occultedFraction = 1 - components.transitFactor
    return reference
  }

  /// Evaluates independent reference snapshots for each absolute SI time in seconds.
  public mutating func sample(times: [Double]) throws -> [EducationStep] {
    try times.map { try step(at: $0) }
  }
}
