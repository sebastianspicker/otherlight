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

/// Selects the desktop, regular-width iPad, or compact tab workspace shell.
private struct OtherlightWorkspaceShell: View {
  let session: EducationSession
  @Binding var selection: WorkspaceSection?
  @Binding var showsInspector: Bool
  let openWorkspace: () -> Void
  let saveWorkspace: () -> Void

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var presentedSheet: WorkspaceSheet?
  #endif

  /// Builds the shell appropriate for the active platform and available horizontal space.
  var body: some View {
    #if os(macOS)
      desktopWorkspace
    #else
      if horizontalSizeClass == .compact {
        compactWorkspace
      } else {
        regularIPadWorkspace
      }
    #endif
  }

  #if os(macOS)
    /// Preserves the desktop sidebar, inspector, toolbar, and occlusion tracking behavior.
    private var desktopWorkspace: some View {
      NavigationSplitView {
        List(WorkspaceSection.allCases, selection: $selection) { section in
          Label(section.title, systemImage: section.systemImage)
            .tag(section)
        }
        .navigationSplitViewColumnWidth(min: 180, ideal: 210)
      } detail: {
        Group {
          switch selection ?? .simulation {
          case .simulation:
            SimulationDashboard(session: session)
          case .guidedLabs:
            GuidedLabsView(session: session)
          }
        }
        .background(PlatformActivityBridge { session.setOccluded($0) }.frame(width: 0, height: 0))
      }
      .inspector(isPresented: $showsInspector) {
        ParameterInspector(session: session)
      }
      .toolbar {
        OtherlightWorkspaceToolbar(
          session: session,
          showsInspector: $showsInspector,
          openWorkspace: openWorkspace,
          saveWorkspace: saveWorkspace,
          showParameters: { showsInspector.toggle() })
      }
      .frame(minWidth: 960, minHeight: 640)
    }
  #endif

  #if os(iOS)
    /// Presents sidebar-and-detail navigation on regular-width iPad layouts.
    private var regularIPadWorkspace: some View {
      NavigationSplitView {
        List(WorkspaceSection.allCases, selection: $selection) { section in
          Label(section.title, systemImage: section.systemImage)
            .tag(section)
        }
        .navigationTitle("Otherlight")
        .navigationSplitViewColumnWidth(min: 180, ideal: 220)
      } detail: {
        workspaceDetail(for: selection ?? .simulation)
          .toolbar {
            OtherlightWorkspaceToolbar(
              session: session,
              showsInspector: $showsInspector,
              openWorkspace: openWorkspace,
              saveWorkspace: saveWorkspace,
              showParameters: { presentedSheet = .parameters })
          }
      }
      .sheet(item: $presentedSheet) { sheet in
        WorkspaceSheetView(sheet: sheet, session: session)
      }
    }

    /// Presents independent navigation stacks in the compact Simulation and Guided Labs tabs.
    private var compactWorkspace: some View {
      TabView(
        selection: Binding(
          get: { selection ?? .simulation },
          set: { selection = $0 })
      ) {
        NavigationStack {
          workspaceDetail(for: .simulation)
            .navigationTitle(WorkspaceSection.simulation.title)
            .toolbar {
              OtherlightWorkspaceToolbar(
                session: session,
                showsInspector: $showsInspector,
                openWorkspace: openWorkspace,
                saveWorkspace: saveWorkspace,
                showParameters: { presentedSheet = .parameters })
            }
        }
        .tag(WorkspaceSection.simulation)
        .tabItem {
          Label(
            WorkspaceSection.simulation.title, systemImage: WorkspaceSection.simulation.systemImage)
        }
        .accessibilityIdentifier("simulation-tab")

        NavigationStack {
          GuidedLabsView(session: session, navigationStyle: .compact)
            .navigationTitle(WorkspaceSection.guidedLabs.title)
            .toolbar {
              OtherlightWorkspaceToolbar(
                session: session,
                showsInspector: $showsInspector,
                openWorkspace: openWorkspace,
                saveWorkspace: saveWorkspace,
                showParameters: { presentedSheet = .parameters })
            }
        }
        .tag(WorkspaceSection.guidedLabs)
        .tabItem {
          Label(
            WorkspaceSection.guidedLabs.title, systemImage: WorkspaceSection.guidedLabs.systemImage)
        }
        .accessibilityIdentifier("guided-labs-tab")
      }
      .sheet(item: $presentedSheet) { sheet in
        WorkspaceSheetView(sheet: sheet, session: session)
      }
    }

