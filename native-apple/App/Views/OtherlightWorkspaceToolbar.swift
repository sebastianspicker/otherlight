// Provides shared simulation, persistence, and export actions for workspace toolbars.
import SwiftUI
import UniformTypeIdentifiers

/// Supplies the primary workspace actions for desktop and mobile toolbars.
struct OtherlightWorkspaceToolbar: ToolbarContent {
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
