// Declares the shared Apple app scene and macOS-specific command surface.
import SwiftUI
import TransitCore
import TransitEducation
import TransitVisualization

/// Declares one native scene for macOS, iPhone, and iPad.
@main
struct OtherlightApp: App {
  #if os(macOS)
    @FocusedValue(\.workspaceActions) private var workspaceActions
  #endif

  /// Builds the shared workspace and adds desktop-only window and command behavior on macOS.
  var body: some Scene {
    WindowGroup("Otherlight") {
      OtherlightWorkspace()
        .tint(OtherlightBrand.accent)
    }
    #if os(macOS)
      .defaultSize(width: 1_280, height: 760)
      .windowResizability(.contentMinSize)
      .commands {
        CommandGroup(replacing: .newItem) {}
        CommandMenu("Workspace") {
          Button("Open Workspace…") { workspaceActions?.openWorkspace() }
          .keyboardShortcut("o", modifiers: [.command])
          Button("Save Workspace…") { workspaceActions?.saveWorkspace() }
          .keyboardShortcut("s", modifiers: [.command])
        }
        CommandMenu("Simulation") {
          Button("Start or Pause") { workspaceActions?.toggleRunning() }.keyboardShortcut(
            "p", modifiers: [.command])
          Button("Jump to Transit") { workspaceActions?.jumpToTransit() }.keyboardShortcut(
            "t", modifiers: [.command])
          Button("Reset Simulation") { workspaceActions?.resetSimulation() }.keyboardShortcut(
            "0", modifiers: [.command])
          Button("Recalculate") { workspaceActions?.recalculate() }
          .keyboardShortcut("r", modifiers: [.command])
        }
      }
    #endif
  }
}

/// Keeps the native shell's Instrumental Nocturne accent independent of system appearance.
private enum OtherlightBrand {
  static let accent = Color(red: 8.0 / 255.0, green: 127.0 / 255.0, blue: 115.0 / 255.0)
}
