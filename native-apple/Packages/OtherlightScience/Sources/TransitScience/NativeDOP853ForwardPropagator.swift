// Provides the native DOP853 propagation lane and its bounded result type.
import Foundation
import TransitScienceContracts

/// Holds sampled radial-velocity values and bounded native-work counters.
public struct ScientificForwardPropagation: Sendable {
  public let sampleTimesSeconds: [Double]
  public let radialVelocitiesMps: [Double]
  public let acceptedSteps: Int
  public let rhsEvaluations: Int
  /// Retains native dense states for module-internal parity tests without widening the public API.
  let sampledStates: [[Double]]
}

/// Native propagation is usable before Arrow IPC is linked; `run` remains fail-closed.
public struct NativeDOP853ForwardPropagator: ScientificForwardPropagating {
  /// Creates the native propagator, whose direct result publication remains intentionally unavailable.
  public init() {}

  /// Validates then rejects direct result publication to require Arrow-linked provenance ownership.
  public func run(_ request: ScientificForwardRequestV5) throws -> LatestScientificResult {
    try request.validate()
    throw ScienceContractError.unsupportedExecution(
      "Use NativeScientificForwardRunner for the Arrow-linked experimental native lane")
  }

  /// Propagates a strict V5 request and samples radial velocity at its requested cadence.
  public func propagate(
    _ request: ScientificForwardRequestV5,
    cancellation: @escaping DOP853Integrator.Cancellation = { false }
  ) throws -> ScientificForwardPropagation {
    try request.validate()
    let bodies = request.scenario.bodies
    let dimension = bodies.count * 6
    let tolerances = bodies.flatMap { _ in
      [
        request.scenario.integrator.positionToleranceM,
        request.scenario.integrator.positionToleranceM,
        request.scenario.integrator.positionToleranceM,
        request.scenario.integrator.velocityToleranceMps,
        request.scenario.integrator.velocityToleranceMps,
        request.scenario.integrator.velocityToleranceMps,
      ]
    }
    let configuration = try DOP853Configuration(
      absoluteTolerances: tolerances,
      relativeTolerance: request.scenario.integrator.relativeTolerance,
      maximumStep: request.scenario.integrator.maxStepSec)
    let integrator = DOP853Integrator(configuration: configuration)
    let initial = bodies.flatMap { $0.state.positionM.values + $0.state.velocityMps.values }
    let lineOfSight = request.scenario.observer.lineOfSight.values
    let targetIndex = try requiredIndex(of: request.scenario.observer.targetBodyId, in: bodies)
    let sampleTimes = (0..<request.sampleCount).map {
      request.startOffsetSec + Double($0) * request.sampleCadenceSec
    }
    var samples = [Double](repeating: 0, count: sampleTimes.count)
    var sampledStates = [[Double]?](repeating: nil, count: sampleTimes.count)
    // This deadline covers dense collision certification after each accepted step. It is shared
    // by the independent past/future legs, as is the certificate-node work allowance.
    let workClock = ContinuousClock()
    let workDeadline = workClock.now.advanced(by: .seconds(ScienceLimits.maximumWallTimeSeconds))
    let checkRunDeadline: @Sendable () throws -> Void = {
      guard workClock.now <= workDeadline else {
        throw ScienceContractError.unsupportedExecution(
          "scientific run exceeded \(Int(ScienceLimits.maximumWallTimeSeconds)) seconds")
      }
    }
    var budget = ScienceWorkBudget()
    var collisionAuditWork = CertifiedCollisionAuditWork()

    let rhs = makeNewtonianRightHandSide(bodies: bodies, dimension: dimension)

    // Propagate away from the epoch in each direction. This intentionally avoids treating a
    // negative request window as a preflight for a later forward integration: past and future
    // samples have independent initial-value solutions and share one explicit work budget.
    let indexedTimes = sampleTimes.enumerated().map { (time: $0.element, index: $0.offset) }
    let futureTimes = indexedTimes.filter { $0.time > 0 }.sorted { $0.time < $1.time }
    let pastTimes = indexedTimes.filter { $0.time < 0 }.sorted { $0.time > $1.time }

    try requireNoCollision(state: initial, bodies: bodies)
    for sample in indexedTimes where sample.time == 0 {
      samples[sample.index] = radialVelocity(
        state: initial, targetIndex: targetIndex, lineOfSight: lineOfSight)
      sampledStates[sample.index] = initial
    }

    /// Integrates one temporal direction and fills the requested dense-output samples.
    func integrateSamples(_ requestedTimes: [(time: Double, index: Int)]) throws {
      guard let terminalTime = requestedTimes.last?.time else { return }
      var nextSample = 0
      let inspect: DOP853Integrator.AcceptedStep = { dense in
        try self.requireNoCollision(
          in: dense,
          bodies: bodies,
          cancellation: cancellation,
          elapsedCheck: checkRunDeadline,
          work: &collisionAuditWork)
        let lowerBound = min(dense.startTime, dense.endTime)
        let upperBound = max(dense.startTime, dense.endTime)
        while nextSample < requestedTimes.count {
          let sample = requestedTimes[nextSample]
          guard sample.time >= lowerBound, sample.time <= upperBound else { break }
          let state = try dense.state(at: sample.time)
          samples[sample.index] = self.radialVelocity(
            state: state, targetIndex: targetIndex, lineOfSight: lineOfSight)
          sampledStates[sample.index] = state
          nextSample += 1
        }
      }
      _ = try integrator.integrate(
        initialTime: 0, initialState: initial, finalTime: terminalTime,
        rhs: rhs, cancellation: cancellation, onAcceptedStep: inspect, budget: &budget)
      guard nextSample == requestedTimes.count else {
        throw ScienceContractError.unsupportedExecution(
          "DOP853 dense output did not cover requested samples")
      }
    }

    try integrateSamples(futureTimes)
    try integrateSamples(pastTimes)
    guard sampledStates.allSatisfy({ $0 != nil }) else {
      throw ScienceContractError.unsupportedExecution(
        "DOP853 dense output did not retain requested sample states")
    }
    let completeStates = sampledStates.map { $0! }
    return .init(
      sampleTimesSeconds: sampleTimes, radialVelocitiesMps: samples,
      acceptedSteps: budget.acceptedSteps, rhsEvaluations: budget.rhsEvaluations,
      sampledStates: completeStates)
  }

