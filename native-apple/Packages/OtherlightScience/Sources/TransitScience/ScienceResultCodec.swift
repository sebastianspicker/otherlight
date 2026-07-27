// Defines strict decoding for runtime result and provenance envelopes.
import Foundation
import TransitScienceContracts

/// Strict result boundary matching the V2 schema's `additionalProperties: false` rules.
public enum ScienceResultCodec {
  /// Decodes untrusted latest-result data after exact-key and provenance validation.
  public static func decodeStrict(from data: Data) throws -> LatestScientificResult {
    let raw = try JSONSerialization.jsonObject(with: data)
    let result = try ScienceRequestCodec.object(raw, path: "result")
    try ScienceRequestCodec.exact(
      result, required: ["kind", "arrowArtifactId", "runManifest"], path: "result")
    let manifest = try ScienceRequestCodec.object(result["runManifest"], path: "result.runManifest")
    try ScienceRequestCodec.exact(
      manifest,
      required: [
        "schemaVersion", "runId", "inputHashSha256", "scientificResult", "implementation",
        "gravitationalConstantM3KgS2", "epochJdTdb", "startedAt", "completedAt",
        "capabilityManifestVersion", "modelVersions", "numericalTolerances", "datasets",
        "validityDomain", "warnings", "randomSeed", "artifact",
      ], path: "result.runManifest")
    try validateImplementation(manifest["implementation"])
    try validateObjectArray(
      manifest["modelVersions"], path: "result.runManifest.modelVersions",
      required: ["id", "version"])
    try validateObjectArray(
      manifest["datasets"], path: "result.runManifest.datasets",
      required: ["id", "version", "sha256"])
    let tolerances = try ScienceRequestCodec.object(
      manifest["numericalTolerances"], path: "result.runManifest.numericalTolerances")
    try ScienceRequestCodec.exact(
      tolerances,
      required: [
        "requestedPositionToleranceM", "effectivePositionToleranceM",
        "requestedVelocityToleranceMps",
        "effectiveVelocityToleranceMps", "requestedRelativeTolerance", "effectiveRelativeTolerance",
        "requestedMaxStepSec", "effectiveMaxStepSec",
      ], path: "result.runManifest.numericalTolerances")
    let artifact = try ScienceRequestCodec.object(
      manifest["artifact"], path: "result.runManifest.artifact")
    try ScienceRequestCodec.exact(
      artifact, required: ["idSha256", "format", "schemaVersion", "rowCount"],
      path: "result.runManifest.artifact")
    let decoded = try JSONDecoder().decode(TrustedResult.self, from: data)
    guard decoded.kind == "forward" else {
      throw ScienceContractError.invalid("result.kind", "exactly 'forward'")
    }
    return try LatestScientificResult(
      arrowArtifactId: decoded.arrowArtifactId, runManifest: decoded.runManifest)
  }

  /// Validates the exact nested implementation provenance object.
  private static func validateImplementation(_ raw: Any?) throws {
    let path = "result.runManifest.implementation"
    let implementation = try ScienceRequestCodec.object(raw, path: path)
    try ScienceRequestCodec.exact(
      implementation, required: ["application", "engine", "runtime", "artifactWriter", "platform"],
      path: path)
    for (key, fields) in [
      ("application", ["name", "version", "build"]), ("engine", ["kind", "name", "version"]),
      ("runtime", ["name", "version"]), ("artifactWriter", ["name", "version"]),
      ("platform", ["os", "architecture"]),
    ] {
      let nestedPath = "\(path).\(key)"
      let nested = try ScienceRequestCodec.object(implementation[key], path: nestedPath)
      try ScienceRequestCodec.exact(nested, required: Set(fields), path: nestedPath)
    }
  }

  /// Validates an array of exact-schema metadata objects.
  private static func validateObjectArray(_ raw: Any?, path: String, required: Set<String>) throws {
    guard let values = raw as? [Any] else { throw ScienceContractError.invalid(path, "an array") }
    for (index, value) in values.enumerated() {
      let itemPath = "\(path)[\(index)]"
      let object = try ScienceRequestCodec.object(value, path: itemPath)
      try ScienceRequestCodec.exact(object, required: required, path: itemPath)
    }
  }

  /// Restricts Codable construction to the envelope already checked above.
  private struct TrustedResult: Decodable {
    let kind: String
    let arrowArtifactId: String
    let runManifest: RunManifestV2
  }
}
