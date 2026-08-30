// Verifies the native Guided Learning catalog, progression, rubric, hints, and report export.
import TransitEducation
import XCTest

/// Verifies deterministic guided-lab prompts, scoring, navigation, and report rendering.
final class GuidedLearningTests: XCTestCase {
  /// Confirms lesson-aligned keys, bounded navigation, and weighted scoring stay stable.
  func testCatalogAlignedStableKeysNavigationAndWeightedRubric() {
    XCTAssertEqual(
      LessonCatalog.lessons.map(\.id),
      ["kepler-geometry", "curve-reading-lab", "exomoon-transit-lab", "limb-darkening-lab"])
    let phases = GuidedLearning.phases(for: "kepler-geometry")
    XCTAssertEqual(phases.map(\.id), ["observe", "explain"])
    XCTAssertEqual(phases[0].prompts[0].responseKey, "kepler-geometry.observe")
    var session = GuidedLabSession(lessonID: "kepler-geometry")
    session.move(to: 99, phaseCount: phases.count)
    session.pass(phaseID: "observe")
    session.pass(phaseID: "observe")
    session.setResponse("The flux decreases.", for: phases[0].prompts[0].responseKey)
    XCTAssertEqual(session.phaseIndex, 1)
    XCTAssertEqual(session.passedPhaseIDs, ["observe"])
    XCTAssertEqual(GuidedLearning.rubric(session: session).score, 1.0 / 3.0, accuracy: 1e-12)
    XCTAssertNotEqual(
      GuidedLearning.hint(for: .l1, lessonID: session.lessonID),
      GuidedLearning.hint(for: .l3, lessonID: session.lessonID))
  }

  /// Ensures Markdown fences safely contain backticks and comparisons appear once.
  func testMarkdownUsesFenceLongerThanResponseTicksAndOneComparison() {
    var session = GuidedLabSession(lessonID: "curve-reading-lab")
    session.setResponse("Use ```code``` safely", for: "curve-reading-lab.observe")
    session.setComparison(.init(leftLabel: "A", rightLabel: "B", observation: "B is deeper."))
    let report = GuidedLearning.markdownReport(session: session)
    XCTAssertTrue(report.contains("````"))
    XCTAssertTrue(report.contains("A (A) vs B (B): B is deeper."))
  }
}
