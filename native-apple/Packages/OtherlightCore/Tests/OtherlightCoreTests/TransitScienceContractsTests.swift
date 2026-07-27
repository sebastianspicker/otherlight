// Verifies portable Scientific V5 request decoding, validation, and identity.
import Foundation
import TransitScienceContracts
import XCTest

/// Verifies that portable Scientific V5 request contracts retain their wire invariants.
final class TransitScienceContractsTests: XCTestCase {
  /// Confirms strict decoding validates the shared request and preserves its canonical fingerprint.
  func testStrictDecodeValidatesSharedRequestAndMatchesFingerprint() throws {
    let fixture = try sharedFixture()
    let request = try XCTUnwrap(fixture.validForwardRequest)
    let data = try JSONEncoder().encode(request)
    let decoded = try ScienceRequestCodec.decodeStrict(from: data)

    XCTAssertEqual(decoded, request)
    XCTAssertEqual(
      try ScienceCanonicalJSON.requestFingerprint(decoded),
      fixture.validForwardRequestCanonicalSha256)
  }

  /// Rejects unknown request fields and scenarios exceeding the portable body limit.
  func testStrictDecodeAndValidationRejectContractBypasses() throws {
    let fixture = try sharedFixture()
    let request = try XCTUnwrap(fixture.validForwardRequest)
    var raw = try XCTUnwrap(
      JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
    raw["unsupported"] = true
    XCTAssertThrowsError(
      try ScienceRequestCodec.decodeStrict(from: JSONSerialization.data(withJSONObject: raw)))

    let oversized = ScientificForwardRequestV5(
      kind: request.kind,
      scenario: ScienceScenarioV5(
        schemaVersion: request.scenario.schemaVersion,
        id: request.scenario.id,
        epochJdTdb: request.scenario.epochJdTdb,
        timeScale: request.scenario.timeScale,
        bodies: request.scenario.bodies + request.scenario.bodies,
        observer: request.scenario.observer,
        integrator: request.scenario.integrator),
      startOffsetSec: request.startOffsetSec,
      endOffsetSec: request.endOffsetSec,
      sampleCadenceSec: request.sampleCadenceSec,
      outputs: request.outputs,
      seed: request.seed)
    XCTAssertThrowsError(try oversized.validate()) { error in
      XCTAssertTrue(error.localizedDescription.contains("at most 3"))
    }
  }

  /// Loads the shared fixture used to check stable request wire compatibility.
  private func sharedFixture() throws -> ScientificContractFixture {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../../contracts/science-v5/contract-cases.json")
      .standardizedFileURL
    return try JSONDecoder().decode(ScientificContractFixture.self, from: Data(contentsOf: url))
  }
}

/// Decodes only the shared fixture fields needed by portable contract assertions.
private struct ScientificContractFixture: Decodable {
  let validForwardRequest: ScientificForwardRequestV5?
  let validForwardRequestCanonicalSha256: String
}