    /// Returns the selected primary workspace content without duplicating session bindings.
    @ViewBuilder
    private func workspaceDetail(for section: WorkspaceSection) -> some View {
      switch section {
      case .simulation:
        SimulationDashboard(session: session)
      case .guidedLabs:
        GuidedLabsView(session: session, navigationStyle: .regular)
      }
    }
  #endif
}

#if os(iOS)
  /// Identifies the compact modal surface presented from the item-driven parameters control.
  private enum WorkspaceSheet: Hashable, Identifiable {
    case parameters

    /// Supplies stable identity for SwiftUI item presentation.
    var id: Self { self }
  }

  /// Renders the selected compact modal surface using the existing root-owned session.
  private struct WorkspaceSheetView: View {
    @Environment(\.dismiss) private var dismiss
    let sheet: WorkspaceSheet
    let session: EducationSession

    /// Builds the selected modal content without adding a second session owner.
    var body: some View {
      switch sheet {
      case .parameters:
        NavigationStack {
          ParameterInspector(session: session)
            .navigationTitle("Parameters")
            .toolbar {
              ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
              }
            }
        }
      }
    }
  }
#endif

/// Supplies workspace, simulation, export, and inspector commands to the window toolbar.
private struct OtherlightWorkspaceToolbar: ToolbarContent {
  let session: EducationSession
  @Binding var showsInspector: Bool
  let openWorkspace: () -> Void
  let saveWorkspace: () -> Void
  let showParameters: () -> Void

  /// Builds the primary-action toolbar content bound to the active session.
  var body: some ToolbarContent {
    ToolbarItemGroup(placement: .primaryAction) {
      #if os(macOS)
        Button("Open Workspace", systemImage: "folder") { openWorkspace() }
        Button("Save Workspace", systemImage: "square.and.arrow.down") { saveWorkspace() }
        Menu(
          session.scenarioOptions.first(where: { $0.id == session.selectedScenarioID })?.title
            ?? "Scenario"
        ) {
          ForEach(session.scenarioOptions, id: \.id) { option in
            Button(option.title) { session.selectScenario(id: option.id) }
          }
        }
        Button(
          session.isRunning ? "Pause" : "Start",
          systemImage: session.isRunning ? "pause.fill" : "play.fill"
        ) { session.toggleRunning() }
        Menu(session.playbackSpeed.title, systemImage: "gauge.with.dots.needle.50percent") {
          ForEach(PlaybackSpeed.allCases.filter { $0 != .paused }, id: \.self) { speed in
            Button {
              session.setPlaybackSpeed(speed)
            } label: {
              if speed == session.playbackSpeed {
                Label(speed.title, systemImage: "checkmark")
              } else {
                Text(speed.title)
              }
            }
          }
        }
        .help("Playback speed")
        Button("Transit", systemImage: "scope") { session.jumpToTransit() }
          .keyboardShortcut("t", modifiers: [.command])
        Button("Reset", systemImage: "arrow.counterclockwise") { session.resetSimulation() }
          .keyboardShortcut("0", modifiers: [.command])
        Button("Recalculate", systemImage: "arrow.clockwise") { session.recalculate() }
          .keyboardShortcut("r", modifiers: [.command])
        ExportToolbarControl(session: session)
        Button("Parameters", systemImage: "slider.horizontal.3") { showParameters() }
          .accessibilityIdentifier("parameters-button")
      #else
        Button(
          session.isRunning ? "Pause" : "Start",
          systemImage: session.isRunning ? "pause.fill" : "play.fill"
        ) { session.toggleRunning() }
        Button("Parameters", systemImage: "slider.horizontal.3") { showParameters() }
          .accessibilityIdentifier("parameters-button")
        WorkspaceOverflowControl(
          session: session, openWorkspace: openWorkspace, saveWorkspace: saveWorkspace)
      #endif
    }
  }
}

