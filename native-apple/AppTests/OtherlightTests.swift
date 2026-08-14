// Exercises app-level runtime, session lifecycle, and presentation contracts.
import CoreGraphics
import Foundation
import TransitEducation
import TransitScienceContracts
import UniformTypeIdentifiers
import XCTest

@testable import Otherlight

/// Verifies native runtime delivery, session lifecycle, persistence, and presentation policies.
@MainActor
final class OtherlightTests: XCTestCase {
  /// Ensures a normal request yields package-backed plot, scene, and timing snapshots.
  func testRuntimeProducesPackageSnapshots() async throws {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let key = SeriesKey(revision: 1, scenario: scenario, samples: 32, centerSeconds: transit)
    let frame = try await deliveredFrame(
      from: runtime, request: .init(generation: 7, seriesKey: key, timeSeconds: transit))

    XCTAssertEqual(frame.generation, 7)
    XCTAssertEqual(frame.series.key, key)
    XCTAssertEqual(frame.plot.points.count, 32)
    XCTAssertFalse(frame.scene.skyPoints.isEmpty)
    XCTAssertLessThan(frame.currentStep.fluxComponents.transitFactor, 1)
    XCTAssertEqual(Set(frame.oc.timings.map(\.transitNumber)).count, 9)
    XCTAssertEqual(frame.scene.timeSeconds, frame.currentStep.timeSeconds)
  }

  /// Ensures cache reuse requires an exact series key and revisions rebuild sampled data.
  func testRuntimeReusesSeriesOnlyForExactKey() async throws {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let firstKey = SeriesKey(
      revision: 1, scenario: scenario, samples: 16, centerSeconds: transit)

    let first = try await deliveredFrame(
      from: runtime, request: .init(generation: 1, seriesKey: firstKey, timeSeconds: transit))
    let reused = try await deliveredFrame(
      from: runtime,
      request: .init(
        generation: 2, seriesKey: firstKey,
        timeSeconds: transit + scenario.planet.orbit.periodSeconds * 0.01))
    XCTAssertEqual(first.series, reused.series)
    let reuseMetrics = await runtime.metrics()
    XCTAssertEqual(reuseMetrics.seriesBuilds, 1)

    let revisedKey = SeriesKey(
      revision: 2, scenario: scenario, samples: 16, centerSeconds: transit)
    let rebuilt = try await deliveredFrame(
      from: runtime, request: .init(generation: 3, seriesKey: revisedKey, timeSeconds: transit))
    XCTAssertEqual(rebuilt.series.key, revisedKey)
    let rebuildMetrics = await runtime.metrics()
    XCTAssertEqual(rebuildMetrics.seriesBuilds, 2)
  }

  /// Ensures rapid playback requests collapse behind one sampled-series calculation.
  func testRuntimeCoalescesPlaybackBehindOneSeriesBuild() async throws {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let key = SeriesKey(revision: 1, scenario: scenario, samples: 32, centerSeconds: transit)
    let latestDelivered = expectation(description: "latest frame delivered")
    var latestFrame: PresentationFrame?
    let receiver: @Sendable @MainActor (CalculationOutcome) -> Void = { outcome in
      guard case .success(let frame) = outcome, frame.generation == 3 else { return }
      latestFrame = frame
      latestDelivered.fulfill()
    }

    await runtime.submit(
      .init(generation: 1, seriesKey: key, timeSeconds: transit), deliver: receiver)
    await runtime.submit(
      .init(generation: 2, seriesKey: key, timeSeconds: transit + 1), deliver: receiver)
    await runtime.submit(
      .init(generation: 3, seriesKey: key, timeSeconds: transit + 2), deliver: receiver)

    await fulfillment(of: [latestDelivered], timeout: 6)
    XCTAssertEqual(latestFrame?.generation, 3)
    let metrics = await runtime.metrics()
    XCTAssertEqual(metrics.seriesBuilds, 1)
    XCTAssertGreaterThanOrEqual(metrics.coalescedRequests, 1)
  }

