// Composes validated native propagation, Arrow IPC publication, and engine-neutral provenance.
import Foundation
import TransitScienceContracts

/// Supplies application and platform provenance required to publish a native scientific run.
public struct NativeScienceRunMetadata: Sendable {
  public let application: ScienceImplementation.Application
  public let runtime: NamedScienceVersion
  public let platform: ScienceImplementation.Platform
  public let capabilityManifestVersion: String
  public let warnings: [String]

  /// Creates the immutable provenance inputs supplied by the hosting application.
  public init(
    application: ScienceImplementation.Application, runtime: NamedScienceVersion,
    platform: ScienceImplementation.Platform, capabilityManifestVersion: String,
    warnings: [String] = []
  ) {
    self.application = application
    self.runtime = runtime
    self.platform = platform
    self.capabilityManifestVersion = capabilityManifestVersion
    self.warnings = warnings
  }

  /// Rejects incomplete or duplicate provenance before an artifact can be attributed to this runner.
  fileprivate func validate() throws {
    guard !application.name.isEmpty, !application.version.isEmpty, !application.build.isEmpty,
      !runtime.name.isEmpty, !runtime.version.isEmpty,
      !platform.os.isEmpty, !platform.architecture.isEmpty,
      !capabilityManifestVersion.isEmpty,
      warnings.allSatisfy({ !$0.isEmpty }), Set(warnings).count == warnings.count
    else {
      throw ScienceContractError.invalid(
        "nativeRunMetadata", "non-empty implementation metadata and unique non-empty warnings")
    }
  }
}

/// Keeps artifact bytes and their manifest together in memory until the caller explicitly exports.
public struct NativeScientificRunOutput: Sendable {
  public let result: LatestScientificResult
  public let arrowIPCFile: Data
  public let acceptedSteps: Int
  public let rhsEvaluations: Int

  /// Keeps only artifact bytes whose fingerprint agrees with the result manifest.
  fileprivate init(
    result: LatestScientificResult, arrowIPCFile: Data, acceptedSteps: Int, rhsEvaluations: Int
  ) throws {
    guard ScienceCanonicalJSON.artifactFingerprint(arrowIPCFile) == result.arrowArtifactId else {
      throw ScienceContractError.unsupportedExecution(
        "native Arrow bytes do not match their provenance artifact identifier")
    }
    self.result = result
    self.arrowIPCFile = arrowIPCFile
    self.acceptedSteps = acceptedSteps
    self.rhsEvaluations = rhsEvaluations
  }
}

/// Runs the experimental native lane without writing durable state or silently falling back to V4.
public struct NativeScientificForwardRunner: Sendable {
  /// Supplies run timestamps so hosts and tests can control provenance time sources.
  public typealias TimestampProvider = @Sendable () -> Date
  /// Supplies run identifiers so each manifest has a stable, injectable identity source.
  public typealias RunIDProvider = @Sendable () -> String

  private let metadata: NativeScienceRunMetadata
  private let now: TimestampProvider
  private let runID: RunIDProvider

  /// Creates a runner with injectable clock and identifier sources for deterministic tests.
  public init(
    metadata: NativeScienceRunMetadata,
    now: @escaping TimestampProvider = { Date() },
    runID: @escaping RunIDProvider = { UUID().uuidString.lowercased() }
  ) {
    self.metadata = metadata
    self.now = now
    self.runID = runID
  }

