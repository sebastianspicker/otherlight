// Verifies Arrow IPC bytes, schema, samples, and native provenance binding.
import Arrow
import TransitScience
import TransitScienceContracts
import XCTest

/// Verifies the native Arrow writer, shared schema contract, and provenance binding.
final class ArrowSwiftIPCWriterTests: XCTestCase {
  /// Ensures an Arrow IPC file has the required markers, schema, and sample values.
  func testWritesReadableRadialVelocityArrowFile() throws {
    let contract = try sharedFixture().radialVelocityArrowV1
    let data = try ArrowSwiftIPCWriter().writeRadialVelocity(
      timesSeconds: [0, 60, 120], velocitiesMps: [1.25, 0, -1.25])

    let marker = Data(contract.magic.utf8)
    XCTAssertTrue(data.starts(with: marker))
    XCTAssertEqual(data.suffix(marker.count), marker)
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(
      "transit-science-arrow-test-\(UUID().uuidString).arrow")
    try data.write(to: file, options: .atomic)
    defer { try? FileManager.default.removeItem(at: file) }
    let batches = try ArrowReader().fromFile(file).get().batches
    let batch = try XCTUnwrap(batches.first)
    XCTAssertEqual(batches.count, 1)
    XCTAssertEqual(batch.length, 3)
    XCTAssertEqual(batch.schema.fields.map(\.name), contract.fields.map(\.name))
    XCTAssertEqual(contract.fields.map(\.type), ["float64", "float64"])
    XCTAssertTrue(batch.schema.fields.allSatisfy { $0.type.info == ArrowType.ArrowDouble })
    XCTAssertEqual(batch.columns[0].array.asAny(0) as? Double, 0)
    XCTAssertEqual(batch.columns[0].array.asAny(2) as? Double, 120)
    XCTAssertEqual(batch.columns[1].array.asAny(0) as? Double, 1.25)
    XCTAssertEqual(batch.columns[1].array.asAny(2) as? Double, -1.25)
  }

  /// Ensures malformed radial-velocity input is rejected before an artifact is written.
  func testRejectsInvalidRadialVelocitySamplesBeforeWriting() {
    let writer = ArrowSwiftIPCWriter()
    XCTAssertThrowsError(try writer.writeRadialVelocity(timesSeconds: [], velocitiesMps: []))
    XCTAssertThrowsError(try writer.writeRadialVelocity(timesSeconds: [0], velocitiesMps: []))
    XCTAssertThrowsError(try writer.writeRadialVelocity(timesSeconds: [.nan], velocitiesMps: [0]))
    XCTAssertThrowsError(
      try writer.writeRadialVelocity(timesSeconds: [0], velocitiesMps: [.infinity]))
    XCTAssertThrowsError(
      try writer.writeRadialVelocity(timesSeconds: [0, 0], velocitiesMps: [0, 1]))
    XCTAssertThrowsError(
      try writer.writeRadialVelocity(timesSeconds: [1, 0], velocitiesMps: [0, 1]))
  }

  /// Ensures the native runner owns complete provenance and binds it to exact Arrow bytes.
  func testNativeRunnerOwnsProvenanceAndBindsManifestToArrowBytes() throws {
    let request = try sharedForwardRequest()
    let timestamp = Date(timeIntervalSince1970: 1_782_777_600)
    let runner = NativeScientificForwardRunner(
      metadata: NativeScienceRunMetadata(
        application: .init(name: "Otherlight", version: "test", build: "test"),
        runtime: .init(name: "Swift", version: "test"),
        platform: .init(os: "test", architecture: "test"),
        capabilityManifestVersion: "test"),
      now: { timestamp }, runID: { "native-test-run" })

    let output = try runner.run(request)
    let manifest = output.result.runManifest
    XCTAssertEqual(manifest.implementation.engine.kind, "swift-native")
    XCTAssertEqual(manifest.implementation.engine.name, "DOP853")
    XCTAssertEqual(
      manifest.implementation.artifactWriter.version,
      "f57187964af9d073b68c2097bf088fa87f2b9509")
    XCTAssertEqual(
      manifest.modelVersions,
      [
        .init(id: "dynamics", version: "newtonian-point-mass-finite-radius-boundary-v2"),
        .init(id: "radial_velocity", version: "barycentric-positive-receding-v1"),
      ])
    XCTAssertTrue(manifest.datasets.isEmpty)
    XCTAssertEqual(manifest.artifact.rowCount, request.sampleCount)
    XCTAssertEqual(
      manifest.artifact.idSha256,
      ScienceCanonicalJSON.artifactFingerprint(output.arrowIPCFile))
    XCTAssertEqual(output.result.arrowArtifactId, manifest.artifact.idSha256)
    XCTAssertGreaterThan(output.acceptedSteps, 0)
    XCTAssertGreaterThan(output.rhsEvaluations, output.acceptedSteps)
  }

  /// Loads the fixture's strict forward request for Arrow integration tests.
  private func sharedForwardRequest() throws -> ScientificForwardRequestV5 {
    try XCTUnwrap(sharedFixture().validForwardRequest)
  }

  /// Loads the shared Arrow schema and request fixture from the contract corpus.
  private func sharedFixture() throws -> ArrowSharedFixture {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../../contracts/science-v5/contract-cases.json")
      .standardizedFileURL
    return try JSONDecoder().decode(ArrowSharedFixture.self, from: Data(contentsOf: root))
  }
}

/// Decodes the Arrow-relevant portion of the shared scientific contract fixture.
private struct ArrowSharedFixture: Decodable {
  let validForwardRequest: ScientificForwardRequestV5?
  let radialVelocityArrowV1: ArrowSchemaContract
}

/// Decodes the expected Arrow IPC magic marker and field schema.
private struct ArrowSchemaContract: Decodable {
  let magic: String
  let fields: [ArrowFieldContract]
}

/// Decodes one expected Arrow IPC field declaration.
private struct ArrowFieldContract: Decodable {
  let name: String
  let type: String
}