#if os(iOS)
  /// Keeps secondary workspace commands reachable without crowding compact navigation bars.
  private struct WorkspaceOverflowControl: View {
    let session: EducationSession
    let openWorkspace: () -> Void
    let saveWorkspace: () -> Void
    @State private var document = ExportDocument(
      frame: nil, planetRadius: 1, moonRadius: 0, moonOffset: 0)
    @State private var format: ExportFormat = .csv
    @State private var showsExporter = false
    @State private var errorMessage: String?

    /// Builds scenario, playback, persistence, and export commands in one stable menu host.
    var body: some View {
      Menu("More", systemImage: "ellipsis.circle") {
        Menu("Scenario") {
          ForEach(session.scenarioOptions, id: \.id) { option in
            Button(option.title) { session.selectScenario(id: option.id) }
          }
        }
        Menu("Playback Speed") {
          ForEach(PlaybackSpeed.allCases.filter { $0 != .paused }, id: \.self) { speed in
            Button {
              session.setPlaybackSpeed(speed)
            } label: {
              if speed == session.playbackSpeed {
                Label(speed.title, systemImage: "checkmark")
              } else {
                Text(speed.title)
              }
            }
          }
        }
        Button("Jump to Transit", systemImage: "scope") { session.jumpToTransit() }
        Button("Reset Simulation", systemImage: "arrow.counterclockwise") {
          session.resetSimulation()
        }
        Button("Recalculate", systemImage: "arrow.clockwise") { session.recalculate() }
        Divider()
        Button("Open Workspace", systemImage: "folder") { openWorkspace() }
        Button("Save Workspace", systemImage: "square.and.arrow.down") { saveWorkspace() }
        Divider()
        ForEach(ExportFormat.allCases) { nextFormat in
          Button("Export \(nextFormat.title)", systemImage: "square.and.arrow.up") {
            beginExport(format: nextFormat)
          }
          .disabled(nextFormat == .oc && session.transitEventCount == 0)
        }
      }
      .accessibilityIdentifier("workspace-more-actions")
      .modifier(
        ExportDocumentFlow(
          document: document, format: format, isPresented: $showsExporter,
          errorMessage: $errorMessage))
    }

    /// Captures accepted session data before presenting the system file exporter.
    private func beginExport(format: ExportFormat) {
      self.format = format
      document = session.exportDocument.with(format: format)
      showsExporter = true
    }
  }
#endif

/// Starts export flows and reports file-writing failures from the toolbar menu.
private struct ExportToolbarControl: View {
  let session: EducationSession
  @State private var document = ExportDocument(
    frame: nil,
    planetRadius: 1,
    moonRadius: 0,
    moonOffset: 0)
  @State private var format: ExportFormat = .csv
  @State private var showsExporter = false
  @State private var errorMessage: String?

  /// Builds the export menu and standard document exporter for the selected format.
  var body: some View {
    Menu("Export", systemImage: "square.and.arrow.up") {
      ForEach(ExportFormat.allCases) { nextFormat in
        Button(nextFormat.title) { beginExport(format: nextFormat) }
          .disabled(nextFormat == .oc && session.transitEventCount == 0)
      }
    }
    .disabled(!session.canExport)
    .modifier(
      ExportDocumentFlow(
        document: document, format: format, isPresented: $showsExporter,
        errorMessage: $errorMessage))
  }

  /// Prepares the current session export document before showing the save panel.
  private func beginExport(format: ExportFormat) {
    self.format = format
    document = session.exportDocument.with(format: format)
    showsExporter = true
  }
}

/// Shares the system export and error presentation contract across toolbar surfaces.
private struct ExportDocumentFlow: ViewModifier {
  let document: ExportDocument
  let format: ExportFormat
  @Binding var isPresented: Bool
  @Binding var errorMessage: String?

  /// Adds a format-appropriate exporter and clears errors only after dismissal.
  func body(content: Content) -> some View {
    content
      .fileExporter(
        isPresented: $isPresented,
        document: document,
        contentType: format == .markdown ? .plainText : .commaSeparatedText,
        defaultFilename: "transit-light-curve.\(format.filenameExtension)"
      ) { result in
        if case .failure(let error) = result { errorMessage = error.localizedDescription }
      }
      .alert("Export failed", isPresented: errorIsPresented) {
        Button("OK") { errorMessage = nil }
      } message: {
        Text(errorMessage ?? "The file could not be written.")
      }
  }