  /// Ensures an older submission cannot replace a newer queued generation inside the actor.
  func testOlderActorArrivalCannotReplaceNewerPendingGeneration() async {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let key = SeriesKey(revision: 1, scenario: scenario, samples: 32, centerSeconds: transit)
    let newestDelivered = expectation(description: "newest pending generation delivered")
    var deliveredGenerations: [Int] = []
    let receiver: @Sendable @MainActor (CalculationOutcome) -> Void = { outcome in
      guard case .success(let frame) = outcome else { return }
      deliveredGenerations.append(frame.generation)
      if frame.generation == 3 { newestDelivered.fulfill() }
    }

    await runtime.submit(
      .init(generation: 1, seriesKey: key, timeSeconds: transit), deliver: receiver)
    await runtime.submit(
      .init(generation: 3, seriesKey: key, timeSeconds: transit + 2), deliver: receiver)
    await runtime.submit(
      .init(generation: 2, seriesKey: key, timeSeconds: transit + 1), deliver: receiver)

    await fulfillment(of: [newestDelivered], timeout: 6)
    XCTAssertFalse(deliveredGenerations.contains(2))
  }

  /// Ensures failures retain request identity and older lifecycle revisions cannot override pauses.
  func testRuntimeEnvelopesFailuresAndIgnoresOlderActivityRevisions() async {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let invalidKey = SeriesKey(
      revision: 1, scenario: scenario, samples: 8, centerSeconds: transit)
    let failureDelivered = expectation(description: "generation-tagged failure delivered")

    await runtime.setPaused(false, activityRevision: 2)
    await runtime.setPaused(true, activityRevision: 1)
    await runtime.submit(
      .init(generation: 9, seriesKey: invalidKey, timeSeconds: transit)
    ) { outcome in
      guard case .failure(let generation, let seriesKey, let message) = outcome else {
        return XCTFail("Expected an invalid-sample failure")
      }
      XCTAssertEqual(generation, 9)
      XCTAssertEqual(seriesKey, invalidKey)
      XCTAssertTrue(message.contains("16 samples"))
      failureDelivered.fulfill()
    }

    await fulfillment(of: [failureDelivered], timeout: 2)
  }

  /// Ensures session startup is idempotent and hidden scenes suspend playback progress.
  func testSessionStartsOnceAndPausesPlaybackWhileHidden() async throws {
    let session = EducationSession()
    session.setSampleCount(32)
    try await Task.sleep(for: .milliseconds(100))
    XCTAssertEqual(session.generation, 0)
    XCTAssertNil(session.frame)

    session.start()
    let firstGeneration = session.generation
    session.start()
    XCTAssertEqual(session.generation, firstGeneration)
    let producedInitialFrame = await waitUntil(timeout: .seconds(6)) { session.frame != nil }
    XCTAssertTrue(producedInitialFrame)

    let firstTime = try XCTUnwrap(session.frame?.scene.timeSeconds)
    session.setOccluded(true)
    session.toggleRunning()
    try await Task.sleep(for: .milliseconds(150))
    XCTAssertEqual(session.frame?.scene.timeSeconds, firstTime)

    session.setOccluded(false)
    let resumedPlayback = await waitUntil(timeout: .seconds(3)) {
      guard let time = session.frame?.scene.timeSeconds else { return false }
      return time != firstTime
    }
    XCTAssertTrue(resumedPlayback)
    session.toggleRunning()
  }

  /// Ensures invalid draft text remains editable without changing accepted simulation state.
  func testInvalidDraftTextIsRetainedWithoutReplacingAcceptedScenario() {
    let session = EducationSession()
    let acceptedScenario = session.scenario
    session.draftPlanetRadiusMetres = "not-a-number"

    session.applyDraft()

    XCTAssertEqual(session.draftPlanetRadiusMetres, "not-a-number")
    XCTAssertEqual(session.scenario, acceptedScenario)
    XCTAssertEqual(session.draftValidationErrors[.planetRadius], "Enter a finite number.")
    XCTAssertEqual(session.calculationStatus, "Parameters need attention")
  }

