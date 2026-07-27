// Source-derived DOP853 integrator and Newtonian forward-propagation lane.
//
// The tableau, error estimator, and dense-output construction below are ported
// from SciPy v1.18.0's scipy/integrate/_ivp/dop853_coefficients.py and rk.py:
// https://github.com/scipy/scipy/blob/v1.18.0/scipy/integrate/_ivp/dop853_coefficients.py
// https://github.com/scipy/scipy/blob/v1.18.0/scipy/integrate/_ivp/rk.py
// SciPy is distributed under the BSD 3-Clause license.  This is a Swift port,
// not a claim of numerical equivalence or independent scientific validation.

import Foundation
import TransitScienceContracts

/// Validates adaptive DOP853 tolerances and its maximum accepted step size.
public struct DOP853Configuration: Sendable {
  public let absoluteTolerances: [Double]
  public let relativeTolerance: Double
  public let maximumStep: Double

  /// Creates a configuration that rejects numerically unsafe tolerance or step inputs.
  public init(absoluteTolerances: [Double], relativeTolerance: Double, maximumStep: Double) throws {
    guard !absoluteTolerances.isEmpty, absoluteTolerances.allSatisfy({ $0.isFinite && $0 > 0 }),
      relativeTolerance.isFinite, relativeTolerance >= ScienceLimits.minimumRelativeTolerance,
      relativeTolerance < 1, maximumStep.isFinite, maximumStep > 0
    else {
      throw ScienceContractError.invalid(
        "DOP853 configuration",
        "positive finite component tolerances, relative tolerance, and maximum step")
    }
    self.absoluteTolerances = absoluteTolerances
    self.relativeTolerance = relativeTolerance
    self.maximumStep = maximumStep
  }
}

/// Interpolates the state within one accepted DOP853 integration step.
public struct DOP853DenseOutput: Sendable {
  public let startTime: Double
  public let endTime: Double
  private let initialState: [Double]
  private let coefficients: [[Double]]

  /// Stores the coefficient form derived from one accepted step for internal sampling.
  fileprivate init(
    startTime: Double, endTime: Double, initialState: [Double], coefficients: [[Double]]
  ) {
    self.startTime = startTime
    self.endTime = endTime
    self.initialState = initialState
    self.coefficients = coefficients
  }

  /// Evaluates the dense polynomial only inside its accepted time interval.
  public func state(at time: Double) throws -> [Double] {
    guard time.isFinite, time >= min(startTime, endTime), time <= max(startTime, endTime) else {
      throw ScienceContractError.invalid(
        "dense output time", "a finite time inside the accepted step")
    }
    let h = endTime - startTime
    guard h != 0 else { return initialState }
    let x = (time - startTime) / h
    var value = [Double](repeating: 0, count: initialState.count)
    for (index, coefficient) in coefficients.reversed().enumerated() {
      for component in value.indices { value[component] += coefficient[component] }
      let multiplier = index.isMultiple(of: 2) ? x : 1 - x
      for component in value.indices { value[component] *= multiplier }
    }
    for component in value.indices { value[component] += initialState[component] }
    guard value.allSatisfy(\.isFinite) else {
      throw ScienceContractError.unsupportedExecution("DOP853 dense output became non-finite")
    }
    return value
  }
}

/// Reports the terminal state and bounded work consumed by one integration.
public struct DOP853IntegrationResult: Sendable {
  public let finalTime: Double
  public let finalState: [Double]
  public let acceptedSteps: Int
  public let rhsEvaluations: Int
}

/// Performs adaptive DOP853 integration with cancellation and explicit resource budgets.
public struct DOP853Integrator: Sendable {
  /// Defines the derivative callback evaluated by the adaptive integrator.
  public typealias RightHandSide = @Sendable (_ time: Double, _ state: [Double]) throws -> [Double]
  /// Defines a cooperative cancellation probe for bounded scientific execution.
  public typealias Cancellation = @Sendable () -> Bool
  /// Receives each accepted dense-output segment for caller-controlled sampling.
  public typealias AcceptedStep = (DOP853DenseOutput) throws -> Void

