// Defines the validated V5 forward-propagation request contract.
import Foundation

/// Represents one strict, bounded scientific forward-propagation request.
public struct ScientificForwardRequestV5: Codable, Equatable, Sendable {
  public let kind: String
  public let scenario: ScienceScenarioV5
  public let startOffsetSec: Double
  public let endOffsetSec: Double
  public let sampleCadenceSec: Double
  public let outputs: [String]
  public let seed: Int64

  /// Creates a request whose cross-field constraints are checked by `validate()`.
  public init(
    kind: String, scenario: ScienceScenarioV5, startOffsetSec: Double, endOffsetSec: Double,
    sampleCadenceSec: Double, outputs: [String], seed: Int64
  ) {
    self.kind = kind
    self.scenario = scenario
    self.startOffsetSec = startOffsetSec
    self.endOffsetSec = endOffsetSec
    self.sampleCadenceSec = sampleCadenceSec
    self.outputs = outputs
    self.seed = seed
  }

  /// Enforces V5's serialized, physical, numerical, and resource-boundary invariants.
  public func validate() throws {
    try validateRequestKindAndScenario()
    try validateBodies()
    try validateObserver()
    try validateIntegrator()
    try validateTimingAndOutputs()
    try validateSampleGrid()
    try validateMinimumStepCount()
    try validateSeed()
    try validateBarycentreAndContact()
  }

  /// Validates the request discriminator and immutable scenario metadata.
  private func validateRequestKindAndScenario() throws {
    guard kind == "forward" else {
      throw ScienceContractError.invalid("request.kind", "exactly 'forward'")
    }
    guard scenario.schemaVersion == "v5", scenario.timeScale == "TDB" else {
      throw ScienceContractError.invalid(
        "request.scenario", "schemaVersion 'v5' and timeScale 'TDB'")
    }
    guard Self.isValidIdentifier(scenario.id), scenario.epochJdTdb.isFinite,
      scenario.epochJdTdb > 0
    else { throw ScienceContractError.invalid("request.scenario", "a valid scenario id and epoch") }
  }

  /// Validates bounded, uniquely identified bodies with physical mass and radius values.
  private func validateBodies() throws {
    guard scenario.bodies.count >= 2, scenario.bodies.count <= ScienceLimits.maximumBodies else {
      throw ScienceContractError.invalid(
        "request.scenario.bodies", "between 2 and at most 3 bodies")
    }
    let identifiers = scenario.bodies.map(\.id)
    guard Set(identifiers).count == identifiers.count,
      identifiers.allSatisfy(Self.isValidIdentifier)
    else {
      throw ScienceContractError.invalid("request.scenario.bodies", "unique non-empty ids")
    }
    for body in scenario.bodies {
      guard body.massKg.isFinite, body.massKg > 0, body.radiusM.isFinite, body.radiusM > 0 else {
        throw ScienceContractError.invalid(
          "request.scenario.bodies[\(body.id)]", "finite positive mass and radius")
      }
    }
  }