  /// Maps optional export failures into SwiftUI's alert presentation binding.
  private var errorIsPresented: Binding<Bool> {
    Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
  }
}

/// Presents the current simulation frame, diagnostics, and calculation-state fallback views.
private struct SimulationDashboard: View {
  let session: EducationSession

  /// Builds the scrollable dashboard from the latest valid presentation frame.
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          VStack(alignment: .leading, spacing: 3) {
            Text("Simulation").font(.title2.weight(.semibold))
            Text("Explore transit geometry, flux, and event-derived timing diagnostics.")
              .foregroundStyle(.secondary)
          }
          Spacer()
          Text(session.calculationStatus).foregroundStyle(.secondary)
        }
        if let frame = session.frame {
          SimulationPlotRow(frame: frame, session: session)
          PlotCard(title: "O-C event history (milliseconds)") {
            TransitOCChart(
              history: session.transitEventHistory, transitBody: session.selectedTransitBody)
          }
          .frame(height: 170)
          TimingHistoryControls(session: session)
          SimulationFrameSummary(
            frame: frame, transitEventCount: session.selectedTransitEventCount,
            latestResidualMilliseconds: session.selectedTransitLatestResidualMilliseconds
          )
          .equatable()
        } else if case .loading = session.displayState {
          ProgressView("Calculating the selected scenario…").frame(
            maxWidth: .infinity, minHeight: 500)
        } else if case .error(let message) = session.displayState {
          ContentUnavailableView(
            "Calculation needs attention", systemImage: "exclamationmark.triangle",
            description: Text(message)
          )
          .frame(minHeight: 500)
        } else {
          ContentUnavailableView("No simulation frame", systemImage: "waveform.path")
            .frame(minHeight: 500)
        }
      }
      .padding(20)
    }
    .accessibilityIdentifier("simulation-dashboard")
  }

}

/// Arranges the sky and light-curve cards vertically whenever a compact width would clip them.
private struct SimulationPlotRow: View {
  let frame: PresentationFrame
  let session: EducationSession

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  #endif

  /// Selects a compact-safe vertical stack or the regular horizontal plot layout.
  var body: some View {
    #if os(iOS)
      if horizontalSizeClass == .compact {
        VStack(spacing: 12) { plotCards }
      } else {
        HStack(spacing: 12) { plotCards }
      }
    #else
      HStack(spacing: 12) { plotCards }
    #endif
  }

  /// Supplies identically sized plot cards to either adaptive container.
  @ViewBuilder
  private var plotCards: some View {
    PlotCard(title: "Sky view") {
      SkyCanvas(
        scene: frame.scene,
        starRadiusMetres: frame.starRadiusMetres,
        planetRadiusMetres: frame.planetRadiusMetres,
        moonRadiusMetres: frame.moonRadiusMetres,
        zoomMultiplier: session.sceneZoom)
    }
    .frame(height: 280)
    PlotCard(title: "Normalized light curve") {
      LightCurveCanvas(
        series: frame.series,
        history: session.lightCurveHistory,
        markerTimeSeconds: frame.scene.timeSeconds,
        markerFlux: frame.scene.flux)
    }
    .frame(height: 280)
  }
}

/// Summarizes visual simulation data in text for assistive technologies.
@MainActor
private struct SimulationFrameSummary: View, Equatable {
  let frame: PresentationFrame
  let transitEventCount: Int
  let latestResidualMilliseconds: Double?

