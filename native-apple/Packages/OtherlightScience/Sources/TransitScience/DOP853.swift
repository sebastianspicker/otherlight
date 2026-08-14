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

  /// Certifies one pair's dense trajectory against finite-radius contact without exposing rows.
  func certifiedCollisionAudit(
    leftStateOffset: Int,
    rightStateOffset: Int,
    contactDistance: Double,
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void,
    work: inout CertifiedCollisionAuditWork
  ) throws -> CertifiedCollisionAudit.Result {
    let relativePower = try relativePowerCoefficients(
      leftStateOffset: leftStateOffset,
      rightStateOffset: rightStateOffset)
    return try CertifiedCollisionAudit.certify(
      relativePower: relativePower,
      contactDistance: contactDistance,
      cancellation: cancellation,
      elapsedCheck: elapsedCheck,
      work: &work)
  }

  /// Converts this output's private alternating rows to the audit's relative position powers.
  private func relativePowerCoefficients(
    leftStateOffset: Int, rightStateOffset: Int
  ) throws -> [[Interval]] {
    guard coefficients.count == 7, leftStateOffset >= 0, rightStateOffset >= 0,
      leftStateOffset + 2 < initialState.count, rightStateOffset + 2 < initialState.count,
      coefficients.allSatisfy({
        leftStateOffset + 2 < $0.count && rightStateOffset + 2 < $0.count
      })
    else {
      throw ScienceContractError.unsupportedExecution(
        "collision safety indeterminate during native propagation")
    }

    return try (0..<3).map { axis in
      let left = leftStateOffset + axis
      let right = rightStateOffset + axis
      let delta = try Interval.subtract(.point(initialState[right]), .point(initialState[left]))
      let g = try coefficients.map {
        try Interval.subtract(.point($0[right]), .point($0[left]))
      }
      return try [
        delta,
        Interval.add(g[0], g[1]),
        Interval.add(try Interval.negated(g[1]), try Interval.add(g[2], g[3])),
        Interval.add(
          try Interval.negated(g[2]),
          try Interval.add(
            try Interval.negated(try Interval.multiply(.point(2), g[3])), g[4], g[5])),
        Interval.add(
          g[3],
          try Interval.add(
            try Interval.negated(try Interval.multiply(.point(2), g[4])),
            try Interval.negated(try Interval.multiply(.point(3), g[5])), g[6])),
        Interval.add(
          g[4],
          try Interval.add(
            try Interval.multiply(.point(3), g[5]),
            try Interval.negated(try Interval.multiply(.point(3), g[6])))),
        Interval.add(try Interval.negated(g[5]), try Interval.multiply(.point(3), g[6])),
        try Interval.negated(g[6]),
      ]
    }
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

  /// Shares integration implementation with native orchestration that owns one run-wide budget.
  func integrate(
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
