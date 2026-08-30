// Certifies finite-radius collision safety from DOP853 dense-output polynomials.
import Foundation
import TransitScienceContracts

/// Bounds the run-wide work spent proving dense-output collision safety.
struct CertifiedCollisionAuditWork: Sendable {
  private static let maximumNodes = 2_000_000
  private(set) var visitedNodes = 0

  /// Records one node, refusing to exceed the proof budget shared by both integration legs.
  mutating func recordNode() -> Bool {
    guard visitedNodes < Self.maximumNodes else { return false }
    visitedNodes += 1
    return true
  }
}

/// Uses interval Bernstein subdivision to certify a pair's separation over one dense step.
enum CertifiedCollisionAudit {
  /// Distinguishes a proven safe interval from contact or an intentionally fail-closed proof gap.
  enum Result: Equatable, Sendable {
    case safe
    case contact
    case indeterminate
  }

  private static let degree = 14
  private static let maximumDepth = 32
  private static let maximumNodesPerPairStep = 4_096

  /// Certifies relative-position power coefficients supplied by the dense-output audit entry.
  static func certify(
    relativePower: [[Interval]],
    contactDistance: Double,
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void,
    work: inout CertifiedCollisionAuditWork
  ) throws -> Result {
    guard relativePower.count == 3, relativePower.allSatisfy({ $0.count == 8 }),
      contactDistance.isFinite, contactDistance >= 0
    else { throw indeterminateError() }
    let q = try separationPolynomial(relativePower: relativePower, contactDistance: contactDistance)
    return try classify(
      control: powerToBernstein(q),
      cancellation: cancellation,
      elapsedCheck: elapsedCheck,
      work: &work)
  }

  /// Test-only vector entry that exercises the same outward-rounded proof machinery.
  static func certify(
    relativePower: [[Double]],
    contactDistance: Double
  ) throws -> Result {
    guard relativePower.count == 3, relativePower.allSatisfy({ $0.count == 8 }) else {
      throw indeterminateError()
    }
    var work = CertifiedCollisionAuditWork()
    return try certify(
      relativePower: relativePower.map { $0.map(Interval.point) },
      contactDistance: contactDistance,
      cancellation: { false },
      elapsedCheck: {},
      work: &work)
  }

  /// Squares and sums the three relative axes, then subtracts the squared contact radius.
  private static func separationPolynomial(
    relativePower: [[Interval]], contactDistance: Double
  ) throws -> [Interval] {
    var q = [Interval](repeating: .zero, count: degree + 1)
    for axis in relativePower {
      for left in axis.indices {
        for right in axis.indices {
          q[left + right] = try Interval.add(
            q[left + right], Interval.multiply(axis[left], axis[right]))
        }
      }
    }
    q[0] = try Interval.subtract(
      q[0], Interval.multiply(.point(contactDistance), .point(contactDistance)))
    return q
  }

  /// Converts a degree-14 power basis polynomial into outward-rounded Bernstein intervals.
  private static func powerToBernstein(_ power: [Interval]) throws -> [Interval] {
    guard power.count == degree + 1 else { throw indeterminateError() }
    return try (0...degree).map { index in
      var coefficient = Interval.zero
      for powerIndex in 0...index {
        let ratio = try Interval.divide(
          .point(Double(binomial(index, powerIndex))),
          .point(Double(binomial(degree, powerIndex))))
        coefficient = try Interval.add(coefficient, Interval.multiply(power[powerIndex], ratio))
      }
      return coefficient
    }
  }

  /// Walks the Bernstein tree in accepted-step order, proving safety or failing closed.
  private static func classify(
    control: [Interval],
    cancellation: @escaping DOP853Integrator.Cancellation,
    elapsedCheck: @escaping @Sendable () throws -> Void,
    work: inout CertifiedCollisionAuditWork
  ) throws -> Result {
    var pending = [(control: control, depth: 0)]
    var nodesForPairStep = 0
    while let node = pending.popLast() {
      guard nodesForPairStep < maximumNodesPerPairStep, work.recordNode() else {
        return .indeterminate
      }
      nodesForPairStep += 1
      if nodesForPairStep.isMultiple(of: 64) {
        try elapsedCheck()
        guard !cancellation() else {
          throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
        }
      }
      guard let first = node.control.first, let last = node.control.last else {
        throw indeterminateError()
      }
      if first.upper <= 0 || last.upper <= 0 { return .contact }
      if node.control.allSatisfy({ $0.lower > 0 }) { continue }
      let split = try deCasteljauSplit(node.control)
      guard let midpoint = split.left.last, midpoint.upper.isFinite else {
        throw indeterminateError()
      }
      if midpoint.upper <= 0 { return .contact }
      guard node.depth < maximumDepth else { return .indeterminate }
      // Stack is LIFO, so pushing right then left visits increasing x in integration order.
      pending.append((control: split.right, depth: node.depth + 1))
      pending.append((control: split.left, depth: node.depth + 1))
    }
    return .safe
  }

