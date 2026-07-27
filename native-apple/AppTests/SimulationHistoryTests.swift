// Verifies durable native playback, diagnostic history, guided-state, and export behavior.
import TransitEducation
import XCTest

@testable import Otherlight

/// Verifies bounded local history, playback policy, export data, and workspace restoration.
final class SimulationHistoryTests: XCTestCase {
  /// Ensures light-curve history rejects nonfinite values and preserves ordered bounded samples.
  func testLightCurveKeepsFiniteChronologicalDeduplicatedCapacity() {
    var history = LightCurveHistory()
    history.append(timeSeconds: 2, flux: 0.98)
    history.append(timeSeconds: 1, flux: 0.99)
    history.append(timeSeconds: 2, flux: 0.97)
    history.append(timeSeconds: .nan, flux: 0.5)
    for time in 3...2_002 { history.append(timeSeconds: Double(time), flux: 1) }
    XCTAssertEqual(history.samples.count, 2_000)
    XCTAssertEqual(history.samples.first?.timeSeconds, 3)
    XCTAssertEqual(history.samples.last?.timeSeconds, 2_002)
    XCTAssertEqual(history.csv.components(separatedBy: "\n").first, "time_s,flux")
    history.clear()
    history.undoClear()
    XCTAssertEqual(history.samples.count, 2_000)
    history.reset()
    XCTAssertTrue(history.samples.isEmpty)
  }

  /// Ensures timing history fits O-C residuals and restores exactly one cleared snapshot.
  func testTransitHistoryUsesLeastSquaresOcAndOneLevelUndo() {
    var history = TransitEventHistory()
    for ordinal in 0..<4 {
      history.append(
        .init(
          body: .planet, centerSeconds: 100 + Double(ordinal) * 10, observedFlux: 0.99, series: .raw
        ), currentTimeSeconds: 200)
    }
    history.append(
      .init(body: .planet, centerSeconds: 120, observedFlux: 0.98, series: .detrended),
      currentTimeSeconds: 200)
    history.append(
      .init(body: .moon, centerSeconds: .infinity, observedFlux: 1, series: .fit),
      currentTimeSeconds: 200)
    history.append(
      .init(body: .moon, centerSeconds: 150, observedFlux: 1, series: .fit), currentTimeSeconds: 200
    )
    XCTAssertEqual(history.events[.planet]?.count, 4)
    XCTAssertEqual(history.events[.planet]?[2].series, .detrended)
    XCTAssertEqual(history.ephemeris(for: .planet)?.periodSeconds ?? .nan, 10, accuracy: 1e-10)
    XCTAssertEqual(history.latestResidualMilliseconds(for: .planet) ?? .nan, 0, accuracy: 1e-8)
    XCTAssertEqual(history.rmsResidualMilliseconds(for: .planet) ?? .nan, 0, accuracy: 1e-8)
    XCTAssertTrue(history.csv.contains("center_s,oc_ms"))
    XCTAssertTrue(history.csv.contains("moon,0,150.0,,fit,1.0"))
    history.clear()
    history.undoClear()
    XCTAssertEqual(history.events[.planet]?.count, 4)
  }

  /// Ensures playback policy honors pause, wrapping, and explicit clamp semantics.
  func testPlaybackSpeedCanPauseWrapOrClamp() {
    let policy = PlaybackClockPolicy(scenario: ScenarioCatalog.default)
    XCTAssertEqual(policy.advancedTime(from: 1, elapsedSeconds: 0.1, speed: .paused), 1)
    XCTAssertEqual(
      policy.advancedTime(
        from: policy.bounds.upperBound, elapsedSeconds: 0.25, speed: .fourX, wrap: false),
      policy.bounds.upperBound)
    XCTAssertLessThan(
      policy.advancedTime(from: policy.bounds.upperBound, elapsedSeconds: 0.25, speed: .oneX),
      policy.bounds.upperBound)
  }

  /// Ensures accepted frames populate diagnostic histories used by real export formats.
  @MainActor
  func testAcceptedFrameFeedsDiagnosticHistoriesAndRealExports() async throws {
    let session = EducationSession()
    session.setSampleCount(32)
    session.start()
    for _ in 0..<120 where session.frame == nil {
      try await Task.sleep(for: .milliseconds(50))
    }

    XCTAssertNotNil(session.frame)
    XCTAssertTrue(session.canExport)
    XCTAssertEqual(session.lightCurveHistory.samples.count, 1)
    XCTAssertGreaterThanOrEqual(session.transitEventCount, 2)
    XCTAssertEqual(session.exportDocument.csv.components(separatedBy: "\n").first, "time_s,flux")
    XCTAssertEqual(
      session.exportDocument.oc.components(separatedBy: "\n").first,
      "body,ordinal,center_s,oc_ms,series,flux")
    XCTAssertFalse(session.exportDocument.oc.contains("illustrative_timing_proxy"))
    session.selectScenario(id: ScenarioCatalog.keplerPlanetOnly.identifier)
    XCTAssertFalse(session.canExport)
  }

  /// Ensures durable guided state round-trips while ephemeral playback history does not.
  @MainActor
  func testGuidedStateAndAdvancedTierRoundTripWithoutPlaybackHistory() throws {
    let session = EducationSession()
    let firstPrompt = try XCTUnwrap(session.currentGuidedPhase?.prompts.first)
    session.setGuidedResponse("The flux falls during overlap.", for: firstPrompt.responseKey)
    session.moveGuidedPhase(by: 1)
    let secondPrompt = try XCTUnwrap(session.currentGuidedPhase?.prompts.first)
    session.setGuidedResponse(
      "Projected occultation removes stellar light.", for: secondPrompt.responseKey)
    session.setGuidedComparisonObservation("The larger radius produces the deeper dip.")
    session.setHintLevel(.l3)
    session.setInterfaceTier(.advanced)

    let workspace = session.workspace(section: .guidedLabs)
    let data = try OtherlightWorkspaceDocument(workspace: workspace).encodedData()
    let restored = EducationSession()
    try restored.restore(workspace: OtherlightWorkspaceDocument(data: data).workspace)

    XCTAssertEqual(restored.interfaceTier, .advanced)
    XCTAssertEqual(restored.hintLevel, .l3)
    XCTAssertEqual(restored.guidedPhaseIndex, 1)
    XCTAssertEqual(
      restored.guidedResponse(for: firstPrompt.responseKey), "The flux falls during overlap.")
    XCTAssertEqual(
      restored.guidedComparisonObservation, "The larger radius produces the deeper dip.")
    XCTAssertEqual(restored.currentGuidedRubric.score, 1)
    XCTAssertTrue(restored.lightCurveHistory.samples.isEmpty)
    XCTAssertEqual(restored.transitEventCount, 0)
  }
}
