// Coordinates one cancellable native V5 job and retains only an in-memory validated publication.
import Foundation
import Observation
import TransitCore
import TransitEducation
import TransitScience
import TransitScienceAuthoring
import TransitScienceContracts

/// Keeps a request, result, Arrow bytes, and manifest agreement together after final validation.
struct ScientificRunPublication: Sendable {
  let request: ScientificForwardRequestV5
  let result: LatestScientificResult
  let arrowIPCFile: Data

  /// Revalidates every cross-artifact binding before a run can reach the application state.
  init(
    request: ScientificForwardRequestV5, result: LatestScientificResult, arrowIPCFile: Data
  ) throws {
    try request.validate()
    try result.runManifest.validate()
    let requestHash = try ScienceCanonicalJSON.requestFingerprint(request)
    let artifactHash = ScienceCanonicalJSON.artifactFingerprint(arrowIPCFile)
    guard result.arrowArtifactId == result.runManifest.artifact.idSha256,
      result.runManifest.inputHashSha256 == requestHash,
      result.arrowArtifactId == artifactHash,
      result.runManifest.artifact.rowCount == request.sampleCount
    else {
      throw ScienceContractError.unsupportedExecution(
        "request, trajectory sample count, Arrow bytes, result, and manifest did not agree")
    }
    self.request = request
    self.result = result
    self.arrowIPCFile = arrowIPCFile
  }

  /// Admits native output only through the same final agreement checks used for every publication.
  init(request: ScientificForwardRequestV5, output: NativeScientificRunOutput) throws {
    try self.init(request: request, result: output.result, arrowIPCFile: output.arrowIPCFile)
  }

  /// Serializes the already validated manifest only when the user explicitly chooses that export.
  func manifestData() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(result.runManifest)
  }
}

/// Runs exactly one non-main-actor native job and ignores cancelled or superseded completions.
@MainActor @Observable
final class ScientificRunExecuting {
  /// Describes the complete observable lifecycle of the single session job.
  enum State: Equatable {
    case idle
    case running
    case published
    case failed(String)
    case cancelled
  }

  typealias Job =
    @Sendable (
      EducationScenarioV4, ScienceAuthoringConfiguration, @escaping @Sendable () -> Bool
    ) throws -> ScientificRunPublication

  private(set) var state: State = .idle
  private(set) var publication: ScientificRunPublication?
  private var generation = 0
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private let job: Job

  /// Installs the concrete native job by default while leaving the coordination policy testable.
  init(job: Job? = nil) {
    self.job = job ?? Self.nativeJob
  }

  /// Starts a replacement run, invalidating every prior asynchronous completion before it can publish.
  func start(
    scenario: EducationScenarioV4,
    configuration: ScienceAuthoringConfiguration = .sessionDefault
  ) {
    cancel(replacingWithNewRun: true)
    let runGeneration = generation
    state = .running
    publication = nil
    let job = self.job
    task = Task.detached(priority: .userInitiated) { [weak self, job] in
      do {
        let output = try job(scenario, configuration, { Task.isCancelled })
        guard !Task.isCancelled else { return }
        await self?.publish(output, generation: runGeneration)
      } catch is CancellationError {
        await self?.finishCancellation(generation: runGeneration)
      } catch {
        guard !Task.isCancelled else { return }
        await self?.fail(error.localizedDescription, generation: runGeneration)
      }
    }
  }

  /// Cancels the active job and clears only its session-only result; no artifact is written implicitly.
  func cancel() {
    cancel(replacingWithNewRun: false)
  }

  /// Clears all runtime-only state when the host view leaves the process.
  deinit { task?.cancel() }

  /// Supplies provenance from the local process and runs the concrete Arrow-linked native lane.
  nonisolated private static func nativeJob(
    scenario: EducationScenarioV4, configuration: ScienceAuthoringConfiguration,
    cancellation: @escaping @Sendable () -> Bool
  ) throws -> ScientificRunPublication {
    let request = try TransitScienceAuthoring.compile(scenario, configuration: configuration)
    try Task.checkCancellation()
    let runner = NativeScientificForwardRunner(metadata: nativeMetadata)
    let output = try runner.run(request, cancellation: cancellation)
    try Task.checkCancellation()
    return try ScientificRunPublication(request: request, output: output)
  }

  /// Records the host implementation rather than claiming a service, cache, or fallback executor.
  nonisolated private static var nativeMetadata: NativeScienceRunMetadata {
    NativeScienceRunMetadata(
      application: .init(name: "OtherlightMac", version: "0.3.0", build: "1"),
      runtime: .init(name: "Swift", version: "6.3.3"),
      platform: .init(
        os: ProcessInfo.processInfo.operatingSystemVersionString, architecture: architecture),
      capabilityManifestVersion: "0.3.0")
  }

  /// Identifies the compile target architecture in the manifest without consulting the network.
  nonisolated private static var architecture: String {
    #if arch(arm64)
      "arm64"
    #elseif arch(x86_64)
      "x86_64"
    #else
      "unknown"
    #endif
  }

  /// Increments the generation before cancellation so a late worker never owns current UI state.
  private func cancel(replacingWithNewRun: Bool) {
    generation += 1
    task?.cancel()
    task = nil
    if !replacingWithNewRun {
      publication = nil
      state = .cancelled
    }
  }

  /// Publishes only the still-current fully validated run that was not cancelled.
  private func publish(_ output: ScientificRunPublication, generation: Int) {
    guard generation == self.generation, !Task.isCancelled else { return }
    publication = output
    task = nil
    state = .published
  }

  /// Ignores cancellation notifications from an obsolete job and preserves the newer status.
  private func finishCancellation(generation: Int) {
    guard generation == self.generation else { return }
    publication = nil
    task = nil
    state = .cancelled
  }

  /// Surfaces only a current non-cancelled failure and never reuses an Education result as a fallback.
  private func fail(_ message: String, generation: Int) {
    guard generation == self.generation else { return }
    publication = nil
    task = nil
    state = .failed(message)
  }
}