  /// Constructs the fixed-size Newtonian derivative used by one propagation request.
  private func makeNewtonianRightHandSide(
    bodies: [ScientificBodyV5], dimension: Int
  ) -> DOP853Integrator.RightHandSide {
    { _, state in
      guard state.count == dimension else {
        throw ScienceContractError.unsupportedExecution("Newtonian RHS state dimension changed")
      }
      var derivative = [Double](repeating: 0, count: dimension)
      for body in bodies.indices {
        let base = body * 6
        derivative[base] = state[base + 3]
        derivative[base + 1] = state[base + 4]
        derivative[base + 2] = state[base + 5]
      }
      for left in bodies.indices {
        let base = left * 6
        var acceleration = [0.0, 0.0, 0.0]
        for right in bodies.indices where right != left {
          let other = right * 6
          let dx = state[other] - state[base]
          let dy = state[other + 1] - state[base + 1]
          let dz = state[other + 2] - state[base + 2]
          let distanceSquared = dx * dx + dy * dy + dz * dz
          let contactDistance = bodies[left].radiusM + bodies[right].radiusM
          guard distanceSquared.isFinite, distanceSquared > contactDistance * contactDistance else {
            throw ScienceContractError.unsupportedExecution(
              "finite-radius collision detected during native propagation")
          }
          let inverseDistanceCubed = 1 / (distanceSquared * sqrt(distanceSquared))
          let scale =
            ScienceLimits.gravitationalConstant * bodies[right].massKg * inverseDistanceCubed
          guard scale.isFinite else {
            throw ScienceContractError.unsupportedExecution(
              "Newtonian acceleration became non-finite")
          }
          acceleration[0] += scale * dx
          acceleration[1] += scale * dy
          acceleration[2] += scale * dz
        }
        guard acceleration.allSatisfy(\.isFinite) else {
          throw ScienceContractError.unsupportedExecution(
            "Newtonian acceleration became non-finite")
        }
        derivative[base + 3] = acceleration[0]
        derivative[base + 4] = acceleration[1]
        derivative[base + 5] = acceleration[2]
      }
      return derivative
    }
  }

  /// Finds a referenced body index while keeping missing IDs fail-closed.
  private func requiredIndex(of id: String, in bodies: [ScientificBodyV5]) throws -> Int {
    guard let index = bodies.firstIndex(where: { $0.id == id }) else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.targetBodyId", "an existing body id")
    }
    return index
  }

  /// Projects the target's velocity onto the fixed observer direction.
  private func radialVelocity(state: [Double], targetIndex: Int, lineOfSight: [Double]) -> Double {
    let base = targetIndex * 6
    // The line of sight points from the system toward the observer. Positive spectroscopic
    // radial velocity therefore denotes recession, matching the shared backend contract.
    return
      -(state[base + 3] * lineOfSight[0] + state[base + 4] * lineOfSight[1] + state[base + 5]
      * lineOfSight[2])
  }

  /// Rejects finite-radius contact in a flattened integration state.
  private func requireNoCollision(state: [Double], bodies: [ScientificBodyV5]) throws {
    for left in bodies.indices {
      for right in bodies.indices where right > left {
        let l = left * 6
        let r = right * 6
        let dx = state[r] - state[l]
        let dy = state[r + 1] - state[l + 1]
        let dz = state[r + 2] - state[l + 2]
        let distance = sqrt(dx * dx + dy * dy + dz * dz)
        guard distance.isFinite, distance > bodies[left].radiusM + bodies[right].radiusM else {
          throw ScienceContractError.unsupportedExecution(
            "finite-radius collision detected during native propagation")
        }
      }
    }
  }

  /// Certifies every pair over a dense step, failing closed if its Bernstein proof is inconclusive.
  private func requireNoCollision(
    in dense: DOP853DenseOutput,
    bodies: [ScientificBodyV5],
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void,
    work: inout CertifiedCollisionAuditWork
  ) throws {
    for left in bodies.indices {
      for right in bodies.indices where right > left {
        try elapsedCheck()
        guard !cancellation() else {
          throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
        }
        let contactDistance = bodies[left].radiusM + bodies[right].radiusM
        switch try dense.certifiedCollisionAudit(
          leftStateOffset: left * 6,
          rightStateOffset: right * 6,
          contactDistance: contactDistance,
          cancellation: cancellation,
          elapsedCheck: elapsedCheck,
          work: &work)
        {
        case .safe:
          continue
        case .contact:
          throw ScienceContractError.unsupportedExecution(
            "finite-radius collision detected during native propagation")
        case .indeterminate:
          throw ScienceContractError.unsupportedExecution(
            "collision safety indeterminate during native propagation")
        }
      }
    }
  }
}

/// Stores the source-derived DOP853 tableau and dense-output coefficients.
