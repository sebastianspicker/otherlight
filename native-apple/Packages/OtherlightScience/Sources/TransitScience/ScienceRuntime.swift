// Defines scientific work limits, publication contracts, and explicit fail-closed runtime seams.
import Foundation
import TransitScienceContracts

/// Enforces finite time, accepted-step, and right-hand-side work budgets during propagation.
public struct ScienceWorkBudget: Sendable {
  private let startedAt: ContinuousClock.Instant
  public private(set) var acceptedSteps = 0
  public private(set) var rhsEvaluations = 0
  private let clock = ContinuousClock()

  /// Starts an independent work budget at construction time.
  public init() { startedAt = ContinuousClock().now }

  /// Records one derivative evaluation and fails closed when its allowance is exhausted.
  public mutating func recordRHS() throws {
    rhsEvaluations += 1
    guard rhsEvaluations <= ScienceLimits.maximumRHSEvaluations else {
      throw ScienceContractError.unsupportedExecution(
        "scientific run exceeded \(ScienceLimits.maximumRHSEvaluations) RHS evaluations")
    }
    try checkElapsed()
  }

  /// Records one accepted integrator step and enforces its fixed allowance.
  public mutating func recordAcceptedStep() throws {
    acceptedSteps += 1
    guard acceptedSteps <= ScienceLimits.maximumAcceptedSteps else {
      throw ScienceContractError.unsupportedExecution(
        "scientific run exceeded \(ScienceLimits.maximumAcceptedSteps) accepted steps")
    }
    try checkElapsed()
  }

  /// Rejects execution after the wall-time budget so callers cannot publish an overrun result.
  public func checkElapsed() throws {
    guard startedAt.duration(to: clock.now) <= .seconds(ScienceLimits.maximumWallTimeSeconds) else {
      throw ScienceContractError.unsupportedExecution(
        "scientific run exceeded \(Int(ScienceLimits.maximumWallTimeSeconds)) seconds")
    }
  }
}

/// Identifies the serialized scientific artifact referenced by a run manifest.
public struct ScienceArtifact: Codable, Equatable, Sendable {
  public let idSha256: String
  public let format: String
  public let schemaVersion: String
  public let rowCount: Int

  /// Creates immutable artifact metadata used to verify publication provenance.
  public init(idSha256: String, format: String, schemaVersion: String, rowCount: Int) {
    self.idSha256 = idSha256
    self.format = format
    self.schemaVersion = schemaVersion
    self.rowCount = rowCount
  }
}

/// Pairs a named runtime or writer with its concrete version for provenance.
public struct NamedScienceVersion: Codable, Equatable, Sendable {
  public let name: String
  public let version: String

  /// Creates a stable name-version pair without interpreting version semantics.
  public init(name: String, version: String) {
    self.name = name
    self.version = version
  }
}

/// Records one physical or numerical model version used for a result.
public struct ScienceModelVersion: Codable, Equatable, Sendable {
  public let id: String
  public let version: String

  /// Creates a model provenance entry from its stable identifier and version.
  public init(id: String, version: String) {
    self.id = id
    self.version = version
  }
}

/// Identifies the application, engine, runtime, writer, and platform that produced a result.
public struct ScienceImplementation: Codable, Equatable, Sendable {
  /// Identifies the hosting application build for provenance.
  public struct Application: Codable, Equatable, Sendable {
    public let name: String
    public let version: String
    public let build: String

    /// Creates a concrete application identity for manifest serialization.
    public init(name: String, version: String, build: String) {
      self.name = name
      self.version = version
      self.build = build
    }
  }
  /// Identifies the propagation engine used to produce the data.
  public struct Engine: Codable, Equatable, Sendable {
    public let kind: String
    public let name: String
    public let version: String

    /// Creates an engine identity while preserving the manifest's serialized fields.
    public init(kind: String, name: String, version: String) {
      self.kind = kind
      self.name = name
      self.version = version
    }
  }
  public let application: Application
  public let engine: Engine
  public let runtime: NamedScienceVersion
  public let artifactWriter: NamedScienceVersion
  public let platform: Platform
  /// Identifies the operating-system and CPU architecture provenance.
  public struct Platform: Codable, Equatable, Sendable {
    public let os: String
    public let architecture: String