  public let configuration: DOP853Configuration

  /// Creates an integrator using a prevalidated numerical configuration.
  public init(configuration: DOP853Configuration) { self.configuration = configuration }

  /// Integrates an RHS while exposing each accepted dense-output segment to the caller.
  public func integrate(
    initialTime: Double,
    initialState: [Double],
    finalTime: Double,
    rhs: @escaping RightHandSide,
    cancellation: @escaping Cancellation = { false },
    onAcceptedStep: @escaping AcceptedStep = { _ in }
  ) throws -> DOP853IntegrationResult {
    var budget = ScienceWorkBudget()
    return try integrate(
      initialTime: initialTime, initialState: initialState, finalTime: finalTime,
      rhs: rhs, cancellation: cancellation, onAcceptedStep: onAcceptedStep, budget: &budget)
  }

  /// Shares integration implementation with callers that supply an existing work budget.
  fileprivate func integrate(
    initialTime: Double,
    initialState: [Double],
    finalTime: Double,
    rhs: @escaping RightHandSide,
    cancellation: @escaping Cancellation,
    onAcceptedStep: @escaping AcceptedStep,
    budget: inout ScienceWorkBudget
  ) throws -> DOP853IntegrationResult {
    let dimension = initialState.count
    guard dimension == configuration.absoluteTolerances.count, dimension > 0,
      initialTime.isFinite, finalTime.isFinite, initialState.allSatisfy(\.isFinite)
    else {
      throw ScienceContractError.invalid(
        "DOP853 input", "finite times and a state matching component tolerances")
    }
    if initialTime == finalTime {
      return .init(
        finalTime: finalTime, finalState: initialState, acceptedSteps: budget.acceptedSteps,
        rhsEvaluations: budget.rhsEvaluations)
    }

    let direction = finalTime > initialTime ? 1.0 : -1.0
    /// Evaluates and validates one RHS result while charging the shared work budget.
    func evaluate(_ time: Double, _ state: [Double]) throws -> [Double] {
      guard !cancellation() else {
        throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
      }
      try budget.recordRHS()
      let derivative = try rhs(time, state)
      guard derivative.count == dimension, derivative.allSatisfy(\.isFinite) else {
        throw ScienceContractError.unsupportedExecution(
          "DOP853 RHS returned a non-finite or mismatched state")
      }
      return derivative
    }

    var time = initialTime
    var state = initialState
    var derivative = try evaluate(time, state)
    var stepMagnitude = try initialStep(
      time: time, state: state, derivative: derivative, finalTime: finalTime, direction: direction,
      evaluate: evaluate)
    stepMagnitude = min(stepMagnitude, configuration.maximumStep)

    while direction * (finalTime - time) > 0 {
      try budget.checkElapsed()
      let adjacentTime = direction > 0 ? time.nextUp : time.nextDown
      let minimumStep = 10 * abs(adjacentTime - time)
      var proposed = min(max(stepMagnitude, minimumStep), configuration.maximumStep)
      var wasRejected = false
      var accepted = false
      while !accepted {
        guard !cancellation() else {
          throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
        }
        guard proposed >= minimumStep else {
          throw ScienceContractError.unsupportedExecution(
            "DOP853 step underflow before reaching the requested time")
        }
        var h = direction * proposed
        var nextTime = time + h
        if direction * (nextTime - finalTime) > 0 {
          nextTime = finalTime
          h = nextTime - time
          proposed = abs(h)
        }

        let attempted = try step(
          time: time, state: state, derivative: derivative, h: h, evaluate: evaluate)
        let error = errorNorm(stages: attempted.stages, h: h, old: state, new: attempted.state)
        guard error.isFinite else {
          throw ScienceContractError.unsupportedExecution("DOP853 error estimate became non-finite")
        }
        if error < 1 {
          let dense = try denseOutput(
            time: time, state: state, nextTime: nextTime, nextState: attempted.state,
            stages: attempted.stages, h: h, evaluate: evaluate)
          try budget.recordAcceptedStep()
          try onAcceptedStep(dense)
          time = nextTime
          state = attempted.state
          derivative = attempted.derivative
          let factor = error == 0 ? 10.0 : min(10.0, 0.9 * pow(error, -1.0 / 8.0))
          stepMagnitude = proposed * (wasRejected ? min(1, factor) : factor)
          accepted = true
        } else {
          proposed *= max(0.2, 0.9 * pow(error, -1.0 / 8.0))
          wasRejected = true
        }
      }
    }
    return .init(
      finalTime: time, finalState: state, acceptedSteps: budget.acceptedSteps,
      rhsEvaluations: budget.rhsEvaluations)
  }

