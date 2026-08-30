// Composes the native workspace around session state, simulations, guided labs, and export.
import Foundation
import SwiftUI
import TransitEducation
import TransitVisualization
import UniformTypeIdentifiers

/// Describes deterministic launch state used only by the maintained screenshot tour.
private struct ScreenshotConfiguration {
  let scenario: String
  let appearance: ColorScheme?

  /// Reads explicit capture state without changing ordinary app launches or persisted preferences.
  static var current: ScreenshotConfiguration? {
    let environment = ProcessInfo.processInfo.environment
    guard environment["OTHERLIGHT_SCREENSHOT_MODE"] == "1" else { return nil }
    let scenario = environment["OTHERLIGHT_SCREENSHOT_SCENARIO"] ?? "simulation"
    let appearance: ColorScheme? =
      switch environment["OTHERLIGHT_SCREENSHOT_APPEARANCE"] {
      case "dark": ColorScheme.dark
      case "light": ColorScheme.light
      default: nil
      }
    return ScreenshotConfiguration(scenario: scenario, appearance: appearance)
  }

  /// Maps capture scenarios to the same primary destinations a user selects in the interface.
  var section: WorkspaceSection {
    scenario == "guided-lab" ? .guidedLabs : .simulation
  }
}

/// Coordinates session state, workspace persistence, and platform-adaptive navigation.
struct OtherlightWorkspace: View {
  @Environment(\.scenePhase) private var scenePhase
  @State private var session = EducationSession()
  @AppStorage("Otherlight.workspaceSection") private var restoredSection =
    WorkspaceSection.simulation.rawValue
  @AppStorage("TransitLightCurveLab.workspaceSection") private var legacyRestoredSection = ""
  @State private var selection: WorkspaceSection? = nil
  @State private var showsInspector = true
  @State private var workspaceDocument: OtherlightWorkspaceDocument?
  @State private var showsWorkspaceImporter = false
  @State private var showsWorkspaceExporter = false
  @State private var workspaceErrorMessage: String?
  private let screenshotConfiguration = ScreenshotConfiguration.current

  /// Builds the scene-aware workspace and routes document import/export results to session state.
  var body: some View {
    documentPresentation.preferredColorScheme(screenshotConfiguration?.appearance)
  }

  /// Selects the shared workspace shell while keeping desktop command routing platform-specific.
  @ViewBuilder
  private var platformWorkspace: some View {
    #if os(macOS)
      OtherlightWorkspaceShell(
        session: session,
        selection: $selection,
        showsInspector: $showsInspector,
        openWorkspace: { showsWorkspaceImporter = true },
        saveWorkspace: saveWorkspace
      )
      .focusedSceneValue(
        \.workspaceActions,
        WorkspaceActions(
          openWorkspace: { showsWorkspaceImporter = true },
          saveWorkspace: saveWorkspace,
          recalculate: session.recalculate, toggleRunning: session.toggleRunning,
          jumpToTransit: session.jumpToTransit, resetSimulation: session.resetSimulation)
      )
    #else
      OtherlightWorkspaceShell(
        session: session,
        selection: $selection,
        showsInspector: $showsInspector,
        openWorkspace: { showsWorkspaceImporter = true },
        saveWorkspace: saveWorkspace
      )
    #endif
  }

  /// Applies scene activation and persisted section restoration independently of file presentation.
  private var lifecycleWorkspace: some View {
    platformWorkspace
      .onAppear {
        // The renamed bundle receives a distinct defaults domain. Copy this one
        // lightweight navigation preference when a legacy installation supplies it.
        if restoredSection == WorkspaceSection.simulation.rawValue,
          WorkspaceSection(rawValue: legacyRestoredSection) != nil
        {
          restoredSection = legacyRestoredSection
        }
        selection =
          screenshotConfiguration?.section
          ?? WorkspaceSection(rawValue: restoredSection)
          ?? .simulation
        if screenshotConfiguration != nil {
          showsInspector = screenshotConfiguration?.scenario == "parameters"
          session.selectScenario(id: "kepler-planet-only")
          session.jumpToTransit()
          session.recalculate()
        }
        session.setSceneActive(scenePhase == .active)
        session.start()
      }
      .onChange(of: selection) { _, newValue in
        if screenshotConfiguration == nil, let newValue { restoredSection = newValue.rawValue }
      }
      .onChange(of: scenePhase) { _, phase in
        session.setSceneActive(phase == .active)
      }
  }

  /// Attaches workspace import, export, and error presentation to the lifecycle-aware shell.
  private var documentPresentation: some View {
    lifecycleWorkspace
      .fileImporter(
        isPresented: $showsWorkspaceImporter,
        allowedContentTypes: [
          .otherlightWorkspace, .otherlightWorkspaceFile, .legacyTransitLabWorkspace,
          .legacyTransitLabWorkspaceFile,
        ]
      ) { result in
        importWorkspace(result)
      }
      .fileExporter(
        isPresented: $showsWorkspaceExporter,
        document: workspaceDocument,
        contentType: .otherlightWorkspace,
        defaultFilename: "otherlight-workspace.otherlight"
      ) { result in
        if case .failure(let error) = result { workspaceErrorMessage = error.localizedDescription }
      }
      .alert(
        "Workspace file could not be used",
        isPresented: workspaceErrorIsPresented
      ) {
        Button("OK") { workspaceErrorMessage = nil }
      } message: {
        Text(workspaceErrorMessage ?? "The current workspace was not changed.")
      }
  }

  /// Maps the optional workspace failure into SwiftUI's Boolean alert presentation contract.
  private var workspaceErrorIsPresented: Binding<Bool> {
    Binding(
      get: { workspaceErrorMessage != nil },
      set: { if !$0 { workspaceErrorMessage = nil } })
  }

  /// Serializes the current session state and presents the standard workspace exporter.
  private func saveWorkspace() {
    do {
      workspaceDocument = try OtherlightWorkspaceDocument(
        workspace: session.workspace(section: selection ?? .simulation))
      showsWorkspaceExporter = true
    } catch {
      workspaceErrorMessage = error.localizedDescription
    }
  }

  /// Restores a security-scoped workspace file while preserving the current state on failure.
  private func importWorkspace(_ result: Result<URL, Error>) {
    do {
      let url = try result.get()
      let hasAccess = url.startAccessingSecurityScopedResource()
      defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
      let document = try OtherlightWorkspaceDocument(data: Data(contentsOf: url))
      try session.restore(workspace: document.workspace)
      selection = document.workspace.productContext.mode == .lab ? .guidedLabs : .simulation
    } catch {
      workspaceErrorMessage = error.localizedDescription
    }
  }
}
