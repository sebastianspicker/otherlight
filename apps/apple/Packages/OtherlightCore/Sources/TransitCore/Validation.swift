// Defines validation errors shared by the model, codec, and simulation boundaries.
import Foundation

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
  /// Creates an error containing the ordered validation issues for a rejected input.
  public init(_ issues: [ValidationIssue]) { self.issues = issues }
  public var errorDescription: String? {
    issues.map { String(describing: $0) }.joined(separator: "; ")
  }
}