    /// Creates a platform identity for reproducibility diagnostics.
    public init(os: String, architecture: String) {
      self.os = os
      self.architecture = architecture
    }
  }

  /// Creates a complete implementation identity without supplying runtime timestamps.
  public init(
    application: Application, engine: Engine, runtime: NamedScienceVersion,
    artifactWriter: NamedScienceVersion, platform: Platform
  ) {
    self.application = application
    self.engine = engine
    self.runtime = runtime
    self.artifactWriter = artifactWriter
    self.platform = platform
  }
}

/// Engine-neutral V2 provenance. A caller supplies timestamps rather than fabricating run timing.
public struct RunManifestV2: Codable, Equatable, Sendable {
  public let schemaVersion: String
  public let runId: String
  public let inputHashSha256: String
  public let scientificResult: Bool
  public let implementation: ScienceImplementation
  public let gravitationalConstantM3KgS2: Double
  public let epochJdTdb: Double
  public let startedAt: String
  public let completedAt: String
  public let capabilityManifestVersion: String
  public let modelVersions: [ScienceModelVersion]
  public let numericalTolerances: [String: Double]
  public let datasets: [ScienceDataset]
  public let validityDomain: [String]
  public let warnings: [String]
  public let randomSeed: Int64
  public let artifact: ScienceArtifact
  /// Identifies an optional input dataset used during scientific execution.
  public struct ScienceDataset: Codable, Equatable, Sendable {
    public let id: String
    public let version: String
    public let sha256: String

    /// Creates a dataset provenance entry with a content fingerprint.
    public init(id: String, version: String, sha256: String) {
      self.id = id
      self.version = version
      self.sha256 = sha256
    }
  }

  /// Groups immutable manifest identity fields that describe one submitted scientific run.
  public struct Identity: Codable, Equatable, Sendable {
    public let schemaVersion: String
    public let runId: String
    public let inputHashSha256: String
    public let scientificResult: Bool

    /// Creates the manifest identity while retaining the V2 and scientific-result defaults.
    public init(
      runId: String, inputHashSha256: String,
      schemaVersion: String = "science-run-manifest-v2", scientificResult: Bool = true
    ) {
      self.schemaVersion = schemaVersion
      self.runId = runId
      self.inputHashSha256 = inputHashSha256
      self.scientificResult = scientificResult
    }
  }

  /// Groups the engine, physical constants, and timestamps recorded for a run.
  public struct Execution: Codable, Equatable, Sendable {
    public let implementation: ScienceImplementation
    public let gravitationalConstantM3KgS2: Double
    public let epochJdTdb: Double
    public let startedAt: String
    public let completedAt: String
    public let capabilityManifestVersion: String

    /// Creates the execution metadata whose values are validated when the manifest is accepted.
    public init(
      implementation: ScienceImplementation, gravitationalConstantM3KgS2: Double,
      epochJdTdb: Double, startedAt: String, completedAt: String,
      capabilityManifestVersion: String
    ) {
      self.implementation = implementation
      self.gravitationalConstantM3KgS2 = gravitationalConstantM3KgS2
      self.epochJdTdb = epochJdTdb
      self.startedAt = startedAt
      self.completedAt = completedAt
      self.capabilityManifestVersion = capabilityManifestVersion
    }
  }

  /// Groups model, dataset, tolerance, and artifact provenance for a run result.
  public struct Provenance: Codable, Equatable, Sendable {
    public let modelVersions: [ScienceModelVersion]
    public let numericalTolerances: [String: Double]
    public let datasets: [ScienceDataset]
    public let validityDomain: [String]
    public let warnings: [String]
    public let randomSeed: Int64
    public let artifact: ScienceArtifact

