// Verifies strict Scientific V5 contracts, native propagation, and fail-closed execution limits.
import Foundation
import TransitScienceContracts
import XCTest
@testable import TransitScience

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
    XCTAssertEqual(
      crossingResult.acceptedSteps, backwardResult.acceptedSteps + forwardResult.acceptedSteps)
    XCTAssertEqual(
      crossingResult.rhsEvaluations, backwardResult.rhsEvaluations + forwardResult.rhsEvaluations)
  }

  /// Confirms certified dense collision auditing catches a forward fly-through between samples.
  func testFastFiniteRadiusFlyThroughFailsClosedBetweenLegacyGridPoints() throws {
    XCTAssertThrowsError(
      try NativeDOP853ForwardPropagator().propagate(try fastFlyThroughRequest(forward: true))
    ) { error in
      XCTAssertTrue(error.localizedDescription.contains("finite-radius collision"))
    }
  }

  /// Confirms backward dense-output traversal audits x from the accepted start toward its end.
  func testBackwardFastFiniteRadiusFlyThroughFailsClosedBetweenLegacyGridPoints() throws {
    XCTAssertThrowsError(
      try NativeDOP853ForwardPropagator().propagate(try fastFlyThroughRequest(forward: false))
    ) { error in
      XCTAssertTrue(error.localizedDescription.contains("finite-radius collision"))
    }
  }

  /// Exercises safe, contact, multimodal, backward-order, and tangency collision certificates.
  func testCertifiedCollisionAuditVectorParity() throws {
    XCTAssertEqual(
      try CertifiedCollisionAudit.certify(
        relativePower: relativePower([1]), contactDistance: 0.1),
      .safe)
    XCTAssertEqual(
      try CertifiedCollisionAudit.certify(
        relativePower: relativePower([0]), contactDistance: 0.003),
      .contact)

    let adversarial = [-0.0059, 9.664, -360.96, 4096.0]
    XCTAssertEqual(
      try CertifiedCollisionAudit.certify(
        relativePower: relativePower([3744.6981, -11575.744, 11927.04, -4096]),
        contactDistance: 0.003),
      .indeterminate)
    XCTAssertEqual(
      try CertifiedCollisionAudit.certify(
        relativePower: relativePower(adversarial), contactDistance: 0.003),
      .contact)

    XCTAssertEqual(
      try CertifiedCollisionAudit.certify(
        relativePower: relativePower([0.35, -1, 1]), contactDistance: 0.1),
      .indeterminate)
  }

  /// Matches full nonzero states and RV signs against a pinned SciPy 1.18 DOP853 oracle fixture.
  func testNativeDOP853MatchesPinnedSciPyParityFixtureAcrossTemporalDirections() throws {
    let fixture = try scipyParityFixture()
    XCTAssertEqual(fixture.provenance.scipyVersion, "1.18.0")
    XCTAssertEqual(
      fixture.provenance.gravitationalConstantM3KgS2,
      ScienceLimits.gravitationalConstant)
    for parityCase in fixture.cases {
      let request = ScientificForwardRequestV5(
        kind: "forward",
        scenario: fixture.scenario,
        startOffsetSec: parityCase.startOffsetSec,
        endOffsetSec: parityCase.endOffsetSec,
        sampleCadenceSec: parityCase.sampleCadenceSec,
        outputs: ["radial-velocity"],
        seed: 0)
      let propagation = try NativeDOP853ForwardPropagator().propagate(request)
      XCTAssertEqual(propagation.sampleTimesSeconds, parityCase.samples.map(\.timeOffsetSec))
      XCTAssertEqual(propagation.sampledStates.count, parityCase.samples.count)
      for (index, expected) in parityCase.samples.enumerated() {
        let actualState = propagation.sampledStates[index]
        XCTAssertEqual(actualState.count, expected.state.count, parityCase.name)
        for component in actualState.indices {
          let tolerance =
            component % 6 < 3
            ? fixture.provenance.stateAbsoluteToleranceM
            : fixture.provenance.velocityAbsoluteToleranceMps
          XCTAssertEqual(actualState[component], expected.state[component], accuracy: tolerance)
        }
        let actualRV = propagation.radialVelocitiesMps[index]
        XCTAssertEqual(
          actualRV,
          expected.radialVelocityMps,
          accuracy: fixture.provenance.velocityAbsoluteToleranceMps)
        XCTAssertEqual(actualRV.sign, expected.radialVelocityMps.sign, parityCase.name)
      }
      try assertTwoBodyInvariants(
        states: propagation.sampledStates,
        masses: fixture.scenario.bodies.map(\.massKg))
    }
  }

  /// Confirms tighter native tolerances reduce the independent SciPy-reference error at one sample.
  func testNativeDOP853ParityFixtureConvergesTowardPinnedSciPyReference() throws {
    let fixture = try scipyParityFixture()
    let parityCase = try XCTUnwrap(fixture.cases.first(where: { $0.name == "forward" }))
    let expected = try XCTUnwrap(parityCase.samples.first)
    let coarseScenario = ScienceScenarioV5(
      schemaVersion: fixture.scenario.schemaVersion,
      id: fixture.scenario.id,
      epochJdTdb: fixture.scenario.epochJdTdb,
      timeScale: fixture.scenario.timeScale,
      bodies: fixture.scenario.bodies,
      observer: fixture.scenario.observer,
      integrator: DOP853Settings(
        positionToleranceM: fixture.scenario.integrator.positionToleranceM * 100,
        velocityToleranceMps: fixture.scenario.integrator.velocityToleranceMps * 100,
        relativeTolerance: fixture.scenario.integrator.relativeTolerance * 100,
        maxStepSec: fixture.scenario.integrator.maxStepSec))
    let coarse = try NativeDOP853ForwardPropagator().propagate(
      parityRequest(for: parityCase, scenario: coarseScenario))
    let tighter = try NativeDOP853ForwardPropagator().propagate(
      parityRequest(for: parityCase, scenario: fixture.scenario))
    let coarseState = try XCTUnwrap(coarse.sampledStates.first)
    let tighterState = try XCTUnwrap(tighter.sampledStates.first)
    let coarseError = stateErrors(actual: coarseState, expected: expected.state)
    let tighterError = stateErrors(actual: tighterState, expected: expected.state)
    XCTAssertLessThan(tighterError.positionM, coarseError.positionM)
    XCTAssertLessThan(tighterError.velocityMps, coarseError.velocityMps)
  }

  /// Decodes the scientific fixture file used by contract and propagation tests.
  private func sharedFixture() throws -> SharedFixture {
    try JSONDecoder().decode(SharedFixture.self, from: Data(contentsOf: fixtureURL))
  }

  /// Loads reference states generated by the pinned SciPy 1.18 DOP853 dense-output oracle.
  private func scipyParityFixture() throws -> SciPyParityFixture {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../../../../../contracts/science-v5/scipy-dop853-native-parity.json")
      .standardizedFileURL
    return try JSONDecoder().decode(SciPyParityFixture.self, from: Data(contentsOf: url))
  }

  /// Builds one strict V5 request for a fixture window without changing its physical scenario.
  private func parityRequest(
    for parityCase: SciPyParityFixture.ParityCase,
    scenario: ScienceScenarioV5
  ) -> ScientificForwardRequestV5 {
    ScientificForwardRequestV5(
      kind: "forward",
      scenario: scenario,
      startOffsetSec: parityCase.startOffsetSec,
      endOffsetSec: parityCase.endOffsetSec,
      sampleCadenceSec: parityCase.sampleCadenceSec,
      outputs: ["radial-velocity"],
      seed: 0)
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
      .appendingPathComponent("../../../../../../contracts/science-v5/contract-cases.json")
      .standardizedFileURL
  }

  /// Creates a two-body contact trajectory that only crosses the radius boundary inside a step.
  private func fastFlyThroughRequest(forward: Bool) throws -> ScientificForwardRequestV5 {
    let velocity = forward ? 1.0 : -1.0
    let first = ScientificBodyV5(
      id: "left", kind: .star, massKg: 1, radiusM: 0.002,
      state: .init(
        positionM: try ScienceVector3(x: -0.515625, y: 0, z: 0),
        velocityMps: try ScienceVector3(x: velocity, y: 0, z: 0)))
    let second = ScientificBodyV5(
      id: "right", kind: .planet, massKg: 1, radiusM: 0.002,
      state: .init(
        positionM: try ScienceVector3(x: 0.515625, y: 0, z: 0),
        velocityMps: try ScienceVector3(x: -velocity, y: 0, z: 0)))
    let scenario = ScienceScenarioV5(
      schemaVersion: "v5", id: "fast-fly-through", epochJdTdb: 2_461_236.5,
      timeScale: "TDB", bodies: [first, second],
      observer: .init(lineOfSight: try ScienceVector3(x: 1, y: 0, z: 0), targetBodyId: "left"),
      integrator: .init(
        positionToleranceM: 1e-9, velocityToleranceMps: 1e-9,
        relativeTolerance: 1e-12, maxStepSec: 1))
    return ScientificForwardRequestV5(
      kind: "forward", scenario: scenario,
      startOffsetSec: forward ? 0 : -1, endOffsetSec: forward ? 1 : 0,
      sampleCadenceSec: 1, outputs: ["radial-velocity"], seed: 0)
  }

  /// Pads an x-axis polynomial into the audit's three relative position axes.
  private func relativePower(_ x: [Double]) -> [[Double]] {
    let padded = x + [Double](repeating: 0, count: 8 - x.count)
    return [padded, [Double](repeating: 0, count: 8), [Double](repeating: 0, count: 8)]
  }

  /// Checks conserved two-body energy and angular momentum across one bounded parity window.
  private func assertTwoBodyInvariants(states: [[Double]], masses: [Double]) throws {
    let initial = try XCTUnwrap(states.first)
    let expected = try twoBodyInvariants(state: initial, masses: masses)
    for state in states {
      let actual = try twoBodyInvariants(state: state, masses: masses)
      XCTAssertLessThan(abs(actual.energy / expected.energy - 1), 2e-10)
      XCTAssertLessThan(abs(actual.angularMomentumZ / expected.angularMomentumZ - 1), 2e-10)
    }
  }

  /// Calculates the relative two-body energy and planar angular momentum from a flat state.
  private func twoBodyInvariants(
    state: [Double], masses: [Double]
  ) throws -> (energy: Double, angularMomentumZ: Double) {
    guard state.count == 12, masses.count == 2 else {
      throw NSError(domain: "TransitScienceTests", code: 1)
    }
    let dx = state[6] - state[0]
    let dy = state[7] - state[1]
    let dz = state[8] - state[2]
    let dvx = state[9] - state[3]
    let dvy = state[10] - state[4]
    let dvz = state[11] - state[5]
    let separation = sqrt(dx * dx + dy * dy + dz * dz)
    let reducedMass = masses[0] * masses[1] / (masses[0] + masses[1])
    let kineticEnergy = 0.5 * reducedMass * (dvx * dvx + dvy * dvy + dvz * dvz)
    let potentialEnergy =
      -ScienceLimits.gravitationalConstant * masses[0] * masses[1] / separation
    let energy = kineticEnergy + potentialEnergy
    return (energy, reducedMass * (dx * dvy - dy * dvx))
  }

  /// Separates absolute position and velocity differences in the interleaved two-body state.
  private func stateErrors(
    actual: [Double], expected: [Double]
  ) -> (positionM: Double, velocityMps: Double) {
    var positionM = 0.0
    var velocityMps = 0.0
    for index in actual.indices {
      if index % 6 < 3 {
        positionM = max(positionM, abs(actual[index] - expected[index]))
      } else {
        velocityMps = max(velocityMps, abs(actual[index] - expected[index]))
      }
    }
    return (positionM, velocityMps)
  }

}

/// Decodes the minimal shared fixture fields required by the science test suite.
private struct SharedFixture: Decodable {
  let validForwardRequest: ScientificForwardRequestV5?
  let validForwardRequestCanonicalSha256: String
}

/// Decodes a reproducible SciPy DOP853 dense-output parity case and its reference states.
private struct SciPyParityFixture: Decodable {
  let provenance: Provenance
  let scenario: ScienceScenarioV5
  let cases: [ParityCase]

  /// Records the independent oracle runtime and comparison tolerances.
  struct Provenance: Decodable {
    let scipyVersion: String
    let gravitationalConstantM3KgS2: Double
    let stateAbsoluteToleranceM: Double
    let velocityAbsoluteToleranceMps: Double
  }

  /// Describes one temporal sampling window and its expected results.
  struct ParityCase: Decodable {
    let name: String
    let startOffsetSec: Double
    let endOffsetSec: Double
    let sampleCadenceSec: Double
    let samples: [Sample]
  }

  /// Stores one oracle state and its positive-receding radial velocity.
  struct Sample: Decodable {
    let timeOffsetSec: Double
    let state: [Double]
    let radialVelocityMps: Double
  }
}