  /// Compares data that changes the accessibility summary while throttling frame churn.
  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.frame.series.key == rhs.frame.series.key
      && lhs.frame.generation / 15 == rhs.frame.generation / 15
      && lhs.transitEventCount == rhs.transitEventCount
      && lhs.latestResidualMilliseconds == rhs.latestResidualMilliseconds
  }

  /// Builds the visible caption and consolidated accessibility label.
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(AccessibleSummary.scene(frame.scene))
      Text(AccessibleSummary.plot(frame.plot))
      Text(timingSummary)
    }
    .font(.caption)
    .foregroundStyle(.secondary)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilitySummary)
  }

  /// Combines scene, light-curve, and timing values into one spoken summary.
  private var accessibilitySummary: String {
    "Sky view. \(AccessibleSummary.scene(frame.scene)) "
      + "Light-curve marker: time \(frame.scene.timeSeconds) seconds, normalized flux "
      + "\(String(format: "%.6f", frame.scene.flux)). "
      + AccessibleSummary.plot(frame.plot)
      + " \(timingSummary)"
  }

  /// Describes whether enough event history exists to calculate an O-C residual.
  private var timingSummary: String {
    guard let latestResidualMilliseconds else {
      return "\(transitEventCount) diagnostic transit events; at least two are needed for O-C."
    }
    return String(
      format: "%d diagnostic transit events; latest O-C %.3f milliseconds.",
      transitEventCount, latestResidualMilliseconds)
  }
}

/// Controls selection, inspection, and clearing of accepted light-curve and timing history.
private struct TimingHistoryControls: View {
  let session: EducationSession

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  #endif

  /// Builds compact history metrics and destructive actions with their undo controls.
  var body: some View {
    #if os(iOS)
      if horizontalSizeClass == .compact {
        compactHistoryControls
      } else {
        regularHistoryControls
      }
    #else
      regularHistoryControls
    #endif
  }

  /// Preserves the desktop grid while allowing aligned metrics on ample horizontal space.
  private var regularHistoryControls: some View {
    Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
      GridRow {
        Picker(
          "Timing body",
          selection: Binding(
            get: { session.selectedTransitBody },
            set: { session.setSelectedTransitBody($0) })
        ) {
          ForEach(TransitBody.allCases, id: \.self) { body in
            Text(body.rawValue.capitalized).tag(body)
          }
        }
        .frame(maxWidth: 240)
        Text(
          "\(session.selectedTransitEventCount) \(session.selectedTransitBody.rawValue) events · \(session.lightCurveHistory.samples.count) accepted frames"
        )
        .foregroundStyle(.secondary)
      }
      GridRow {
        Text("Latest O-C")
        Text(formatted(session.selectedTransitLatestResidualMilliseconds))
      }
      GridRow {
        Text("RMS O-C")
        Text(formatted(session.selectedTransitRMSMilliseconds))
      }
      GridRow {
        HStack {
          Button("Clear light history") { session.clearLightCurveHistory() }
          Button("Undo") { session.undoClearLightCurveHistory() }
            .accessibilityLabel("Undo light history clear")
        }
        HStack {
          Button("Clear timing history") { session.clearTransitEventHistory() }
          Button("Undo") { session.undoClearTransitEventHistory() }
            .accessibilityLabel("Undo timing history clear")
        }
      }
    }
    .font(.caption)
    .padding(12)
    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
  }

  #if os(iOS)
    /// Stacks history metrics and actions so controls remain legible in compact widths.
    private var compactHistoryControls: some View {
      VStack(alignment: .leading, spacing: 10) {
        Picker(
          "Timing body",
          selection: Binding(
            get: { session.selectedTransitBody },
            set: { session.setSelectedTransitBody($0) })
        ) {
          ForEach(TransitBody.allCases, id: \.self) { body in
            Text(body.rawValue.capitalized).tag(body)
          }
        }
        .pickerStyle(.segmented)
        Text(
          "\(session.selectedTransitEventCount) \(session.selectedTransitBody.rawValue) events · \(session.lightCurveHistory.samples.count) accepted frames"
        )
        .foregroundStyle(.secondary)
        LabeledContent(
          "Latest O-C", value: formatted(session.selectedTransitLatestResidualMilliseconds))
        LabeledContent("RMS O-C", value: formatted(session.selectedTransitRMSMilliseconds))
        VStack(alignment: .leading, spacing: 6) {
          Button("Clear light history") { session.clearLightCurveHistory() }
          Button("Undo light history clear") { session.undoClearLightCurveHistory() }
          Button("Clear timing history") { session.clearTransitEventHistory() }
          Button("Undo timing history clear") { session.undoClearTransitEventHistory() }
        }
      }
      .font(.caption)
      .padding(12)
      .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
  #endif

  /// Formats an O-C metric or explains the minimum event requirement.
  private func formatted(_ value: Double?) -> String {
    guard let value else { return "Needs at least two events" }
    return String(format: "%.3f ms", value)
  }
}

