// Selects the desktop, regular-width iPad, or compact tab workspace shell.
import SwiftUI

/// Chooses the platform-appropriate workspace navigation shell for one session.
struct OtherlightWorkspaceShell: View {
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
                Button("Apply") { session.applyDraft() }
                  .accessibilityIdentifier("parameter-apply")
              }
              ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
              }
            }
        }
      }
    }
  }
#endif