  /// Estimates a stable first adaptive step using the current scale and derivatives.
  private func initialStep(
    time: Double, state: [Double], derivative: [Double], finalTime: Double, direction: Double,
    evaluate: (_ time: Double, _ state: [Double]) throws -> [Double]
  ) throws -> Double {
    let span = abs(finalTime - time)
    let scale = zip(configuration.absoluteTolerances, state).map {
      $0 + abs($1) * configuration.relativeTolerance
    }
    let d0 = rms(zip(state, scale).map { $0 / $1 })
    let d1 = rms(zip(derivative, scale).map { $0 / $1 })
    let h0 = min(span, min(configuration.maximumStep, min(d0, d1) < 1e-5 ? 1e-6 : 0.01 * d0 / d1))
    let trial = zip(state, derivative).map { $0 + direction * h0 * $1 }
    let derivative1 = try evaluate(time + direction * h0, trial)
    let d2 = rms(
      zip(derivative1, derivative).map { abs($0 - $1) / h0 }.enumerated().map {
        $0.element / scale[$0.offset]
      })
    let h1 = max(d1, d2) <= 1e-15 ? max(1e-6, h0 * 1e-3) : pow(0.01 / max(d1, d2), 1.0 / 9.0)
    return max(10 * Double.ulpOfOne, min(span, min(configuration.maximumStep, min(100 * h0, h1))))
  }

  /// Computes one DOP853 tableau step and its terminal derivative.
  private func step(
    time: Double, state: [Double], derivative: [Double], h: Double,
    evaluate: (_ time: Double, _ state: [Double]) throws -> [Double]
  ) throws -> (state: [Double], derivative: [Double], stages: [[Double]]) {
    var stages = [[Double]](repeating: [Double](repeating: 0, count: state.count), count: 13)
    stages[0] = derivative
    for stage in 1..<12 {
      let increment = weightedSum(stages, DOP853Coefficients.a[stage], count: stage).map { h * $0 }
      let trial = zip(state, increment).map(+)
      stages[stage] = try evaluate(time + DOP853Coefficients.c[stage] * h, trial)
    }
    let increment = weightedSum(stages, DOP853Coefficients.b, count: 12).map { h * $0 }
    let nextState = zip(state, increment).map(+)
    guard nextState.allSatisfy(\.isFinite) else {
      throw ScienceContractError.unsupportedExecution("DOP853 state became non-finite")
    }
    let nextDerivative = try evaluate(time + h, nextState)
    stages[12] = nextDerivative
    return (nextState, nextDerivative, stages)
  }

