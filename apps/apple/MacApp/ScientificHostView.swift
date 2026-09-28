// Presents local Education authoring beside the session-only Scientific V5 execution and export surface.
import SwiftUI
import TransitCore
import TransitEducation
import UniformTypeIdentifiers

/// Separates portable Education editing from the explicit macOS-only scientific execution profile.
struct OtherlightMacHostView: View {
  /// Names the two intentionally separate local workflows in the Mac sidebar.
  private enum Profile: String, CaseIterable, Identifiable {
    case education
    case scientific
    var id: Self { self }
    var title: String { rawValue.capitalized }
    var symbol: String { self == .education ? "graduationcap" : "waveform.path.ecg" }
  }

  @Environment(\.scenePhase) private var scenePhase
  @State private var profile = Profile.education
  @State private var session = EducationSession()
  @State private var scientificRun = ScientificRunExecuting()

  /// Keeps the accepted V4 session owner in memory and gives each profile an explicit native surface.
  var body: some View {
    NavigationSplitView {
      List(Profile.allCases, selection: $profile) { item in
        Label(item.title, systemImage: item.symbol).tag(item)
      }
      .listStyle(.sidebar)
      .navigationSplitViewColumnWidth(min: 170, ideal: 190)
    } detail: {
      switch profile {
      case .education:
        EducationProfileView(session: session)
      case .scientific:
        ScientificProfileView(scenario: session.scenario, scientificRun: scientificRun)
      }
    }
    .onAppear {
      session.setSceneActive(scenePhase == .active)
      session.start()
    }
    .onChange(of: scenePhase) { _, phase in
      session.setSceneActive(phase == .active)
      if phase != .active { scientificRun.cancel() }
    }
    .tint(PlateFigure.pencil)
  }
}

/// Reuses native Education views while keeping their accepted V4 authoring state in the host session.
private struct EducationProfileView: View {
  let session: EducationSession

  var body: some View {
    HSplitView {
      Group {
        if session.isDetachedBinaryLab {
          DetachedBinaryLabView(session: session)
        } else {
          SimulationDashboard(session: session)
        }
      }
      .frame(minWidth: 680)
      ParameterInspector(session: session)
        .frame(minWidth: 280, idealWidth: 320, maxWidth: 380)
    }
    .navigationTitle("Education")
  }
}

/// Presents run state and separate explicit user-selected Arrow and manifest exports.
private struct ScientificProfileView: View {
  let scenario: EducationScenarioV4
  let scientificRun: ScientificRunExecuting
  @State private var showsArrowExporter = false
  @State private var showsManifestExporter = false
  @State private var arrowExportDocument: ScientificExportDocument?
  @State private var manifestExportDocument: ScientificExportDocument?
  @State private var exportError: String?

  var body: some View {
    @Bindable var scientificRun = scientificRun
    VStack(alignment: .leading, spacing: 24) {
      RunningHead(kind: .scientific)
      ScreenTitle(
        kicker: "V5 native execution boundary", title: "Scientific workspace",
        subtitle:
          "Session-only native DOP853 and Arrow execution. No network, cache, workspace persistence, or Education fallback is used."
      )
      EvidenceSection(title: "Accepted Education authoring", key: "input") {
        LabeledContent("Scenario", value: scenario.identifier)
        LabeledContent(
          "Bodies",
          value: scenario.mode == .detachedBinaryLab
            ? "star and companion"
            : scenario.moon == nil ? "star and planet" : "star, planet, and moon")
        LabeledContent("Output", value: "radial velocity only")
      }
      EvidenceSection(title: "Native run", key: "radial velocity only") {
        VStack(alignment: .leading, spacing: 10) {
          runStatus
          HStack {
            Button("Run Scientific V5") {
              scientificRun.start(scenario: scenario)
            }
            .buttonStyle(InkButtonStyle())
            .disabled(scientificRun.state == .running)
            Button("Cancel") { scientificRun.cancel() }
              .disabled(scientificRun.state != .running)
          }
          if let publication = scientificRun.publication {
            Divider()
            LabeledContent("Arrow SHA-256", value: publication.result.arrowArtifactId)
              .font(.plateReadout)
              .textSelection(.enabled)
            LabeledContent("Samples", value: "\(publication.result.runManifest.artifact.rowCount)")
            LabeledContent("Run ID", value: publication.result.runManifest.runId)
              .font(.plateReadout)
              .textSelection(.enabled)
            HStack {
              Button("Export Arrow…") { prepareArrowExport() }
              Button("Export Manifest…") { prepareManifestExport() }
            }
          }
        }
      }
      Spacer()
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .paperGround()
    .navigationTitle("Scientific")
    .fileExporter(
      isPresented: $showsArrowExporter,
      document: arrowExportDocument, contentType: .data,
      defaultFilename: "otherlight-radial-velocity.arrow"
    ) { result in
      arrowExportDocument = nil
      if case .failure(let error) = result { exportError = error.localizedDescription }
    }
    .fileExporter(
      isPresented: $showsManifestExporter,
      document: manifestExportDocument, contentType: .json,
      defaultFilename: "otherlight-science-run-manifest.json"
    ) { result in
      manifestExportDocument = nil
      if case .failure(let error) = result { exportError = error.localizedDescription }
    }
    .alert(
      "Export failed",
      isPresented: Binding(get: { exportError != nil }, set: { if !$0 { exportError = nil } })
    ) {
      Button("OK") { exportError = nil }
    } message: {
      Text(exportError ?? "The selected file was not written.")
    }
  }

  @ViewBuilder
  private var runStatus: some View {
    switch scientificRun.state {
    case .idle: Label("Ready to compile the accepted Education state.", systemImage: "circle")
    case .running: Label("Running one cancellable native job…", systemImage: "progress.indicator")
    case .published:
      Label(
        "Published in memory after request, Arrow, manifest, and SHA agreement.",
        systemImage: "checkmark.seal")
    case .cancelled: Label("Run cancelled. No result was published.", systemImage: "xmark.circle")
    case .failed(let message): Label(message, systemImage: "exclamationmark.triangle")
    }
  }

  /// Snapshots already validated Arrow bytes before presenting a user-selected destination.
  private func prepareArrowExport() {
    guard let publication = scientificRun.publication else {
      exportError = "No validated scientific run is available to export."
      return
    }
    arrowExportDocument = ScientificExportDocument(data: publication.arrowIPCFile)
    showsArrowExporter = true
  }

  /// Encodes and snapshots the manifest before presenting a user-selected destination.
  private func prepareManifestExport() {
    guard let publication = scientificRun.publication else {
      exportError = "No validated scientific run is available to export."
      return
    }
    do {
      manifestExportDocument = ScientificExportDocument(data: try publication.manifestData())
      showsManifestExporter = true
    } catch {
      exportError = error.localizedDescription
    }
  }
}

/// Holds bytes for a single user-selected export without writing any implicit cache or workspace file.
private struct ScientificExportDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.data, .json] }
  let data: Data

  /// Captures immutable validated bytes before the save panel is presented.
  init(data: Data) { self.data = data }
  /// Reads an explicitly selected file when SwiftUI reconstructs the document.
  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }
  /// Supplies the captured bytes to the explicitly selected export destination.
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    .init(regularFileWithContents: data)
  }
}