  /// Validates, propagates, writes Arrow bytes, and binds all results to a provenance manifest.
  public func run(
    _ request: ScientificForwardRequestV5,
    cancellation: @escaping DOP853Integrator.Cancellation = { false }
  ) throws -> NativeScientificRunOutput {
    try request.validate()
    try metadata.validate()
    let runIdentifier = runID()
    guard !runIdentifier.isEmpty else {
      throw ScienceContractError.invalid("nativeRunMetadata.runId", "a non-empty value")
    }
    let startedAt = Self.timestamp(now())
    let propagation = try NativeDOP853ForwardPropagator().propagate(
      request, cancellation: cancellation)
    guard !cancellation() else {
      throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
    }
    // The production path deliberately owns its concrete writer. An arbitrary protocol
    // implementation cannot label unrelated bytes as a scientific Arrow artifact.
    let arrow = try ArrowSwiftIPCWriter().writeRadialVelocity(
      timesSeconds: propagation.sampleTimesSeconds,
      velocitiesMps: propagation.radialVelocitiesMps)
    guard !cancellation() else {
      throw ScienceContractError.unsupportedExecution("scientific run was cancelled")
    }
    let artifactID = ScienceCanonicalJSON.artifactFingerprint(arrow)
    let completedAt = Self.timestamp(now())
    let integrator = request.scenario.integrator
    let manifest = RunManifestV2(
      identity: .init(
        runId: runIdentifier,
        inputHashSha256: try ScienceCanonicalJSON.requestFingerprint(request)),
      execution: .init(
        implementation: Self.implementation(metadata),
        gravitationalConstantM3KgS2: ScienceLimits.gravitationalConstant,
        epochJdTdb: request.scenario.epochJdTdb,
        startedAt: startedAt,
        completedAt: completedAt,
        capabilityManifestVersion: metadata.capabilityManifestVersion),
      provenance: .init(
        modelVersions: Self.modelVersions,
        numericalTolerances: [
          "requestedPositionToleranceM": integrator.positionToleranceM,
          "effectivePositionToleranceM": integrator.positionToleranceM,
          "requestedVelocityToleranceMps": integrator.velocityToleranceMps,
          "effectiveVelocityToleranceMps": integrator.velocityToleranceMps,
          "requestedRelativeTolerance": integrator.relativeTolerance,
          "effectiveRelativeTolerance": integrator.relativeTolerance,
          "requestedMaxStepSec": integrator.maxStepSec,
          "effectiveMaxStepSec": integrator.maxStepSec,
        ],
        datasets: [],
        validityDomain: Self.validityDomain,
        warnings: metadata.warnings,
        randomSeed: request.seed,
        artifact: .init(
          idSha256: artifactID, format: "arrow-ipc-file",
          schemaVersion: "radial-velocity-v1", rowCount: propagation.sampleTimesSeconds.count)))
    try manifest.validate()
    let result = try LatestScientificResult(arrowArtifactId: artifactID, runManifest: manifest)
    return try NativeScientificRunOutput(
      result: result, arrowIPCFile: arrow, acceptedSteps: propagation.acceptedSteps,
      rhsEvaluations: propagation.rhsEvaluations)
  }

  /// Formats run timestamps consistently with the manifest's strict ISO-8601 validation.
  private static func timestamp(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  /// Constructs the engine identity rather than allowing callers to mislabel the native path.
  private static func implementation(_ metadata: NativeScienceRunMetadata) -> ScienceImplementation
  {
    ScienceImplementation(
      application: metadata.application,
      engine: .init(kind: "swift-native", name: "DOP853", version: "scipy-1.18.0-source-port-v1"),
      runtime: metadata.runtime,
      artifactWriter: .init(
        name: "Apache Arrow Swift",
        version: "f57187964af9d073b68c2097bf088fa87f2b9509"),
      platform: metadata.platform)
  }

  private static let modelVersions = [
    ScienceModelVersion(
      id: "dynamics", version: "newtonian-point-mass-certified-dense-boundary-v3"),
    ScienceModelVersion(id: "radial_velocity", version: "barycentric-positive-receding-v1"),
  ]

  private static let validityDomain = [
    "Newtonian gravitating masses with finite radii used as a contact boundary",
    "accepted numerical dense trajectories are certified outside finite-radius contact; no collision physics",
    "observer fixed at effectively infinite direction",
  ]
}
