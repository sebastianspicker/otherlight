// Verifies strict Scientific V5 contracts, native propagation, and fail-closed execution limits.
import Foundation
import TransitScience
import TransitScienceContracts
import XCTest

/// Verifies strict V5 contracts, native DOP853 propagation, and fail-closed science lanes.
final class TransitScienceTests: XCTestCase {
  /// Confirms the shared request fixture validates and hashes to its published fingerprint.
  func testSharedForwardFixtureDecodesValidatesAndMatchesFingerprint() throws {
    let fixture = try sharedFixture()
    let request = try XCTUnwrap(fixture.validForwardRequest)
    try request.validate()
    XCTAssertEqual(
      try ScienceCanonicalJSON.requestFingerprint(request),
      fixture.validForwardRequestCanonicalSha256)
  }

  /// Confirms strict result decoding rejects unknown, mismatched, duplicate, and unsafe provenance.
  func testStrictResultCodecAcceptsSharedFixtureAndRejectsContractBypasses() throws {
    let validObject = try fixtureObject(named: "validForwardResult")
    let valid = try ScienceResultCodec.decodeStrict(
      from: JSONSerialization.data(withJSONObject: validObject))
    XCTAssertEqual(valid.kind, "forward")
    XCTAssertEqual(valid.arrowArtifactId, valid.runManifest.artifact.idSha256)

    var unknown = validObject
    var unknownManifest = try XCTUnwrap(unknown["runManifest"] as? [String: Any])
    unknownManifest["unsupported"] = true
    unknown["runManifest"] = unknownManifest
    XCTAssertThrowsError(
      try ScienceResultCodec.decodeStrict(from: JSONSerialization.data(withJSONObject: unknown)))

    var mismatched = validObject
    mismatched["arrowArtifactId"] = String(repeating: "c", count: 64)
    XCTAssertThrowsError(
      try ScienceResultCodec.decodeStrict(from: JSONSerialization.data(withJSONObject: mismatched)))

    var duplicateDomain = validObject
    var duplicateManifest = try XCTUnwrap(duplicateDomain["runManifest"] as? [String: Any])
    let domain = try XCTUnwrap(duplicateManifest["validityDomain"] as? [String])
    duplicateManifest["validityDomain"] = domain + domain
    duplicateDomain["runManifest"] = duplicateManifest
    XCTAssertThrowsError(
      try ScienceResultCodec.decodeStrict(
        from: JSONSerialization.data(withJSONObject: duplicateDomain)))

    var unsafeSeed = validObject
    var unsafeManifest = try XCTUnwrap(unsafeSeed["runManifest"] as? [String: Any])
    unsafeManifest["randomSeed"] = 9_007_199_254_740_992
    unsafeSeed["runManifest"] = unsafeManifest
    XCTAssertThrowsError(
      try ScienceResultCodec.decodeStrict(from: JSONSerialization.data(withJSONObject: unsafeSeed)))

    var reversedTime = validObject
    var reversedManifest = try XCTUnwrap(reversedTime["runManifest"] as? [String: Any])
    reversedManifest["startedAt"] = "2026-07-16T00:00:02.000Z"
    reversedManifest["completedAt"] = "2026-07-16T00:00:01.000Z"
    reversedTime["runManifest"] = reversedManifest
    XCTAssertThrowsError(
      try ScienceResultCodec.decodeStrict(
        from: JSONSerialization.data(withJSONObject: reversedTime)))
  }

  /// Confirms oversized systems and unavailable implementations fail without publishing output.
  func testThreeBodyLimitAndUnavailableLanesFailClosed() throws {
    var request = try XCTUnwrap(try sharedFixture().validForwardRequest)
    request = ScientificForwardRequestV5(
      kind: request.kind,
      scenario: ScienceScenarioV5(
        schemaVersion: request.scenario.schemaVersion, id: request.scenario.id,
        epochJdTdb: request.scenario.epochJdTdb, timeScale: request.scenario.timeScale,
        bodies: request.scenario.bodies + request.scenario.bodies + request.scenario.bodies,
        observer: request.scenario.observer, integrator: request.scenario.integrator),
      startOffsetSec: request.startOffsetSec, endOffsetSec: request.endOffsetSec,
      sampleCadenceSec: request.sampleCadenceSec, outputs: request.outputs, seed: request.seed)
    XCTAssertThrowsError(try request.validate()) { error in
      XCTAssertTrue(error.localizedDescription.contains("at most 3"))
    }

    let valid = try XCTUnwrap(try sharedFixture().validForwardRequest)
    XCTAssertThrowsError(try UnavailableDOP853ForwardPropagator().run(valid)) { error in
      XCTAssertTrue(error.localizedDescription.contains("unavailable"))
    }
    XCTAssertThrowsError(
      try UnavailableArrowIPCWriter().writeRadialVelocity(timesSeconds: [0], velocitiesMps: [0]))
  }