/// Wraps a plot in a consistently styled titled card.
private struct PlotCard<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  /// Builds the card chrome around its caller-supplied plot content.
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
    .padding(12)
    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
  }
}

/// Selects the navigation presentation used by the same guided-lab content.
private enum GuidedLabsNavigationStyle: Equatable {
  case regular
  case compact
}

/// Presents lessons as a desktop split view or compact list-to-detail navigation.
private struct GuidedLabsView: View {
  let session: EducationSession
  let navigationStyle: GuidedLabsNavigationStyle

  /// Selects the regular or compact navigation shell while sharing the same lesson session.
  init(session: EducationSession, navigationStyle: GuidedLabsNavigationStyle = .regular) {
    self.session = session
    self.navigationStyle = navigationStyle
  }

  /// Builds the platform-appropriate lesson navigation around shared detail content.
  var body: some View {
    #if os(iOS)
      if navigationStyle == .compact {
        compactLessonNavigation
      } else {
        regularIPadLessonNavigation
      }
    #else
      desktopLessonNavigation
    #endif
  }

  #if os(macOS)
    /// Preserves the always-visible lesson list used by the desktop workspace.
    private var desktopLessonNavigation: some View {
      HSplitView {
        List(LessonCatalog.lessons, id: \.id) { lesson in
          lessonRow(lesson, activates: true)
        }
        GuidedLabDetail(session: session)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  #endif

  #if os(iOS)
    /// Keeps lessons and their selected detail visible in a regular-width iPad split layout.
    private var regularIPadLessonNavigation: some View {
      NavigationSplitView {
        List(
          LessonCatalog.lessons,
          id: \.id,
          selection: Binding(
            get: { session.selectedLessonID },
            set: { if let id = $0 { session.selectLesson(id: id) } })
        ) { lesson in
          VStack(alignment: .leading, spacing: 3) {
            Text(lesson.title)
            Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
          }
          .tag(lesson.id)
        }
        .navigationTitle("Guided Labs")
        .navigationSplitViewColumnWidth(min: 210, ideal: 270)
      } detail: {
        GuidedLabDetail(session: session)
      }
    }

    /// Pushes an individual lesson detail from the compact Guided Labs tab.
    private var compactLessonNavigation: some View {
      List(LessonCatalog.lessons, id: \.id) { lesson in
        NavigationLink {
          GuidedLabDetail(session: session, selectedLessonID: lesson.id)
        } label: {
          VStack(alignment: .leading, spacing: 3) {
            Text(lesson.title)
            Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
          }
        }
        .accessibilityIdentifier("guided-lab-\(lesson.id)")
      }
      .accessibilityIdentifier("guided-labs-list")
    }
  #endif

  /// Builds a selectable lesson row without duplicating the list's selection styling.
  @ViewBuilder
  private func lessonRow(_ lesson: LessonDefinition, activates: Bool) -> some View {
    Button {
      if activates { session.selectLesson(id: lesson.id) }
    } label: {
      HStack {
        VStack(alignment: .leading) {
          Text(lesson.title)
          Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        if lesson.id == session.selectedLessonID {
          Image(systemName: "checkmark")
            .accessibilityLabel("Selected")
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("guided-lab-\(lesson.id)")
  }
}

/// Renders one selected lesson's prompts, evidence controls, progress, and phase actions.
private struct GuidedLabDetail: View {
  let session: EducationSession
  let selectedLessonID: String?

  /// Initializes a detail view that may activate a lesson when pushed from compact navigation.
  init(session: EducationSession, selectedLessonID: String? = nil) {
    self.session = session
    self.selectedLessonID = selectedLessonID
  }

  /// Builds the scrollable lesson workspace from root-owned session state.
  var body: some View {
    let lessons = LessonCatalog.lessons
    let report = session.currentLessonReport
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let lesson = lessons.first(where: { $0.id == session.selectedLessonID }) {
          Text(lesson.title).font(.title2.weight(.semibold))
          Text(lesson.objective).foregroundStyle(.secondary)
        }

        if let phase = session.currentGuidedPhase {
          HStack {
            Text("Phase \(session.guidedPhaseIndex + 1) of \(session.guidedPhases.count)")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
            Spacer()
            Text(phase.title).font(.headline)
          }
          ForEach(phase.prompts, id: \.id) { prompt in
            promptEditor(prompt)
          }
        }

        hintControls
        comparisonControls
        lessonProgress(report: report)
        phaseControls
        completionProgress(totalLessons: lessons.count)
      }
      .padding(24)
    }
    .onAppear {
      if let selectedLessonID { session.selectLesson(id: selectedLessonID) }
    }
    .accessibilityIdentifier("guided-lab-detail")
  }

  /// Creates one accessible response editor for the current guided phase.
  @ViewBuilder
  private func promptEditor(_ prompt: GuidedLabPrompt) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(prompt.prompt)
      TextEditor(
        text: Binding(
          get: { session.guidedResponse(for: prompt.responseKey) },
          set: { session.setGuidedResponse($0, for: prompt.responseKey) })
      )
      .frame(minHeight: 90)
      .accessibilityLabel(prompt.prompt)
      .accessibilityIdentifier("guided-response-\(prompt.id)")
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
      }
    }
  }

  /// Builds the hint depth picker and its current contextual guidance.
  private var hintControls: some View {
    GroupBox("Hint") {
      VStack(alignment: .leading, spacing: 8) {
        Picker(
          "Level",
          selection: Binding(
            get: { session.hintLevel },
            set: { session.setHintLevel($0) })
        ) {
          ForEach(HintLevel.allCases, id: \.self) { level in
            Text(level.rawValue).tag(level)
          }
        }
        .pickerStyle(.segmented)
        Text(session.guidedHintText).foregroundStyle(.secondary)
      }
    }
  }

  /// Builds the free-form comparison evidence field used by the lesson rubric.
  private var comparisonControls: some View {
    GroupBox("A/B comparison") {
      VStack(alignment: .leading, spacing: 6) {
        Text("Record one evidence-based difference between the baseline and current state.")
          .foregroundStyle(.secondary)
        TextEditor(
          text: Binding(
            get: { session.guidedComparisonObservation },
            set: { session.setGuidedComparisonObservation($0) })
        )
        .frame(minHeight: 70)
        .accessibilityLabel("A/B comparison observation")
        .accessibilityIdentifier("guided-comparison")
        .overlay {
          RoundedRectangle(cornerRadius: 6)
            .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
        }
      }
    }
  }

  /// Shows the current lesson check and response-rubric result.
  @ViewBuilder
  private func lessonProgress(report: LessonReport?) -> some View {
    if let report, let check = report.checks.first {
      Label(check.message, systemImage: check.passed ? "checkmark.circle.fill" : "circle")
        .foregroundStyle(check.passed ? .green : .secondary)
    } else {
      ProgressView("Waiting for a simulation frame")
    }

    let rubric = session.currentGuidedRubric
    VStack(alignment: .leading, spacing: 5) {
      ProgressView(value: rubric.score)
      Text(
        "Response rubric: \(rubric.earnedWeight, format: .number)/\(rubric.totalWeight, format: .number)"
      )
      .font(.footnote)
      .foregroundStyle(.secondary)
    }
  }

  /// Builds phase movement and completion actions with session-provided completion gating.
  private var phaseControls: some View {
    HStack {
      Button("Previous phase") { session.moveGuidedPhase(by: -1) }
        .disabled(session.guidedPhaseIndex == 0)
      Button("Next phase") { session.moveGuidedPhase(by: 1) }
        .disabled(
          !session.guidedPhaseReady || session.guidedPhaseIndex >= session.guidedPhases.count - 1)
      Spacer()
      Button("Complete lab") { session.completeCurrentLesson() }
        .disabled(!session.canCompleteGuidedLesson)
    }
  }

  /// Displays completed-lab count against the stable catalog size.
  private func completionProgress(totalLessons: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      ProgressView(value: Double(session.completedLessonIDs.count), total: Double(totalLessons))
      Text("\(session.completedLessonIDs.count) of \(totalLessons) labs completed")
        .font(.footnote).foregroundStyle(.secondary)
    }
  }
}