  /// Combines DOP853's third- and fifth-order estimates into the adaptive error norm.
  private func errorNorm(stages: [[Double]], h: Double, old: [Double], new: [Double]) -> Double {
    let error5 = weightedSum(stages, DOP853Coefficients.e5, count: 13)
    let error3 = weightedSum(stages, DOP853Coefficients.e3, count: 13)
    var norm5 = 0.0
    var norm3 = 0.0
    for index in old.indices {
      let scale =
        configuration.absoluteTolerances[index] + max(abs(old[index]), abs(new[index]))
        * configuration.relativeTolerance
      let fifth = error5[index] / scale
      let third = error3[index] / scale
      norm5 += fifth * fifth
      norm3 += third * third
    }
    guard norm5 != 0 || norm3 != 0 else { return 0 }
    return abs(h) * norm5 / sqrt((norm5 + 0.01 * norm3) * Double(old.count))
  }

  /// Builds the source-derived dense-output coefficients for an accepted step.
  private func denseOutput(
    time: Double, state: [Double], nextTime: Double, nextState: [Double], stages: [[Double]],
    h: Double,
    evaluate: (_ time: Double, _ state: [Double]) throws -> [Double]
  ) throws -> DOP853DenseOutput {
    var extended =
      stages + [[Double]](repeating: [Double](repeating: 0, count: state.count), count: 3)
    for stage in 13..<16 {
      let increment = weightedSum(extended, DOP853Coefficients.a[stage], count: stage).map {
        h * $0
      }
      extended[stage] = try evaluate(
        time + DOP853Coefficients.c[stage] * h, zip(state, increment).map(+))
    }
    let delta = zip(nextState, state).map(-)
    var f = [[Double]]()
    f.append(delta)
    var firstDerivativeTerm = [Double](repeating: 0, count: state.count)
    var secondDerivativeTerm = [Double](repeating: 0, count: state.count)
    for index in state.indices {
      firstDerivativeTerm[index] = h * stages[0][index] - delta[index]
      secondDerivativeTerm[index] = 2 * delta[index] - h * (stages[12][index] + stages[0][index])
    }
    f.append(firstDerivativeTerm)
    f.append(secondDerivativeTerm)
    for row in DOP853Coefficients.d {
      f.append(weightedSum(extended, row, count: 16).map { h * $0 })
    }
    return .init(startTime: time, endTime: nextTime, initialState: state, coefficients: f)
  }

  /// Applies a tableau row to prior stage derivatives component by component.
  private func weightedSum(_ stages: [[Double]], _ weights: [Double], count: Int) -> [Double] {
    var result = [Double](repeating: 0, count: stages[0].count)
    for stage in 0..<count where weights[stage] != 0 {
      for index in result.indices { result[index] += weights[stage] * stages[stage][index] }
    }
    return result
  }

  /// Returns the root-mean-square scale used by initial-step estimation.
  private func rms(_ values: [Double]) -> Double {
    sqrt(values.reduce(0) { $0 + $1 * $1 } / Double(values.count))
  }
}

