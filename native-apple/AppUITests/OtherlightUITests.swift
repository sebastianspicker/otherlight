// Verifies that the native simulation workspace launches into its adaptive primary surface.
import XCTest
#if os(iOS)
  import UIKit
#endif

/// Exercises launch, parameters, and draft-validation accessibility across supported platforms.
@MainActor
final class OtherlightUITests: XCTestCase {
  /// Verifies that launching the app exposes the primary simulation workspace.
  func testSimulationWorkspaceLaunches() {
    let app = launchWorkspaceApp()
    XCTAssertTrue(app.staticTexts["Simulation"].waitForExistence(timeout: 5))
  }

  /// Captures the uncluttered simulation workspace for the maintained platform tour.
  func testCaptureSimulationTourFrame() {
    let app = launchScreenshotApp(scenario: "simulation")
    XCTAssertTrue(
      app.descendants(matching: .any)["simulation-dashboard"].waitForExistence(timeout: 8))
    #if os(macOS)
      let parameters = app.buttons["parameters-button"]
      if parameters.exists { parameters.click() }
    #endif
    attachScreenshot(of: app, state: "simulation")
  }

  /// Captures the native parameter editor in its platform-appropriate inspector or sheet.
  func testCaptureParametersTourFrame() {
    let app = launchScreenshotApp(scenario: "parameters")
    openParameters(in: app)
    XCTAssertTrue(app.textFields["planet-radius"].waitForExistence(timeout: 8))
    attachScreenshot(of: app, state: "parameters")
  }

  /// Captures the Guided Labs destination after deterministic launch routing settles.
  func testCaptureGuidedLabTourFrame() {
    let app = launchScreenshotApp(scenario: "guided-lab")
    #if os(macOS)
      let visibleSurface = "guided-lab-detail"
    #else
      let visibleSurface =
        UIDevice.current.userInterfaceIdiom == .pad ? "guided-lab-detail" : "guided-labs-list"
    #endif
    XCTAssertTrue(app.descendants(matching: .any)[visibleSurface].waitForExistence(timeout: 8))
    attachScreenshot(of: app, state: "guided-lab")
  }

  /// Captures one native dark hero while keeping the rest of the walkthrough in light appearance.
  func testCaptureDarkHeroTourFrame() {
    let app = launchScreenshotApp(scenario: "simulation", appearance: "dark")
    XCTAssertTrue(
      app.descendants(matching: .any)["simulation-dashboard"].waitForExistence(timeout: 8))
    #if os(macOS)
      let parameters = app.buttons["parameters-button"]
      if parameters.exists { parameters.click() }
    #endif
    attachScreenshot(of: app, state: "dark-simulation")
  }

  /// Verifies that platform-appropriate parameters presentation retains invalid editable draft input.
  func testInvalidDraftKeepsTextAndShowsItsFieldError() {
    let app = launchWorkspaceApp()
    openParameters(in: app)
    let planetRadius = app.textFields["planet-radius"]
    XCTAssertTrue(planetRadius.waitForExistence(timeout: 5))

    #if os(macOS)
      planetRadius.click()
      planetRadius.typeText("invalid")
      app.buttons["Apply"].click()
    #else
      planetRadius.tap()
      planetRadius.typeText("invalid")
      app.buttons["parameter-apply"].tap()
    #endif

    XCTAssertTrue(app.staticTexts["planet-radius-error"].waitForExistence(timeout: 2))
    XCTAssertTrue((planetRadius.value as? String)?.contains("invalid") == true)
  }

  #if os(iOS)
    /// Verifies the compact shell exposes independent Simulation and Guided Labs destinations.
    func testCompactTabsExposeGuidedLabsAndWorkspaceActions() {
      let app = launchWorkspaceApp()

      if UIDevice.current.userInterfaceIdiom == .pad {
        XCTAssertTrue(app.staticTexts["Guided Labs"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["workspace-more-actions"].exists)
        XCTAssertTrue(app.buttons["parameters-button"].exists)
        return
      }

      let guidedLabsTab = app.tabBars.buttons["Guided Labs"]
      XCTAssertTrue(guidedLabsTab.waitForExistence(timeout: 5))
      guidedLabsTab.tap()
      XCTAssertTrue(
        app.descendants(matching: .any)["guided-labs-list"].waitForExistence(timeout: 5))
      XCTAssertTrue(app.buttons["workspace-more-actions"].exists)
      XCTAssertTrue(app.buttons["parameters-button"].exists)
    }
  #endif

  /// Opens parameters from the desktop inspector state or the iPad and iPhone sheet control.
  private func openParameters(in app: XCUIApplication) {
    #if os(iOS)
      XCTAssertTrue(
        app.descendants(matching: .any)["simulation-dashboard"].waitForExistence(timeout: 8))
      let parameters = app.buttons["parameters-button"]
      XCTAssertTrue(parameters.waitForExistence(timeout: 5))
      parameters.tap()
    #endif
  }

  /// Launches the app with the documented screenshot-only environment contract.
  private func launchScreenshotApp(scenario: String, appearance: String = "light")
    -> XCUIApplication
  {
    let app = XCUIApplication()
    configureWorkspaceDefaults(for: app)
    app.launchEnvironment["OTHERLIGHT_SCREENSHOT_MODE"] = "1"
    app.launchEnvironment["OTHERLIGHT_SCREENSHOT_SCENARIO"] = scenario
    app.launchEnvironment["OTHERLIGHT_SCREENSHOT_APPEARANCE"] = appearance
    app.launch()
    return app
  }

  /// Launches an ordinary workspace test with persisted navigation reset to its simulation default.
  private func launchWorkspaceApp() -> XCUIApplication {
    let app = XCUIApplication()
    configureWorkspaceDefaults(for: app)
    app.launch()
    return app
  }

  /// Supplies the existing preference keys as launch defaults without changing production persistence.
  private func configureWorkspaceDefaults(for app: XCUIApplication) {
    app.launchArguments += [
      "-Otherlight.workspaceSection", "simulation",
      "-TransitLightCurveLab.workspaceSection", "",
    ]
  }

  /// Stores a stable, named app-surface attachment for extraction from the result bundle.
  private func attachScreenshot(of app: XCUIApplication, state: String) {
    #if os(macOS)
      let platform = "macos"
    #else
      let platform = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
    #endif
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "\(platform)-\(state)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
