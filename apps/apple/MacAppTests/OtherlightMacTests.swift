// Verifies the session-only macOS V5 publication coordinator and explicit exports.
import Foundation
import TransitCore
import TransitEducation
import TransitScience
import TransitScienceAuthoring
import TransitScienceContracts
import XCTest

@testable import OtherlightMac

/// Exercises cancellation, stale-result suppression, and publication integrity in the Mac host.
@MainActor
final class OtherlightMacTests: XCTestCase {
  /// Confirms explicit cancellation clears state and prevents late publication.
  func testCancelledJobCannotPublish() async throws {
    let publication = try fixturePublication(for: ScenarioCatalog.default)
    let coordinator = ScientificRunExecuting { _, _, cancelled in
      Thread.sleep(forTimeInterval: 0.08)
      if cancelled() { throw CancellationError() }
      return publication
    }
    coordinator.start(scenario: ScenarioCatalog.default)
    coordinator.cancel()
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertEqual(coordinator.state, .cancelled)
    XCTAssertNil(coordinator.publication)
  }

  /// Confirms a slower superseded job cannot overwrite the replacement result.
  func testSupersededResultCannotReplaceNewerPublication() async throws {
    var firstScenario = ScenarioCatalog.default
    firstScenario.identifier = "first"
    var secondScenario = ScenarioCatalog.default
    secondScenario.identifier = "second"
    let first = try fixturePublication(for: firstScenario)
    let second = try fixturePublication(for: secondScenario)
    let coordinator = ScientificRunExecuting { scenario, _, cancelled in
      if scenario.identifier == "first" { Thread.sleep(forTimeInterval: 0.08) }
      if cancelled() { throw CancellationError() }
      return scenario.identifier == "first" ? first : second
    }
    coordinator.start(scenario: firstScenario)
    coordinator.start(scenario: secondScenario)
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertEqual(coordinator.state, .published)
    XCTAssertEqual(coordinator.publication?.request.scenario.id, "education-second")
  }

  /// Rejects mismatched Arrow bytes and verifies the exported manifest remains valid.
  func testPublicationRejectsMismatchedArrowAndExportsValidatedManifest() throws {
    let publication = try fixturePublication(for: ScenarioCatalog.default)
    XCTAssertThrowsError(
      try ScientificRunPublication(
        request: publication.request, result: publication.result, arrowIPCFile: Data("other".utf8)))
    let decoded = try JSONDecoder().decode(RunManifestV2.self, from: publication.manifestData())
    XCTAssertEqual(decoded.artifact.idSha256, publication.result.arrowArtifactId)
    try decoded.validate()
  }

  /// Constructs one internally consistent publication for coordinator policy tests.
  private func fixturePublication(for scenario: EducationScenarioV4) throws
    -> ScientificRunPublication
  {
    let request = try TransitScienceAuthoring.compile(scenario)
    let arrow = Data("session-only-arrow".utf8)
    let artifactID = ScienceCanonicalJSON.artifactFingerprint(arrow)
    let integrator = request.scenario.integrator
    let manifest = RunManifestV2(
      identity: .init(
        runId: "test-run", inputHashSha256: try ScienceCanonicalJSON.requestFingerprint(request)),
      execution: .init(
        implementation: .init(
          application: .init(name: "OtherlightMac", version: "0.3.0", build: "1"),
          engine: .init(kind: "swift-native", name: "DOP853", version: "test"),
          runtime: .init(name: "Swift", version: "6.3.3"),
          artifactWriter: .init(name: "test", version: "1"),
          platform: .init(os: "macOS", architecture: "arm64")),
        gravitationalConstantM3KgS2: ScienceLimits.gravitationalConstant,
        epochJdTdb: request.scenario.epochJdTdb,
        startedAt: "2026-09-04T12:00:00.000Z", completedAt: "2026-09-04T12:00:01.000Z",
        capabilityManifestVersion: "0.3.0"),
      provenance: .init(
        modelVersions: [.init(id: "dynamics", version: "test")],
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
        datasets: [], validityDomain: ["test"], warnings: [], randomSeed: request.seed,
        artifact: .init(
          idSha256: artifactID, format: "arrow-ipc-file", schemaVersion: "radial-velocity-v1",
          rowCount: request.sampleCount)))
    let result = try LatestScientificResult(arrowArtifactId: artifactID, runManifest: manifest)
    return try ScientificRunPublication(request: request, result: result, arrowIPCFile: arrow)
  }
}
