// Publishes macOS workspace commands through the focused-value responder chain.
#if os(macOS)
  import SwiftUI

  /// Groups focused workspace commands so menus invoke the active session only.
  struct WorkspaceActions {
    let openWorkspace: () -> Void
    let saveWorkspace: () -> Void
    let recalculate: () -> Void
    let toggleRunning: () -> Void
    let jumpToTransit: () -> Void
    let resetSimulation: () -> Void
  }

  /// Keys workspace actions in SwiftUI's focused-value responder chain.
  private struct WorkspaceActionsKey: FocusedValueKey {
    typealias Value = WorkspaceActions
  }

  /// Adds the focused workspace command bundle used by app commands.
  extension FocusedValues {
    /// Reads or updates the command target for the currently focused workspace.
    var workspaceActions: WorkspaceActions? {
      get { self[WorkspaceActionsKey.self] }
      set { self[WorkspaceActionsKey.self] = newValue }
    }
  }
#endif
