// Verifies core numerical behavior, compatibility imports, and presentation snapshot contracts.
import TransitCore
import TransitEducation
import TransitVisualization
import XCTest

/// Verifies core orbital, photometric, compatibility, and presentation contracts.
final class OtherlightCoreTests: XCTestCase {
  /// Rejects nonfinite scalar values at the SI interchange boundary.
  func testSIValueRejectsNonFinite() { XCTAssertThrowsError(try SIValue(.nan, unit: .metres)) }
  /// Checks the observer-frame position for a circular Kepler orbit.
  func testKeplerCircularPosition() {
    let p = KeplerOrbit(semiMajorAxisMetres: 10, periodSeconds: 100).position(at: 0)
    XCTAssertEqual(p.x, 0, accuracy: 1e-9)
    XCTAssertEqual(p.y, 10, accuracy: 1e-9)
  }
  /// Confirms a front-center transit attenuates normalized stellar flux.
  func testTransitFluxDropsAtFrontCentre() throws {
    var engine = try SimulationEngine(scenario: ScenarioCatalog.default)
    let step = try engine.step(at: ScenarioCatalog.default.planet.orbit.periodSeconds / 4)
    XCTAssertLessThan(step.flux, 1)
  }
  /// Confirms timing diagnostics can be available outside an active attenuation snapshot.
  func testEighthPeriodHasTimingWithoutTransitAttenuation() throws {
    var engine = try SimulationEngine(scenario: ScenarioCatalog.default)
    let step = try engine.step(at: ScenarioCatalog.default.planet.orbit.periodSeconds / 8)
    XCTAssertEqual(step.fluxComponents.transitFactor, 1)
    XCTAssertNotNil(step.transitTiming.planetTransitCenterSec)
  }
  /// Ensures overlapping planet and moon silhouettes use one union mask.
  func testQuarterPeriodUsesPlanetMoonUnionMask() throws {
    var withMoon = try SimulationEngine(scenario: ScenarioCatalog.default)
    var planetOnly = try SimulationEngine(scenario: ScenarioCatalog.keplerPlanetOnly)
    let time = ScenarioCatalog.default.planet.orbit.periodSeconds / 4
    XCTAssertLessThan(
      try withMoon.step(at: time).fluxComponents.transitFactor,
      try planetOnly.step(at: time).fluxComponents.transitFactor)
  }
  /// Ensures an enabled moon contributes a distinct sky-plane point.
  func testMoonGeometryAddsPoint() throws {
    var s = ScenarioCatalog.default
    s.moon = Moon(
      radiusMetres: 1.7e6, orbit: .init(semiMajorAxisMetres: 4e8, periodSeconds: 50_000))
    var engine = try SimulationEngine(scenario: s)
    XCTAssertEqual(try engine.step(at: 64_800).skyPoints.count, 2)
  }
  /// Rejects a physically invalid zero stellar radius.
  func testValidationRejectsZeroRadius() {
    var s = ScenarioCatalog.default
    s.star.radiusMetres = 0
    XCTAssertThrowsError(try SimulationEngine(scenario: s))
  }
  /// Verifies the stable lesson catalogue and native-compatible scenario decoding.
  func testCatalogAndLessons() {
    XCTAssertEqual(LessonCatalog.lessons.count, 4)
    XCTAssertNoThrow(
      try ScenarioCatalog.decodeCompatibleRealSystem(
        from: JSONEncoder().encode(ScenarioCatalog.default)))
  }
  /// Confirms a valid geometry snapshot completes the matching lesson check.
  func testLessonReport() throws {
    var engine = try SimulationEngine(scenario: ScenarioCatalog.default)
    XCTAssertTrue(
      LessonEvaluator.report(for: "kepler-geometry", step: try engine.step(at: 0)).isComplete)
  }
  /// Confirms a transit snapshot adapts to scene, plot, and accessibility surfaces.
  func testRenderingSummary() throws {
    let scenario = ScenarioCatalog.default
    var engine = try SimulationEngine(scenario: scenario)
    let transitCenter = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let step = try engine.step(at: transitCenter)
    XCTAssertLessThan(step.fluxComponents.transitFactor, 1)
    let scene = SceneSnapshot(step: step)
    XCTAssertTrue(AccessibleSummary.scene(scene).contains("Flux"))
    _ = PlotSnapshot(steps: [step])
  }
  /// Compares imported browser V4 scenarios against their scoped parity fixture.
  func testBrowserV4FixtureImportAndScopedKinematicsParity() throws {
    let fixtureURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("../../../../../../contracts/education-v4/fixtures/scoped-parity.json")
      .standardizedFileURL
    let fixture = try JSONDecoder().decode(ParityFixture.self, from: Data(contentsOf: fixtureURL))
    XCTAssertEqual(
      fixture.scenarios.map(\.id), ["default", "kepler-planet-only", "limb-darkening-variation"])
    for entry in fixture.scenarios {
      XCTAssertEqual(entry.sampleTimesSec, entry.sampleTimesSec.sorted())
      XCTAssertTrue(entry.sampleTimesSec.allSatisfy(\.isFinite))
      XCTAssertEqual(entry.expectedSteps.count, entry.sampleTimesSec.count)
      let scenario = try BrowserV4Import.scenario(from: entry.scenario, identifier: entry.id)
      var engine = try SimulationEngine(scenario: scenario)
      let actual = try engine.sample(times: entry.sampleTimesSec)
      for (expected, step) in zip(entry.expectedSteps, actual) {
        XCTAssertTrue(step.flux.isFinite)
        XCTAssertEqual(
          expected.renderSignals.events,
          step.renderSignals.events.map {
            .init(id: $0.id, kind: $0.kind, label: $0.label, active: $0.active)
          })
        XCTAssertEqual(expected.warningFlags, step.warnings)
        assertClose(
          expected.kinematics.planetSky, point(named: "planet", in: step),
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        if let moon = expected.kinematics.moonSky {
          assertClose(
            moon, point(named: "moon", in: step),
            absolute: fixture.comparisonPolicy.floating.absolute,
            relative: fixture.comparisonPolicy.floating.relative)
        }
        assertClose(
          expected.flux.total, step.fluxComponents.total,
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        assertClose(
          expected.flux.transitFactor, step.fluxComponents.transitFactor,
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        assertClose(
          expected.flux.stellarPreTransit, step.fluxComponents.stellarPreTransit,
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        assertClose(
          expected.flux.planetPhase, step.fluxComponents.planetPhase,
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        assertClose(
          expected.flux.moonPhase, step.fluxComponents.moonPhase,
          absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
        assertTiming(
          expected.timing, step.transitTiming, absolute: fixture.comparisonPolicy.floating.absolute,
          relative: fixture.comparisonPolicy.floating.relative)
      }
    }
    let bad = Data(
      "{\"version\":\"3\",\"mode\":\"general-lab\",\"bodies\":{\"stars\":[],\"planets\":[],\"moons\":[]}}"
        .utf8)
    XCTAssertThrowsError(
      try BrowserV4Import.scenario(
        from: JSONDecoder().decode(BrowserV4ScenarioDTO.self, from: bad), identifier: "bad"))
  }
  /// Converts a real-system catalogue snapshot into a physically positive native scenario.
  func testRealSystemSnapshotImport() throws {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent(
      "../../../../../browser/src/application/catalog/real-systems.snapshot.json"
    ).standardizedFileURL
    let snapshot = try JSONDecoder().decode(RealSystemSnapshotDTO.self, from: Data(contentsOf: url))
    XCTAssertFalse(snapshot.systems.isEmpty)
    let scenario = try RealSystemSnapshotImport.scenario(from: snapshot.systems[0])
    XCTAssertEqual(scenario.identifier, snapshot.systems[0].id)
    XCTAssertGreaterThan(scenario.planet.orbit.periodSeconds, 0)
  }
}

/// Decodes browser V4 parity expectations without coupling tests to fixture JSON layout.
private struct ParityFixture: Decodable {
  /// Holds the fixture's floating-point comparison policy.
  struct Policy: Decodable {
    /// Holds absolute and relative tolerances for parity assertions.
    struct Floating: Decodable {
      let absolute: Double
      let relative: Double
    }
    let floating: Floating
  }
  /// Represents an expected observer-frame coordinate triple.
  struct Point: Decodable, Equatable {
    let x: Double
    let y: Double
    let z: Double
  }
  /// Represents one expected render event from the browser contract.
  struct Event: Decodable, Equatable {
    let id: String
    let kind: String
    let label: String
    let active: Bool
  }
  /// Groups expected planet and optional moon sky positions.
  struct Kinematics: Decodable {
    let planetSky: Point
    let moonSky: Point?
  }
  /// Holds the expected render events for a parity step.
  struct Render: Decodable { let events: [Event] }
  /// Holds the expected flux decomposition for a parity step.
  struct Flux: Decodable {
    let total: Double
    let transitFactor: Double
    let stellarPreTransit: Double
    let planetPhase: Double
    let moonPhase: Double
  }
  /// Holds optional expected transit contacts for a parity step.
  struct Timing: Decodable {
    let planetTransitCenterSec: Double?
    let planetTransitDurationSec: Double?
    let planetIngressSec: Double?
    let planetEgressSec: Double?
    let moonTransitCenterSec: Double?
    let moonTransitDurationSec: Double?
    let moonIngressSec: Double?
    let moonEgressSec: Double?
  }
  /// Groups every expected output facet for one sampled parity instant.
  struct Step: Decodable {
    let kinematics: Kinematics
    let flux: Flux
    let timing: Timing?
    let renderSignals: Render
    let warningFlags: [String]
  }
  /// Names one fixture scenario and its sampled expected outputs.
  struct Entry: Decodable {
    let id: String
    let sampleTimesSec: [Double]
    let scenario: BrowserV4ScenarioDTO
    let expectedSteps: [Step]
  }
  let comparisonPolicy: Policy
  let scenarios: [Entry]
}
/// Extracts a named simulation point into the fixture's comparable coordinate type.
private func point(named name: String, in step: EducationStep) -> ParityFixture.Point {
  let point = step.skyPoints.first { $0.body == name }!
  return .init(x: point.position.x, y: point.position.y, z: point.position.z)
}
/// Asserts coordinate-wise floating-point parity using the fixture policy.
private func assertClose(
  _ expected: ParityFixture.Point, _ actual: ParityFixture.Point, absolute: Double,
  relative: Double, file: StaticString = #filePath, line: UInt = #line
) {
  for (e, a) in [(expected.x, actual.x), (expected.y, actual.y), (expected.z, actual.z)] {
    XCTAssertLessThanOrEqual(
      abs(e - a), absolute + relative * abs(e), "expected \(e), got \(a)", file: file, line: line)
  }
}
/// Asserts scalar floating-point parity using the fixture policy.
private func assertClose(
  _ expected: Double, _ actual: Double, absolute: Double, relative: Double,
  file: StaticString = #filePath, line: UInt = #line
) {
  XCTAssertLessThanOrEqual(
    abs(expected - actual), absolute + relative * abs(expected),
    "expected \(expected), got \(actual)", file: file, line: line)
}
/// Asserts that optional timing contacts and their numeric values match fixture expectations.
private func assertTiming(
  _ expected: ParityFixture.Timing?, _ actual: TransitTimingDiagnostics, absolute: Double,
  relative: Double, file: StaticString = #filePath, line: UInt = #line
) {
  let values: [(Double?, Double?)] = [
    (expected?.planetTransitCenterSec, actual.planetTransitCenterSec),
    (expected?.planetTransitDurationSec, actual.planetTransitDurationSec),
    (expected?.planetIngressSec, actual.planetIngressSec),
    (expected?.planetEgressSec, actual.planetEgressSec),
    (expected?.moonTransitCenterSec, actual.moonTransitCenterSec),
    (expected?.moonTransitDurationSec, actual.moonTransitDurationSec),
    (expected?.moonIngressSec, actual.moonIngressSec),
    (expected?.moonEgressSec, actual.moonEgressSec),
  ]
  for (e, a) in values {
    XCTAssertEqual(e == nil, a == nil, file: file, line: line)
    if let e, let a {
      assertClose(e, a, absolute: absolute, relative: relative, file: file, line: line)
    }
  }
}