  /// Validates the observer's referenced target and normalized viewing direction.
  private func validateObserver() throws {
    let identifiers = scenario.bodies.map(\.id)
    guard Self.isValidIdentifier(scenario.observer.targetBodyId) else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.targetBodyId",
        "a non-whitespace id with at most 128 Unicode scalars")
    }
    guard identifiers.contains(scenario.observer.targetBodyId)
    else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.targetBodyId", "an existing body id")
    }
    let lineOfSightLength = scenario.observer.lineOfSight.magnitude
    guard abs(lineOfSightLength - 1) <= 1e-12 else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.lineOfSight", "a unit vector within 1e-12")
    }
    guard scenario.observer.distanceM.map({ $0.isFinite && $0 > 0 }) ?? true else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.distanceM", "a finite positive value")
    }
  }

  /// Validates the supported DOP853 integrator and all its tolerance values.
  private func validateIntegrator() throws {
    guard scenario.integrator.method == "DOP853", scenario.integrator.positionToleranceM.isFinite,
      scenario.integrator.positionToleranceM > 0, scenario.integrator.velocityToleranceMps.isFinite,
      scenario.integrator.velocityToleranceMps > 0, scenario.integrator.relativeTolerance.isFinite,
      scenario.integrator.relativeTolerance >= ScienceLimits.minimumRelativeTolerance,
      scenario.integrator.relativeTolerance < 1, scenario.integrator.maxStepSec.isFinite,
      scenario.integrator.maxStepSec > 0
    else {
      throw ScienceContractError.invalid("request.scenario.integrator", "valid DOP853 tolerances")
    }
  }

  /// Validates the requested time window, sampling cadence, and output selection.
  private func validateTimingAndOutputs() throws {
    guard startOffsetSec.isFinite, endOffsetSec.isFinite, endOffsetSec > startOffsetSec,
      sampleCadenceSec.isFinite, sampleCadenceSec > 0
    else {
      throw ScienceContractError.invalid(
        "request", "finite ordered offsets and positive sample cadence")
    }
    guard outputs == ["radial-velocity"] else {
      throw ScienceContractError.invalid("request.outputs", "exactly ['radial-velocity']")
    }
  }

  /// Confirms that the inclusive sample grid is bounded and IEEE-754 representable.
  private func validateSampleGrid() throws {
    let validatedSampleCount = sampleCount
    guard validatedSampleCount <= ScienceLimits.maximumSamples else {
      throw ScienceContractError.invalid(
        "request", "at most \(ScienceLimits.maximumSamples) samples")
    }
    var previousSample = startOffsetSec
    for index in 1..<validatedSampleCount {
      let sample = startOffsetSec + Double(index) * sampleCadenceSec
      guard sample.isFinite, sample > previousSample else {
        throw ScienceContractError.invalid(
          "request", "a strictly increasing sample grid representable as IEEE-754 doubles")
      }
      previousSample = sample
    }
  }

  /// Rejects integrations whose required physical coverage exceeds the accepted-step budget.
  private func validateMinimumStepCount() throws {
    let minimumStepCount =
      ceil(max(0, endOffsetSec) / scenario.integrator.maxStepSec)
      + ceil(max(0, -startOffsetSec) / scenario.integrator.maxStepSec)
    guard minimumStepCount.isFinite,
      minimumStepCount <= Double(ScienceLimits.maximumAcceptedSteps)
    else {
      throw ScienceContractError.invalid(
        "request.scenario.integrator.maxStepSec",
        "at most \(ScienceLimits.maximumAcceptedSteps) required integration steps")
    }
  }

  /// Restricts persisted seeds to values that round-trip through JavaScript exactly.
  private func validateSeed() throws {
    guard seed >= -9_007_199_254_740_991, seed <= 9_007_199_254_740_991 else {
      throw ScienceContractError.invalid("request.seed", "a JavaScript-safe integer")
    }
  }

  /// Checks the shared V5 identifier bound in Unicode scalars rather than grapheme clusters.
  private static func isValidIdentifier(_ value: String) -> Bool {
    !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && value.unicodeScalars.count <= 128
  }

  /// Calculates the bounded inclusive output count, signaling overflow beyond the configured maximum.
  public var sampleCount: Int {
    let intervals = (endOffsetSec - startOffsetSec) / sampleCadenceSec
    guard intervals.isFinite, intervals >= 0,
      intervals < Double(ScienceLimits.maximumSamples)
    else { return ScienceLimits.maximumSamples + 1 }
    return Int(intervals.rounded(.down)) + 1
  }

  /// Verifies barycentric initial conditions and rejects starting finite-radius contact.
  private func validateBarycentreAndContact() throws {
    let totalMass = scenario.bodies.reduce(0) { $0 + $1.massKg }
    guard totalMass.isFinite else {
      throw ScienceContractError.invalid("request.scenario.bodies", "a finite total mass")
    }
    var position = [0.0, 0.0, 0.0]
    var velocity = position
    for body in scenario.bodies {
      for index in 0..<3 {
        position[index] += body.massKg * body.state.positionM.values[index]
        velocity[index] += body.massKg * body.state.velocityMps.values[index]
      }
    }
    let positionResidual = try ScienceVector3(position.map { $0 / totalMass }).magnitude
    let velocityResidual = try ScienceVector3(velocity.map { $0 / totalMass }).magnitude
    let positionScale = scenario.bodies.map { $0.state.positionM.magnitude }.max() ?? 0
    let velocityScale = scenario.bodies.map { $0.state.velocityMps.magnitude }.max() ?? 0
    guard positionResidual <= max(1e-3, positionScale * 1e-12),
      velocityResidual <= max(1e-9, velocityScale * 1e-12)
    else {
      throw ScienceContractError.invalid(
        "request.scenario.bodies", "a barycentric position and zero total momentum")
    }
    for leftIndex in scenario.bodies.indices {
      for rightIndex in scenario.bodies.indices where rightIndex > leftIndex {
        let left = scenario.bodies[leftIndex]
        let right = scenario.bodies[rightIndex]
        let displacement = zip(
          right.state.positionM.values, left.state.positionM.values
        ).map(-)
        guard displacement.allSatisfy(\.isFinite),
          (try ScienceVector3(displacement)).magnitude > left.radiusM + right.radiusM
        else {
          throw ScienceContractError.invalid(
            "request.scenario.bodies", "no initial finite-radius contact")
        }
      }
    }
  }
}

/// Classifies strict-contract failures separately from unavailable execution lanes.