  /// Rejects sample grids that cannot remain strictly increasing as IEEE-754 doubles.
  func testRejectsUnrepresentableSampleCadenceAtLargeOffsets() throws {
    let base = try XCTUnwrap(try sharedFixture().validForwardRequest)
    let request = ScientificForwardRequestV5(
      kind: base.kind, scenario: base.scenario, startOffsetSec: 1e16, endOffsetSec: 1e16 + 4,
      sampleCadenceSec: 1, outputs: base.outputs, seed: base.seed)

    XCTAssertThrowsError(try request.validate()) { error in
      XCTAssertTrue(error.localizedDescription.contains("representable"))
    }
  }

  /// Verifies scalar exponential integration and dense interpolation accuracy.
  func testDOP853ScalarAndDenseOutputAgainstExponential() throws {
    let integrator = DOP853Integrator(
      configuration: try DOP853Configuration(
        absoluteTolerances: [1e-13], relativeTolerance: 1e-12, maximumStep: 0.02))
    var denseValue: Double?
    let result = try integrator.integrate(
      initialTime: 0, initialState: [1], finalTime: 1,
      rhs: { _, state in
        [state[0]]
      },
      onAcceptedStep: { dense in
        if dense.startTime <= 0.37, 0.37 <= dense.endTime {
          denseValue = try dense.state(at: 0.37)[0]
        }
      })

    XCTAssertEqual(result.finalState[0], exp(1), accuracy: 1e-12)
    XCTAssertEqual(try XCTUnwrap(denseValue), exp(0.37), accuracy: 5e-12)
    XCTAssertGreaterThan(result.acceptedSteps, 0)
  }

  /// Verifies a harmonic orbit closes numerically after one full period.
  func testDOP853HarmonicOrbitClosesAfterOnePeriod() throws {
    let integrator = DOP853Integrator(
      configuration: try DOP853Configuration(
        absoluteTolerances: [1e-13, 1e-13], relativeTolerance: 1e-12, maximumStep: 0.2))
    let result = try integrator.integrate(
      initialTime: 0, initialState: [1, 0], finalTime: 2 * .pi,
      rhs: { _, state in
        [state[1], -state[0]]
      })

    XCTAssertEqual(result.finalState[0], 1, accuracy: 2e-12)
    XCTAssertEqual(result.finalState[1], 0, accuracy: 2e-12)
  }

  /// Confirms native propagation samples the shared fixture at its requested dense cadence.
  func testSharedFixturePropagatesWithDenseCadenceSampling() throws {
    let request = try XCTUnwrap(try sharedFixture().validForwardRequest)
    let propagation = try NativeDOP853ForwardPropagator().propagate(request)

    XCTAssertEqual(propagation.sampleTimesSeconds.count, request.sampleCount)
    XCTAssertEqual(propagation.radialVelocitiesMps.count, request.sampleCount)
    XCTAssertEqual(
      try XCTUnwrap(propagation.sampleTimesSeconds.first), request.startOffsetSec, accuracy: 0)
    XCTAssertEqual(
      try XCTUnwrap(propagation.sampleTimesSeconds.last), request.endOffsetSec, accuracy: 0)
    XCTAssertTrue(propagation.radialVelocitiesMps.allSatisfy(\.isFinite))
    XCTAssertTrue(propagation.radialVelocitiesMps.allSatisfy { abs($0) < 1e-8 })
    XCTAssertGreaterThan(propagation.acceptedSteps, 0)
    XCTAssertGreaterThan(propagation.rhsEvaluations, propagation.acceptedSteps)
  }