  /// Splits one Bernstein interval at x = 1/2 using interval de Casteljau evaluation.
  private static func deCasteljauSplit(
    _ control: [Interval]
  ) throws -> (left: [Interval], right: [Interval]) {
    guard control.count == degree + 1 else { throw indeterminateError() }
    var current = control
    var left = [current[0]]
    var right = [Interval](repeating: .zero, count: degree + 1)
    right[degree] = current[degree]
    for level in 1...degree {
      current = try zip(current, current.dropFirst()).map { pair in
        try Interval.divide(Interval.add(pair.0, pair.1), .point(2))
      }
      left.append(current[0])
      right[degree - level] = current[current.count - 1]
    }
    return (left, right)
  }

  /// Returns a small exact binomial coefficient for the fixed degree-14 conversion.
  private static func binomial(_ n: Int, _ k: Int) -> Int {
    guard k > 0, k < n else { return 1 }
    let reduced = min(k, n - k)
    return (1...reduced).reduce(1) { value, index in value * (n - reduced + index) / index }
  }

  /// Produces one consistent fail-closed error for malformed or overflowed interval arithmetic.
  fileprivate static func indeterminateError() -> ScienceContractError {
    .unsupportedExecution("collision safety indeterminate during native propagation")
  }
}

/// Represents a finite closed interval whose arithmetic is rounded outward at each operation.
struct Interval: Sendable {
  let lower: Double
  let upper: Double

  static let zero = Interval(lower: 0, upper: 0)

  /// Wraps one exactly represented scalar before later operations add outward rounding.
  static func point(_ value: Double) -> Interval {
    .init(lower: value, upper: value)
  }

  /// Adds a nonempty list of intervals with outward rounding after each operation.
  static func add(_ first: Interval, _ rest: Interval...) throws -> Interval {
    try rest.reduce(first) { try add($0, $1) }
  }

  /// Adds two intervals while enclosing both floating-point endpoint errors.
  static func add(_ left: Interval, _ right: Interval) throws -> Interval {
    try checked(
      lower: (left.lower + right.lower).nextDown,
      upper: (left.upper + right.upper).nextUp)
  }

  /// Subtracts two intervals while preserving a conservative enclosure.
  static func subtract(_ left: Interval, _ right: Interval) throws -> Interval {
    try checked(
      lower: (left.lower - right.upper).nextDown,
      upper: (left.upper - right.lower).nextUp)
  }

  /// Negates an interval exactly by swapping and signing its endpoints.
  static func negated(_ value: Interval) throws -> Interval {
    try checked(lower: -value.upper, upper: -value.lower)
  }

  /// Multiplies two intervals and rounds the extremal products outward.
  static func multiply(_ left: Interval, _ right: Interval) throws -> Interval {
    let products = [
      left.lower * right.lower,
      left.lower * right.upper,
      left.upper * right.lower,
      left.upper * right.upper,
    ]
    guard let minimum = products.min(), let maximum = products.max() else {
      throw CertifiedCollisionAudit.indeterminateError()
    }
    return try checked(lower: minimum.nextDown, upper: maximum.nextUp)
  }

  /// Divides by an interval that is proven not to contain zero.
  static func divide(_ left: Interval, _ right: Interval) throws -> Interval {
    guard right.lower > 0 || right.upper < 0 else {
      throw CertifiedCollisionAudit.indeterminateError()
    }
    let quotients = [
      left.lower / right.lower,
      left.lower / right.upper,
      left.upper / right.lower,
      left.upper / right.upper,
    ]
    guard let minimum = quotients.min(), let maximum = quotients.max() else {
      throw CertifiedCollisionAudit.indeterminateError()
    }
    return try checked(lower: minimum.nextDown, upper: maximum.nextUp)
  }

  /// Rejects non-finite or inverted bounds before constructing an interval.
  private static func checked(lower: Double, upper: Double) throws -> Interval {
    guard lower.isFinite, upper.isFinite, lower <= upper else {
      throw CertifiedCollisionAudit.indeterminateError()
    }
    return .init(lower: lower, upper: upper)
  }
}