    /// Creates the provenance fields whose consistency is checked by the manifest validator.
    public init(
      modelVersions: [ScienceModelVersion], numericalTolerances: [String: Double],
      datasets: [ScienceDataset], validityDomain: [String], warnings: [String],
      randomSeed: Int64, artifact: ScienceArtifact
    ) {
      self.modelVersions = modelVersions
      self.numericalTolerances = numericalTolerances
      self.datasets = datasets
      self.validityDomain = validityDomain
      self.warnings = warnings
      self.randomSeed = randomSeed
      self.artifact = artifact
    }
  }

  /// Creates the full V2 manifest from cohesive identity, execution, and provenance records.
  public init(
    identity: Identity, execution: Execution, provenance: Provenance
  ) {
    schemaVersion = identity.schemaVersion
    runId = identity.runId
    inputHashSha256 = identity.inputHashSha256
    scientificResult = identity.scientificResult
    implementation = execution.implementation
    gravitationalConstantM3KgS2 = execution.gravitationalConstantM3KgS2
    epochJdTdb = execution.epochJdTdb
    startedAt = execution.startedAt
    completedAt = execution.completedAt
    capabilityManifestVersion = execution.capabilityManifestVersion
    modelVersions = provenance.modelVersions
    numericalTolerances = provenance.numericalTolerances
    datasets = provenance.datasets
    validityDomain = provenance.validityDomain
    warnings = provenance.warnings
    randomSeed = provenance.randomSeed
    artifact = provenance.artifact
  }

  /// Enforces the strict V2 provenance contract before a result is accepted or serialized.
  public func validate() throws {
    let hashPattern = "^[0-9a-f]{64}$"
    let toleranceKeys: Set<String> = [
      "requestedPositionToleranceM", "effectivePositionToleranceM",
      "requestedVelocityToleranceMps", "effectiveVelocityToleranceMps",
      "requestedRelativeTolerance", "effectiveRelativeTolerance",
      "requestedMaxStepSec", "effectiveMaxStepSec",
    ]
    let tolerancePairs = [
      ("requestedPositionToleranceM", "effectivePositionToleranceM"),
      ("requestedVelocityToleranceMps", "effectiveVelocityToleranceMps"),
      ("requestedRelativeTolerance", "effectiveRelativeTolerance"),
      ("requestedMaxStepSec", "effectiveMaxStepSec"),
    ]
    let modelIDs = modelVersions.map(\.id)
    let datasetIDs = datasets.map(\.id)
    guard let startedDate = Self.timestampDate(startedAt),
      let completedDate = Self.timestampDate(completedAt), completedDate >= startedDate
    else { throw ScienceContractError.invalid("runManifest timestamps", "ordered ISO-8601 values") }
    guard schemaVersion == "science-run-manifest-v2", scientificResult,
      inputHashSha256.range(of: hashPattern, options: .regularExpression) != nil,
      artifact.idSha256.range(of: hashPattern, options: .regularExpression) != nil,
      artifact.format == "arrow-ipc-file", artifact.schemaVersion == "radial-velocity-v1",
      artifact.rowCount > 0, artifact.rowCount <= ScienceLimits.maximumSamples,
      !runId.isEmpty, gravitationalConstantM3KgS2 == ScienceLimits.gravitationalConstant,
      epochJdTdb.isFinite, epochJdTdb > 0,
      !capabilityManifestVersion.isEmpty,
      !implementation.application.name.isEmpty, !implementation.application.version.isEmpty,
      !implementation.application.build.isEmpty,
      ["python-scipy", "swift-native"].contains(implementation.engine.kind),
      !implementation.engine.name.isEmpty, !implementation.engine.version.isEmpty,
      !implementation.runtime.name.isEmpty, !implementation.runtime.version.isEmpty,
      !implementation.artifactWriter.name.isEmpty, !implementation.artifactWriter.version.isEmpty,
      !implementation.platform.os.isEmpty, !implementation.platform.architecture.isEmpty,
      !modelVersions.isEmpty, modelVersions.allSatisfy({ !$0.id.isEmpty && !$0.version.isEmpty }),
      Set(modelIDs).count == modelIDs.count,
      Set(numericalTolerances.keys) == toleranceKeys,
      numericalTolerances.values.allSatisfy({ $0.isFinite && $0 > 0 }),
      tolerancePairs.allSatisfy({ numericalTolerances[$0.0] == numericalTolerances[$0.1] }),
      numericalTolerances["requestedRelativeTolerance"].map({
        $0 >= ScienceLimits.minimumRelativeTolerance && $0 < 1
      }) == true,
      datasets.allSatisfy({
        !$0.id.isEmpty && !$0.version.isEmpty
          && $0.sha256.range(of: hashPattern, options: .regularExpression) != nil
      }),
      Set(datasetIDs).count == datasetIDs.count,
      !validityDomain.isEmpty, validityDomain.allSatisfy({ !$0.isEmpty }),
      Set(validityDomain).count == validityDomain.count,
      warnings.allSatisfy({ !$0.isEmpty }), Set(warnings).count == warnings.count,
      randomSeed >= -9_007_199_254_740_991, randomSeed <= 9_007_199_254_740_991
    else {
      throw ScienceContractError.invalid("runManifest", "the V2 manifest contract")
    }
  }

