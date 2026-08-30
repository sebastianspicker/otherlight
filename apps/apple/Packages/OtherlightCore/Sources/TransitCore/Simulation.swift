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
    let reflected =
      curve.lambertian ? (sin(alpha) + (.pi - alpha) * cos(alpha)) / .pi : (1 + cos(alpha)) / 2
    return max(0, curve.reflectedAmplitude * reflected + curve.thermalAmplitude)
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
    if scenario.identifier.isEmpty { issues.append(.invalidIdentifier) }
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
    if !(0..<1).contains(scenario.planet.orbit.eccentricity) {
      issues.append(
        .outOfRange(field: "planet.orbit.eccentricity", value: scenario.planet.orbit.eccentricity))
    }
    if scenario.gridResolution <= 0 { issues.append(.nonPositive(field: "gridResolution")) }
    return issues
  }
}