/// Carries sampled radial velocities and the work counts from native propagation.
public struct ScientificForwardPropagation: Sendable {
  public let sampleTimesSeconds: [Double]
  public let radialVelocitiesMps: [Double]
  public let acceptedSteps: Int
  public let rhsEvaluations: Int
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
    // This deadline covers collision minimization too, which happens after the integrator has
    // recorded an accepted step. It is deliberately shared by the independent past/future legs.
    let workClock = ContinuousClock()
    let workDeadline = workClock.now.advanced(by: .seconds(ScienceLimits.maximumWallTimeSeconds))
    let checkRunDeadline: @Sendable () throws -> Void = {
      guard workClock.now <= workDeadline else {
        throw ScienceContractError.unsupportedExecution(
          "scientific run exceeded \(Int(ScienceLimits.maximumWallTimeSeconds)) seconds")
      }
    }
    var budget = ScienceWorkBudget()

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
    }

    /// Integrates one temporal direction and fills the requested dense-output samples.
    func integrateSamples(_ requestedTimes: [(time: Double, index: Int)]) throws {
      guard let terminalTime = requestedTimes.last?.time else { return }
      var nextSample = 0
      let inspect: DOP853Integrator.AcceptedStep = { dense in
        try self.requireNoCollision(
          in: dense, bodies: bodies, cancellation: cancellation, elapsedCheck: checkRunDeadline)
        let lowerBound = min(dense.startTime, dense.endTime)
        let upperBound = max(dense.startTime, dense.endTime)
        while nextSample < requestedTimes.count {
          let sample = requestedTimes[nextSample]
          guard sample.time >= lowerBound, sample.time <= upperBound else { break }
          let state = try dense.state(at: sample.time)
          samples[sample.index] = self.radialVelocity(
            state: state, targetIndex: targetIndex, lineOfSight: lineOfSight)
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
    return .init(
      sampleTimesSeconds: sampleTimes, radialVelocitiesMps: samples,
      acceptedSteps: budget.acceptedSteps, rhsEvaluations: budget.rhsEvaluations)
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

  /// Detects contact between a dense-output segment's endpoints and interior minimum.
  private func requireNoCollision(
    in dense: DOP853DenseOutput,
    bodies: [ScientificBodyV5],
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void
  ) throws {
    // Mirror the Python oracle's fail-closed strategy: bounded minimization on each segment of
    // every accepted dense interval, with endpoints included. Fixed point sampling is unsafe for
    // a short in-and-out encounter that falls between samples.
    let intervalStart = min(dense.startTime, dense.endTime)
    let intervalEnd = max(dense.startTime, dense.endTime)
    let subdivisions = 16
    for left in bodies.indices {
      for right in bodies.indices where right > left {
        let contactDistance = bodies[left].radiusM + bodies[right].radiusM
        let contactSquared = contactDistance * contactDistance
        for segment in 0..<subdivisions {
          try elapsedCheck()
          guard !cancellation() else {
            throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
          }
          let lower =
            intervalStart + (intervalEnd - intervalStart) * Double(segment) / Double(subdivisions)
          let upper =
            intervalStart + (intervalEnd - intervalStart) * Double(segment + 1)
            / Double(subdivisions)
          let minimumSquared = try minimumPairSeparationSquared(
            in: dense, left: left, right: right, lowerTime: lower, upperTime: upper,
            cancellation: cancellation, elapsedCheck: elapsedCheck)
          guard minimumSquared.isFinite else {
            throw ScienceContractError.unsupportedExecution(
              "collision safety search returned a non-finite minimum")
          }
          if minimumSquared <= contactSquared {
            throw ScienceContractError.unsupportedExecution(
              "finite-radius collision detected during native propagation")
          }
        }
      }
    }
  }

  /// Minimizes pair separation over an interval to detect fly-through collisions between samples.
  private func minimumPairSeparationSquared(
    in dense: DOP853DenseOutput,
    left: Int,
    right: Int,
    lowerTime: Double,
    upperTime: Double,
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void
  ) throws -> Double {
    /// Evaluates squared pair separation at one dense-output time during minimization.
    func separationSquared(at time: Double) throws -> Double {
      try elapsedCheck()
      guard !cancellation() else {
        throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
      }
      let state = try dense.state(at: time)
      let leftBase = left * 6
      let rightBase = right * 6
      let dx = state[rightBase] - state[leftBase]
      let dy = state[rightBase + 1] - state[leftBase + 1]
      let dz = state[rightBase + 2] - state[leftBase + 2]
      let squared = dx * dx + dy * dy + dz * dz
      guard squared.isFinite else {
        throw ScienceContractError.unsupportedExecution(
          "collision safety search received a non-finite dense state")
      }
      return squared
    }

    var lower = lowerTime
    var upper = upperTime
    let endpointMinimum = min(try separationSquared(at: lower), try separationSquared(at: upper))
    // A bounded golden-section search is deterministic and deliberately refuses to infer a
    // minimum from a sparse grid. The 16 segments match the vetted backend implementation.
    let inverseGoldenRatio = (sqrt(5) - 1) / 2
    var first = upper - inverseGoldenRatio * (upper - lower)
    var second = lower + inverseGoldenRatio * (upper - lower)
    var firstValue = try separationSquared(at: first)
    var secondValue = try separationSquared(at: second)
    for _ in 0..<64 {
      try elapsedCheck()
      guard !cancellation() else {
        throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
      }
      if firstValue <= secondValue {
        upper = second
        second = first
        secondValue = firstValue
        first = upper - inverseGoldenRatio * (upper - lower)
        firstValue = try separationSquared(at: first)
      } else {
        lower = first
        first = second
        firstValue = secondValue
        second = lower + inverseGoldenRatio * (upper - lower)
        secondValue = try separationSquared(at: second)
      }
    }
    return min(endpointMinimum, firstValue, secondValue)
  }
}

/// Stores the source-derived DOP853 tableau and dense-output coefficients.
private enum DOP853Coefficients {
  static let c: [Double] = [
    0, 5.26001519587677318785587544488e-2, 7.89002279381515978178381316732e-2,
    1.18350341907227396726757197510e-1, 2.81649658092772603274280243602e-1, 1.0 / 3.0, 0.25,
    4.0 / 13.0, 0.651282051282051282051282051282, 0.6, 6.0 / 7.0, 1, 1, 0.1, 0.2, 7.0 / 9.0,
  ]
  static let a: [[Double]] = [
    [], [5.26001519587677318785587544488e-2],
    [1.97250569845378994544595329183e-2, 5.91751709536136983633785987549e-2],
    [2.95875854768068491816892993775e-2, 0, 8.87627564304205475450678981324e-2],
    [
      2.41365134159266685502369798665e-1, 0, -8.84549479328286085344864962717e-1,
      9.24834003261792003115737966543e-1,
    ],
    [
      3.7037037037037037037037037037e-2, 0, 0, 1.70828608729473871279604482173e-1,
      1.25467687566822425016691814123e-1,
    ],
    [
      3.7109375e-2, 0, 0, 1.70252211019544039314978060272e-1, 6.02165389804559606850219397283e-2,
      -1.7578125e-2,
    ],
    [
      3.70920001185047927108779319836e-2, 0, 0, 1.70383925712239993810214054705e-1,
      1.07262030446373284651809199168e-1, -1.53194377486244017527936158236e-2,
      8.27378916381402288758473766002e-3,
    ],
    [
      6.24110958716075717114429577812e-1, 0, 0, -3.36089262944694129406857109825,
      -8.68219346841726006818189891453e-1, 2.75920996994467083049415600797e1,
      2.01540675504778934086186788979e1, -4.34898841810699588477366255144e1,
    ],
    [
      4.77662536438264365890433908527e-1, 0, 0, -2.48811461997166764192642586468,
      -5.90290826836842996371446475743e-1, 2.12300514481811942347288949897e1,
      1.52792336328824235832596922938e1, -3.32882109689848629194453265587e1,
      -2.03312017085086261358222928593e-2,
    ],
    [
      -9.3714243008598732571704021658e-1, 0, 0, 5.18637242884406370830023853209,
      1.09143734899672957818500254654, -8.14978701074692612513997267357,
      -1.85200656599969598641566180701e1, 2.27394870993505042818970056734e1,
      2.49360555267965238987089396762, -3.0467644718982195003823669022,
    ],
    [
      2.27331014751653820792359768449, 0, 0, -1.05344954667372501984066689879e1,
      -2.00087205822486249909675718444, -1.79589318631187989172765950534e1,
      2.79488845294199600508499808837e1, -2.85899827713502369474065508674,
      -8.87285693353062954433549289258, 1.23605671757943030647266201528e1,
      6.43392746015763530355970484046e-1,
    ],
    [
      5.42937341165687622380535766363e-2, 0, 0, 0, 0, 4.45031289275240888144113950566,
      1.89151789931450038304281599044, -5.8012039600105847814672114227,
      3.1116436695781989440891606237e-1, -1.52160949662516078556178806805e-1,
      2.01365400804030348374776537501e-1, 4.47106157277725905176885569043e-2,
    ],
    [
      5.61675022830479523392909219681e-2, 0, 0, 0, 0, 0, 2.53500210216624811088794765333e-1,
      -2.46239037470802489917441475441e-1, -1.24191423263816360469010140626e-1,
      1.5329179827876569731206322685e-1, 8.20105229563468988491666602057e-3,
      7.56789766054569976138603589584e-3, -8.298e-3,
    ],
    [
      3.18346481635021405060768473261e-2, 0, 0, 0, 0, 2.83009096723667755288322961402e-2,
      5.35419883074385676223797384372e-2, -5.49237485713909884646569340306e-2, 0, 0,
      -1.08347328697249322858509316994e-4, 3.82571090835658412954920192323e-4,
      -3.40465008687404560802977114492e-4, 1.41312443674632500278074618366e-1,
    ],
    [
      -4.28896301583791923408573538692e-1, 0, 0, 0, 0, -4.69762141536116384314449447206,
      7.68342119606259904184240953878, 4.06898981839711007970213554331,
      3.56727187455281109270669543021e-1, 0, 0, 0, -1.39902416515901462129418009734e-3,
      2.9475147891527723389556272149, -9.15095847217987001081870187138,
    ],
  ]
  static let b = a[12]
  static let e3: [Double] = {
    var values = b + [0]
    values[0] -= 0.244094488188976377952755905512
    values[8] -= 0.733846688281611857341361741547
    values[11] -= 0.220588235294117647058823529412e-1
    return values
  }()
  static let e5: [Double] = [
    1.312004499419488073250102996e-2, 0, 0, 0, 0, -1.225156446376204440720569753,
    -0.4957589496572501915214079952, 1.664377182454986536961530415, -0.350328848749973681688648729,
    0.334179118713017479029731884, 8.192320648511571570740572413e-2,
    -2.235530786388629627033651784e-2, 0,
  ]
  static let d: [[Double]] = [
    [
      -8.4289382761090128651353491142, 0, 0, 0, 0, 0.56671495351937776962531783590,
      -3.0689499459498916912797304727, 2.3846676565120698287728149680,
      2.1170345824450282767155149946, -0.87139158377797299206789907490,
      2.240437430260788275841771650, 0.63157877876946881815570249290,
      -8.8990336451333310820698117400e-2, 18.148505520854727256656404962,
      -9.1946323924783554000451984436, -4.4360363875948939664310572000,
    ],
    [
      10.427508642579134603413151009, 0, 0, 0, 0, 242.28349177525818288430175319,
      165.20045171727028198505394887, -374.54675472269020279518312152,
      -22.113666853125306036270938578, 7.7334326684722638389603898808,
      -30.674084731089398182061213626, -9.3321305264302278729567221706,
      15.697238121770843886131091075, -31.139403219565177677282850411,
      -9.3529243588444783865713862664, 35.816841486394083752465898540,
    ],
    [
      19.985053242002433820987653617, 0, 0, 0, 0, -387.03730874935176555105901742,
      -189.17813819516756882830838328, 527.80815920542364900561016686,
      -11.573902539959630126141871134, 6.8812326946963000169666922661,
      -1.0006050966910838403183860980, 0.77771377980534432092869265740,
      -2.7782057523535084065932004339, -60.196695231264120758267380846,
      84.320405506677161018159903784, 11.992291136182789328035130030,
    ],
    [
      -25.693933462703749003312586129, 0, 0, 0, 0, -154.18974869023643374053993627,
      -231.52937917604549567536039109, 357.63911791061412378285349910,
      93.405324183624310003907691704, -37.458323136451633156875139351,
      104.09964950896230045147246184, 29.840293426660503123344363579,
      -43.533456590011143754432175058, 96.324553959188282948394950600,
      -39.177261675615439165231486172, -149.72683625798562581422125276,
    ],
  ]
}
