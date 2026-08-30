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

  /// Rejects unknown, null-optional, and oversized request contract bypasses.
  func testStrictDecodeAndValidationRejectContractBypasses() throws {
    let fixture = try sharedFixture()
    let request = try XCTUnwrap(fixture.validForwardRequest)
    let raw = try XCTUnwrap(
      JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
    var unknown = raw
    unknown["unsupported"] = true
    XCTAssertThrowsError(
      try ScienceRequestCodec.decodeStrict(from: JSONSerialization.data(withJSONObject: unknown)))

    var nullDistance = raw
    var nullDistanceScenario = try XCTUnwrap(
      nullDistance["scenario"] as? [String: Any])
    var nullDistanceObserver = try XCTUnwrap(
      nullDistanceScenario["observer"] as? [String: Any])
    nullDistanceObserver["distanceM"] = NSNull()
    nullDistanceScenario["observer"] = nullDistanceObserver
    nullDistance["scenario"] = nullDistanceScenario
    let nullDistanceData = try JSONSerialization.data(withJSONObject: nullDistance)
    XCTAssertThrowsError(
      try ScienceRequestCodec.decodeStrict(from: nullDistanceData))

    nullDistanceObserver.removeValue(forKey: "distanceM")
    nullDistanceScenario["observer"] = nullDistanceObserver
    nullDistance["scenario"] = nullDistanceScenario
    let missingDistanceData = try JSONSerialization.data(withJSONObject: nullDistance)
    XCTAssertNoThrow(
      try ScienceRequestCodec.decodeStrict(from: missingDistanceData))

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

  /// Matches V5 identifier limits for scenario, body, and observer identity fields.
  func testValidationEnforcesUnicodeScalarIdentifierBoundsForEveryIdentityField() throws {
    let request = try XCTUnwrap(try sharedFixture().validForwardRequest)
    let identifiers: [(name: String, value: String, scalarCount: Int, isValid: Bool)] = [
      ("whitespace", " \t\n", 3, false),
      ("128 ASCII scalars", String(repeating: "a", count: 128), 128, true),
      ("129 ASCII scalars", String(repeating: "a", count: 129), 129, false),
      ("128 combining scalars", String(repeating: "e\u{301}", count: 64), 128, true),
      ("130 combining scalars", String(repeating: "e\u{301}", count: 65), 130, false),
      ("128 emoji scalars", String(repeating: "😀", count: 128), 128, true),
      ("129 emoji scalars", String(repeating: "😀", count: 129), 129, false),
    ]

    for identifier in identifiers {
      XCTAssertEqual(identifier.value.unicodeScalars.count, identifier.scalarCount)
      assertIdentifierValidity(
        replacingScenarioID: identifier.value,
        in: request,
        isValid: identifier.isValid,
        label: "scenario \(identifier.name)")
      assertIdentifierValidity(
        replacingFirstBodyID: identifier.value,
        observerTargetBodyID: identifier.value,
        in: request,
        isValid: identifier.isValid,
        label: "body \(identifier.name)")
      assertIdentifierValidity(
        replacingFirstBodyID: identifier.isValid ? identifier.value : nil,
        observerTargetBodyID: identifier.value,
        in: request,
        isValid: identifier.isValid,
        label: "observer \(identifier.name)")
    }
  }

  /// Loads the shared fixture used to check stable request wire compatibility.
  private func sharedFixture() throws -> ScientificContractFixture {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../../../contracts/science-v5/contract-cases.json")
      .standardizedFileURL
    return try JSONDecoder().decode(ScientificContractFixture.self, from: Data(contentsOf: url))
  }

  /// Applies identifier substitutions while retaining the fixture's physical invariants.
  private func replacingIdentifiers(
    _ request: ScientificForwardRequestV5,
    scenarioID: String? = nil,
    firstBodyID: String? = nil,
    observerTargetBodyID: String? = nil
  ) -> ScientificForwardRequestV5 {
    var bodies = request.scenario.bodies
    if let firstBodyID {
      let firstBody = bodies[0]
      bodies[0] = ScientificBodyV5(
        id: firstBodyID,
        kind: firstBody.kind,
        massKg: firstBody.massKg,
        radiusM: firstBody.radiusM,
        state: firstBody.state)
    }
    let observer = ScienceObserverV5(
      lineOfSight: request.scenario.observer.lineOfSight,
      targetBodyId: observerTargetBodyID ?? request.scenario.observer.targetBodyId,
      distanceM: request.scenario.observer.distanceM)
    let scenario = ScienceScenarioV5(
      schemaVersion: request.scenario.schemaVersion,
      id: scenarioID ?? request.scenario.id,
      epochJdTdb: request.scenario.epochJdTdb,
      timeScale: request.scenario.timeScale,
      bodies: bodies,
      observer: observer,
      integrator: request.scenario.integrator)
    return ScientificForwardRequestV5(
      kind: request.kind,
      scenario: scenario,
      startOffsetSec: request.startOffsetSec,
      endOffsetSec: request.endOffsetSec,
      sampleCadenceSec: request.sampleCadenceSec,
      outputs: request.outputs,
      seed: request.seed)
  }

  /// Verifies the same identifier boundary at one specific public V5 identity field.
  private func assertIdentifierValidity(
    replacingScenarioID scenarioID: String? = nil,
    replacingFirstBodyID firstBodyID: String? = nil,
    observerTargetBodyID: String? = nil,
    in request: ScientificForwardRequestV5,
    isValid: Bool,
    label: String
  ) {
    let modified = replacingIdentifiers(
      request,
      scenarioID: scenarioID,
      firstBodyID: firstBodyID,
      observerTargetBodyID: observerTargetBodyID)
    if isValid {
      XCTAssertNoThrow(try modified.validate(), label)
    } else {
      XCTAssertThrowsError(try modified.validate(), label)
    }
  }
}

/// Decodes only the shared fixture fields needed by portable contract assertions.
private struct ScientificContractFixture: Decodable {
  let validForwardRequest: ScientificForwardRequestV5?
  let validForwardRequestCanonicalSha256: String
}