  /// Confirms past and future legs share epoch conditions while retaining request sample order.
  func testPropagationSplitsPastAndFutureFromEpochAndPreservesRequestOrder() throws {
    let base = try XCTUnwrap(try sharedFixture().validForwardRequest)
    let observer = ScienceObserverV5(
      lineOfSight: try ScienceVector3(x: 0, y: 1, z: 0), targetBodyId: "star",
      distanceM: base.scenario.observer.distanceM)
    let scenario = ScienceScenarioV5(
      schemaVersion: base.scenario.schemaVersion, id: base.scenario.id,
      epochJdTdb: base.scenario.epochJdTdb, timeScale: base.scenario.timeScale,
      bodies: base.scenario.bodies, observer: observer, integrator: base.scenario.integrator)
    let backward = ScientificForwardRequestV5(
      kind: base.kind, scenario: scenario, startOffsetSec: -120, endOffsetSec: -30,
      sampleCadenceSec: 60, outputs: base.outputs, seed: base.seed)
    let crossing = ScientificForwardRequestV5(
      kind: base.kind, scenario: scenario, startOffsetSec: -120, endOffsetSec: 120,
      sampleCadenceSec: 60, outputs: base.outputs, seed: base.seed)
    let forward = ScientificForwardRequestV5(
      kind: base.kind, scenario: scenario, startOffsetSec: 60, endOffsetSec: 120,
      sampleCadenceSec: 60, outputs: base.outputs, seed: base.seed)

    let propagator = NativeDOP853ForwardPropagator()
    let backwardResult = try propagator.propagate(backward)
    let crossingResult = try propagator.propagate(crossing)
    let forwardResult = try propagator.propagate(forward)

    XCTAssertEqual(backwardResult.sampleTimesSeconds, [-120, -60])
    XCTAssertEqual(crossingResult.sampleTimesSeconds, [-120, -60, 0, 60, 120])
    XCTAssertEqual(forwardResult.sampleTimesSeconds, [60, 120])
    XCTAssertEqual(
      backwardResult.radialVelocitiesMps[0], crossingResult.radialVelocitiesMps[0], accuracy: 1e-12)
    XCTAssertEqual(
      backwardResult.radialVelocitiesMps[1], crossingResult.radialVelocitiesMps[1], accuracy: 1e-12)
    XCTAssertEqual(
      forwardResult.radialVelocitiesMps[0], crossingResult.radialVelocitiesMps[3], accuracy: 1e-12)
    XCTAssertEqual(
      forwardResult.radialVelocitiesMps[1], crossingResult.radialVelocitiesMps[4], accuracy: 1e-12)
    XCTAssertEqual(crossingResult.radialVelocitiesMps[2], 0.08945699906746266, accuracy: 1e-12)
    XCTAssertTrue(crossingResult.radialVelocitiesMps.allSatisfy(\.isFinite))
  }

  /// Confirms dense collision minimization catches a fast fly-through between legacy sample points.
  func testFastFiniteRadiusFlyThroughFailsClosedBetweenLegacyGridPoints() throws {
    let first = ScientificBodyV5(
      id: "left", kind: .star, massKg: 1, radiusM: 0.002,
      state: .init(
        positionM: try ScienceVector3(x: -0.515625, y: 0, z: 0),
        velocityMps: try ScienceVector3(x: 1, y: 0, z: 0)))
    let second = ScientificBodyV5(
      id: "right", kind: .planet, massKg: 1, radiusM: 0.002,
      state: .init(
        positionM: try ScienceVector3(x: 0.515625, y: 0, z: 0),
        velocityMps: try ScienceVector3(x: -1, y: 0, z: 0)))
    let scenario = ScienceScenarioV5(
      schemaVersion: "v5", id: "fast-fly-through", epochJdTdb: 2_461_236.5,
      timeScale: "TDB", bodies: [first, second],
      observer: .init(lineOfSight: try ScienceVector3(x: 1, y: 0, z: 0), targetBodyId: "left"),
      integrator: .init(
        positionToleranceM: 1e-9, velocityToleranceMps: 1e-9,
        relativeTolerance: 1e-12, maxStepSec: 1))
    let request = ScientificForwardRequestV5(
      kind: "forward", scenario: scenario, startOffsetSec: 0, endOffsetSec: 1,
      sampleCadenceSec: 1, outputs: ["radial-velocity"], seed: 0)

    XCTAssertThrowsError(try NativeDOP853ForwardPropagator().propagate(request)) { error in
      XCTAssertTrue(error.localizedDescription.contains("finite-radius collision"))
    }
  }

  /// Decodes the scientific fixture file used by contract and propagation tests.
  private func sharedFixture() throws -> SharedFixture {
    try JSONDecoder().decode(SharedFixture.self, from: Data(contentsOf: fixtureURL))
  }

  /// Extracts a raw named fixture object for strict-decoder mutation tests.
  private func fixtureObject(named key: String) throws -> [String: Any] {
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as? [String: Any])
    return try XCTUnwrap(root[key] as? [String: Any])
  }

  /// Locates the shared scientific contract fixture relative to this test source.
  private var fixtureURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../../contracts/science-v5/contract-cases.json")
      .standardizedFileURL
  }
}

/// Decodes the minimal shared fixture fields required by the science test suite.
private struct SharedFixture: Decodable {
  let validForwardRequest: ScientificForwardRequestV5?
  let validForwardRequestCanonicalSha256: String
}
