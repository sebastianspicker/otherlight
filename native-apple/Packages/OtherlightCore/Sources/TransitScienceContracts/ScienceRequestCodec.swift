// Defines strict JSON decoding and validation errors for scientific requests.
import Foundation

/// Classifies strict-contract failures separately from unavailable execution lanes.
public enum ScienceContractError: Error, LocalizedError, Equatable, Sendable {
  case invalid(String, String)
  case unsupportedExecution(String)
  /// Renders concise user-facing failure text while preserving the original validation path.
  public var errorDescription: String? {
    switch self {
    case .invalid(let path, let rule): "\(path) must contain \(rule)"
    case .unsupportedExecution(let message): message
    }
  }
}

/// Strict untrusted-data boundary. Synthesized `Codable` remains available for trusted values,
/// while portable workspace/import callers use this exact-key decoder.
public enum ScienceRequestCodec {
  /// Decodes untrusted JSON only after every object is checked for exact required keys.
  public static func decodeStrict(from data: Data) throws -> ScientificForwardRequestV5 {
    let raw = try JSONSerialization.jsonObject(with: data)
    let request = try object(raw, path: "request")
    try exact(
      request,
      required: [
        "kind", "scenario", "startOffsetSec", "endOffsetSec", "sampleCadenceSec", "outputs",
        "seed",
      ], path: "request")
    let scenario = try object(request["scenario"], path: "request.scenario")
    try exact(
      scenario,
      required: [
        "schemaVersion", "id", "epochJdTdb", "timeScale", "bodies", "observer", "integrator",
      ], path: "request.scenario")
    guard let bodies = scenario["bodies"] as? [Any] else {
      throw ScienceContractError.invalid("request.scenario.bodies", "an array")
    }
    for (index, rawBody) in bodies.enumerated() {
      let path = "request.scenario.bodies[\(index)]"
      let body = try object(rawBody, path: path)
      try exact(body, required: ["id", "kind", "massKg", "radiusM", "state"], path: path)
      let state = try object(body["state"], path: "\(path).state")
      try exact(state, required: ["positionM", "velocityMps"], path: "\(path).state")
    }
    let observer = try object(scenario["observer"], path: "request.scenario.observer")
    try exact(
      observer, required: ["lineOfSight", "targetBodyId"], optional: ["distanceM"],
      path: "request.scenario.observer")
    guard !(observer["distanceM"] is NSNull) else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.distanceM", "a finite positive value when present")
    }
    let integrator = try object(scenario["integrator"], path: "request.scenario.integrator")
    try exact(
      integrator,
      required: [
        "method", "positionToleranceM", "velocityToleranceMps", "relativeTolerance", "maxStepSec",
      ], path: "request.scenario.integrator")
    let decoded = try JSONDecoder().decode(ScientificForwardRequestV5.self, from: data)
    try decoded.validate()
    return decoded
  }

  /// Requires a JSON object at a named path before its exact schema is examined.
  public static func object(_ value: Any?, path: String) throws -> [String: Any] {
    guard let value = value as? [String: Any] else {
      throw ScienceContractError.invalid(path, "an object")
    }
    return value
  }

  /// Requires precisely the listed keys to prevent silently accepting contract extensions.
  public static func exact(
    _ value: [String: Any], required: Set<String>, optional: Set<String> = [], path: String
  ) throws {
    let actual = Set(value.keys)
    let missing = required.subtracting(actual)
    let unknown = actual.subtracting(required.union(optional))
    guard missing.isEmpty else {
      throw ScienceContractError.invalid(
        path, "required fields \(missing.sorted().joined(separator: ", "))")
    }
    guard unknown.isEmpty else {
      throw ScienceContractError.invalid(
        path, "no unsupported fields \(unknown.sorted().joined(separator: ", "))")
    }
  }
}

/// Produces deterministic request JSON and SHA-256 identifiers across supported runtimes.