  /// Parses both supported ISO-8601 timestamp precisions for manifest ordering checks.
  private static func timestampDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }
}

/// Names the current forward result and binds it to its validated V2 run manifest.
public struct LatestScientificResult: Codable, Equatable, Sendable {
  public let kind: String
  public let arrowArtifactId: String
  public let runManifest: RunManifestV2

  /// Creates a result only when its artifact identifier exactly matches validated provenance.
  public init(arrowArtifactId: String, runManifest: RunManifestV2) throws {
    guard arrowArtifactId == runManifest.artifact.idSha256 else {
      throw ScienceContractError.invalid("result.arrowArtifactId", "the manifest artifact SHA-256")
    }
    try runManifest.validate()
    kind = "forward"
    self.arrowArtifactId = arrowArtifactId
    self.runManifest = runManifest
  }
}

/// Defines the narrowly scoped Arrow artifact operation used by scientific publication.
public protocol ArrowIPCArtifactWriting: Sendable {
  /// Writes ordered radial-velocity samples into an Arrow IPC byte sequence.
  func writeRadialVelocity(timesSeconds: [Double], velocitiesMps: [Double]) throws -> Data
}

/// Lets callers choose an explicit fail-closed writer when the concrete Arrow lane is not enabled.
public struct UnavailableArrowIPCWriter: ArrowIPCArtifactWriting {
  /// Creates the fail-closed writer placeholder for unsupported Arrow environments.
  public init() {}
  /// Explains why artifact generation cannot proceed until the concrete Arrow lane is available.
  public func writeRadialVelocity(timesSeconds: [Double], velocitiesMps: [Double]) throws -> Data {
    throw ScienceContractError.unsupportedExecution(
      "Arrow IPC writing is unavailable until apache/arrow-swift revision f57187964af9d073b68c2097bf088fa87f2b9509 is resolved and its writer API is compiled"
    )
  }
}

/// Defines the forward-propagation seam shared by available and fail-closed implementations.
public protocol ScientificForwardPropagating: Sendable {
  /// Produces a validated latest result from a strict V5 forward request.
  func run(_ request: ScientificForwardRequestV5) throws -> LatestScientificResult
}

/// Lets callers fail closed when they do not compose the experimental native DOP853 runner.
public struct UnavailableDOP853ForwardPropagator: ScientificForwardPropagating {
  /// Creates the fail-closed propagation placeholder for environments without DOP853 support.
  public init() {}
  /// Validates the request before reporting that native propagation is unavailable.
  public func run(_ request: ScientificForwardRequestV5) throws -> LatestScientificResult {
    try request.validate()
    throw ScienceContractError.unsupportedExecution(
      "Native DOP853 propagation is unavailable until the source-derived coefficient and dense-output implementation is linked"
    )
  }
}