  /// Ensures accepted workspace state round-trips and unsupported schema versions fail clearly.
  func testWorkspaceDocumentRoundTripsAcceptedStateAndRejectsUnknownVersion() throws {
    let session = EducationSession()
    session.selectScenario(id: ScenarioCatalog.limbDarkeningVariation.identifier)
    session.completeCurrentLesson()
    XCTAssertTrue(session.completedLessonIDs.isEmpty)
    session.draftPlanetRadiusMetres = "not-a-number"
    session.applyDraft()

    let document = try OtherlightWorkspaceDocument(
      workspace: session.workspace(section: .guidedLabs))
    let data = try document.encodedData()
    let decoded = try OtherlightWorkspaceDocument(data: data)

    XCTAssertEqual(decoded.workspace.schemaVersion, "workspace-v1")
    XCTAssertEqual(decoded.workspace.productContext.mode, .lab)
    XCTAssertEqual(try decoded.workspace.educationScenario(), session.scenario)
    XCTAssertEqual(
      decoded.workspace.education.guidedLab?.learning.lessonID, session.selectedLessonID)
    XCTAssertEqual(decoded.workspace.education.guidedLab?.learning.passedStepIDs, [])
    XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("not-a-number"))

    let unsupported = Data(
      String(decoding: data, as: UTF8.self)
        .replacingOccurrences(of: "workspace-v1", with: "workspace-v0")
        .utf8)
    XCTAssertThrowsError(try OtherlightWorkspaceDocument(data: unsupported)) { error in
      XCTAssertEqual(
        error.localizedDescription, "Unsupported workspace schema version: workspace-v0.")
    }
  }

  /// Ensures new exports advertise Otherlight while legacy workspace files remain importable.
  func testWorkspaceDocumentRetainsLegacyImportTypes() {
    XCTAssertEqual(
      UTType.otherlightWorkspace.identifier, "com.sebastianspicker.Otherlight.workspace")
    XCTAssertEqual(UTType.otherlightWorkspaceFile.preferredFilenameExtension, "otherlight")
    XCTAssertEqual(
      UTType.legacyTransitLabWorkspace.identifier,
      "com.sebastianspicker.TransitLightCurveLab.workspace")
    XCTAssertEqual(UTType.legacyTransitLabWorkspaceFile.preferredFilenameExtension, "transitlab")
    XCTAssertTrue(
      OtherlightWorkspaceDocument.readableContentTypes.contains(.legacyTransitLabWorkspace))
    XCTAssertTrue(
      OtherlightWorkspaceDocument.readableContentTypes.contains(.legacyTransitLabWorkspaceFile))
  }

  /// Ensures canonical browser V4 scenarios import through the workspace boundary unchanged.
  func testWorkspaceDocumentImportsCanonicalBrowserV4Scenario() throws {
    let repositoryRoot = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    let fixtureURL = repositoryRoot.appendingPathComponent(
      "contracts/education-v4/fixtures/scoped-parity.json")
    let fixture = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as? [String: Any])
    let scenarios = try XCTUnwrap(fixture["scenarios"] as? [[String: Any]])
    let browserScenario = try XCTUnwrap(scenarios.first?["scenario"] as? [String: Any])
    let workspace: [String: Any] = [
      "schemaVersion": "workspace-v1",
      "productContext": [
        "profile": "education", "mode": "simulation", "ui": "essential",
        "source": "preset", "scenario": "default", "lab": "transit-exomoon",
        "lesson": "kepler-geometry", "runtime": "interactive",
      ],
      "education": ["scenario": browserScenario],
    ]

    let document = try OtherlightWorkspaceDocument(
      data: JSONSerialization.data(withJSONObject: workspace, options: [.sortedKeys]))

    XCTAssertEqual(try document.workspace.educationScenario(), ScenarioCatalog.default)
  }

  /// Ensures scientific profile claims require their matching scientific payload.
  func testWorkspaceDocumentRequiresScientificPayloadExactlyForScientificProfile() throws {
    let session = EducationSession()
    let data = try OtherlightWorkspaceDocument(workspace: session.workspace(section: .simulation))
      .encodedData()
    let object = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: data) as? [String: Any])
    var scientificWithoutRequest = object
    var productContext = try XCTUnwrap(object["productContext"] as? [String: Any])
    productContext["profile"] = "scientific"
    scientificWithoutRequest["productContext"] = productContext

    XCTAssertThrowsError(
      try OtherlightWorkspaceDocument(
        data: JSONSerialization.data(withJSONObject: scientificWithoutRequest))
    ) { error in
      XCTAssertEqual(
        error.localizedDescription,
        "This workspace is not supported by the native education app.")
    }
  }

  /// Ensures validated scientific requests import and unsupported fields are rejected.
  func testWorkspaceDocumentStrictlyImportsValidatedScientificRequest() throws {
    let session = EducationSession()
    let educationData = try OtherlightWorkspaceDocument(
      workspace: session.workspace(section: .simulation)
    ).encodedData()
    var workspace = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: educationData) as? [String: Any])
    var productContext = try XCTUnwrap(workspace["productContext"] as? [String: Any])
    productContext["profile"] = "scientific"
    workspace["productContext"] = productContext

    let contractURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("contracts/science-v5/contract-cases.json")
    let contract = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: Data(contentsOf: contractURL)) as? [String: Any])
    let request = try XCTUnwrap(contract["validForwardRequest"] as? [String: Any])
    workspace["scientific"] = ["request": request]

    let document = try OtherlightWorkspaceDocument(
      data: JSONSerialization.data(withJSONObject: workspace, options: [.sortedKeys]))
    let decodedRequest = try XCTUnwrap(document.workspace.scientific?.request)
    let expectedFingerprint = try XCTUnwrap(
      contract["validForwardRequestCanonicalSha256"] as? String)
    XCTAssertEqual(
      try ScienceCanonicalJSON.requestFingerprint(decodedRequest),
      expectedFingerprint)

    var unknownRequest = request
    unknownRequest["unsupported"] = true
    workspace["scientific"] = ["request": unknownRequest]
    XCTAssertThrowsError(
      try OtherlightWorkspaceDocument(
        data: JSONSerialization.data(withJSONObject: workspace, options: [.sortedKeys]))
    ) { error in
      XCTAssertTrue(error.localizedDescription.contains("unsupported"))
    }

    var nullDistanceRequest = request
    var nullDistanceScenario = try XCTUnwrap(nullDistanceRequest["scenario"] as? [String: Any])
    var nullDistanceObserver = try XCTUnwrap(nullDistanceScenario["observer"] as? [String: Any])
    nullDistanceObserver["distanceM"] = NSNull()
    nullDistanceScenario["observer"] = nullDistanceObserver
    nullDistanceRequest["scenario"] = nullDistanceScenario
    workspace["scientific"] = ["request": nullDistanceRequest]
    XCTAssertThrowsError(
      try OtherlightWorkspaceDocument(
        data: JSONSerialization.data(withJSONObject: workspace, options: [.sortedKeys])))
  }

  /// Ensures an edit during initial calculation schedules a replacement series request.
  func testChangingSamplesDuringInitialBuildSchedulesReplacement() async {
    let session = EducationSession()
    session.start()
    session.setSampleCount(32)

    let producedReplacement = await waitUntil(timeout: .seconds(8)) {
      session.frame?.plot.points.count == 32
    }
    XCTAssertTrue(producedReplacement)
    XCTAssertEqual(session.frame?.series.key.samples, 32)
  }

  /// Ensures sampled light-curve endpoints align with the shared playback domain.
  func testPlaybackDomainMatchesLightCurveDomain() async throws {
    let runtime = SimulationRuntime()
    let scenario = ScenarioCatalog.default
    let transit = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let key = SeriesKey(revision: 1, scenario: scenario, samples: 32, centerSeconds: transit)
    let frame = try await deliveredFrame(
      from: runtime, request: .init(generation: 1, seriesKey: key, timeSeconds: transit))
    let bounds = EducationSession.playbackBounds(for: scenario)
    let firstTime = try XCTUnwrap(frame.plot.points.first?.timeSeconds)
    let lastTime = try XCTUnwrap(frame.plot.points.last?.timeSeconds)

    XCTAssertEqual(firstTime, bounds.lowerBound, accuracy: 1e-9)
    XCTAssertEqual(lastTime, bounds.upperBound, accuracy: 1e-9)
    XCTAssertEqual(
      frame.series.lightCurveDomain.firstTimeSeconds, bounds.lowerBound, accuracy: 1e-9)
    XCTAssertEqual(
      frame.series.lightCurveDomain.lastTimeSeconds, bounds.upperBound, accuracy: 1e-9)
  }

  /// Ensures request building preserves generation, revision, scenario, and transit-centered key.
  func testCalculationRequestBuilderProducesCurrentSeriesRequest() {
    let scenario = ScenarioCatalog.default
    let request = CalculationRequestBuilder(
      generation: 7, seriesRevision: 3, scenario: scenario, sampleCount: 64, timeSeconds: 42
    ).build()

    XCTAssertEqual(request.generation, 7)
    XCTAssertEqual(request.seriesKey.revision, 3)
    XCTAssertEqual(request.seriesKey.scenario, scenario)
    XCTAssertEqual(request.seriesKey.samples, 64)
    XCTAssertEqual(
      request.seriesKey.centerSeconds,
      scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4,
      accuracy: 1e-9)
    XCTAssertEqual(request.timeSeconds, 42)
  }

  /// Ensures playback caps delayed ticks and keeps wrapped time inside policy bounds.
  func testPlaybackClockPolicyWrapsAndCapsElapsedTime() {
    let policy = PlaybackClockPolicy(scenario: ScenarioCatalog.default)
    let nearEnd = policy.bounds.upperBound - 1
    let expected = policy.advancedTime(
      from: nearEnd, elapsedSeconds: PlaybackClockPolicy.maximumElapsedSeconds)

    XCTAssertEqual(
      policy.advancedTime(from: nearEnd, elapsedSeconds: 10), expected, accuracy: 1e-9)
    XCTAssertTrue(policy.bounds.contains(expected))
    XCTAssertEqual(
      policy.advancedTime(from: policy.bounds.lowerBound, elapsedSeconds: -1),
      policy.bounds.lowerBound,
      accuracy: 1e-9)
  }

  /// Ensures coordinate mapping rejects invalid domains and clamps valid flux values.
  func testLightCurveCoordinateMapperHandlesZeroSpanDomainBoundsAndFluxClamping() throws {
    let bounds = CGRect(x: 24, y: 24, width: 120, height: 60)
    let zeroSpan = LightCurveCoordinateMapper(
      domain: .init(
        firstTimeSeconds: 5, lastTimeSeconds: 5, lowerFlux: 0.9, upperFlux: 1.1),
      size: CGSize(width: 168, height: 108))
    XCTAssertNil(zeroSpan.point(timeSeconds: 5, flux: 1))

    let mapper = LightCurveCoordinateMapper(
      domain: .init(
        firstTimeSeconds: 10, lastTimeSeconds: 20, lowerFlux: 0.9, upperFlux: 1.1),
      size: CGSize(width: 168, height: 108))
    XCTAssertNil(mapper.point(timeSeconds: 9.999, flux: 1))
    XCTAssertNil(mapper.point(timeSeconds: 20.001, flux: 1))

    let highFlux = try XCTUnwrap(mapper.point(timeSeconds: 10, flux: 2))
    let lowFlux = try XCTUnwrap(mapper.point(timeSeconds: 20, flux: 0))
    XCTAssertEqual(highFlux.x, bounds.minX, accuracy: 1e-9)
    XCTAssertEqual(highFlux.y, bounds.minY, accuracy: 1e-9)
    XCTAssertEqual(lowFlux.x, bounds.maxX, accuracy: 1e-9)
    XCTAssertEqual(lowFlux.y, bounds.maxY, accuracy: 1e-9)
  }

  /// Ensures the packaged real-system catalog can populate native scenario selection.
  func testBundledSnapshotIsAvailable() throws {
    XCTAssertEqual(BundledRealSystems.labels.count, 20)
    XCTAssertNoThrow(try BundledRealSystems.scenario(id: "ph1-b"))
  }

  /// Awaits a single successful runtime delivery while failing the test on an outcome error.
  private func deliveredFrame(
    from runtime: SimulationRuntime, request: CalculationRequest
  ) async throws -> PresentationFrame {
    let delivered = expectation(description: "frame \(request.generation) delivered")
    var captured: PresentationFrame?
    await runtime.submit(request) { outcome in
      switch outcome {
      case .success(let frame): captured = frame
      case .failure(_, _, let message): XCTFail(message)
      }
      delivered.fulfill()
    }
    await fulfillment(of: [delivered], timeout: 6)
    return try XCTUnwrap(captured)
  }

  /// Polls a main-actor condition until its bounded test deadline expires.
  private func waitUntil(
    timeout: Duration, condition: @escaping @MainActor () -> Bool
  ) async -> Bool {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if condition() { return true }
      try? await Task.sleep(for: .milliseconds(20))
    }
    return condition()
  }
}
