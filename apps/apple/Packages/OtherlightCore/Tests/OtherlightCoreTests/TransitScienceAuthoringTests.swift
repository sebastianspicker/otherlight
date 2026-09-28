// Verifies the portable accepted-Education-to-strict-V5 authoring boundary.
import TransitEducation
import TransitScienceAuthoring
import XCTest

/// Exercises the portable, fail-closed boundary from accepted V4 state to a strict V5 request.
final class TransitScienceAuthoringTests: XCTestCase {
  /// Produces a validated barycentric request from the bundled three-body Education scenario.
  func testCompilesDefaultEducationScenarioToBarycentricStrictRequest() throws {
    let request = try TransitScienceAuthoring.compile(ScenarioCatalog.default)
    XCTAssertEqual(request.kind, "forward")
    XCTAssertEqual(request.outputs, ["radial-velocity"])
    XCTAssertEqual(request.scenario.bodies.map(\.id), ["star", "planet", "moon"])
    XCTAssertEqual(request.scenario.observer.targetBodyId, "star")
    try request.validate()
    let totalMass = request.scenario.bodies.reduce(0.0) { $0 + $1.massKg }
    for axis in 0..<3 {
      let position = request.scenario.bodies.reduce(0.0) {
        $0 + $1.massKg * $1.state.positionM.values[axis]
      }
      let velocity = request.scenario.bodies.reduce(0.0) {
        $0 + $1.massKg * $1.state.velocityMps.values[axis]
      }
      XCTAssertLessThan(abs(position / totalMass), 1e-3)
      XCTAssertLessThan(abs(velocity / totalMass), 1e-9)
    }
  }

  /// Rejects Education values that do not define the mass required by scientific dynamics.
  func testRejectsEducationPlanetWithoutScientificMass() {
    var scenario = ScenarioCatalog.keplerPlanetOnly
    scenario.planet.massKilograms = 0
    XCTAssertThrowsError(try TransitScienceAuthoring.compile(scenario)) { error in
      XCTAssertTrue(error.localizedDescription.contains("massKilograms"))
    }
  }

  /// Reserves room for the stable prefix inside V5's 128-scalar identifier ceiling.
  func testRejectsIdentifierThatWouldOverflowPrefixedV5Identifier() {
    var scenario = ScenarioCatalog.default
    scenario.identifier = String(repeating: "x", count: 119)
    XCTAssertThrowsError(try TransitScienceAuthoring.compile(scenario)) { error in
      XCTAssertTrue(error.localizedDescription.contains("118 Unicode scalars"))
    }
  }
}
