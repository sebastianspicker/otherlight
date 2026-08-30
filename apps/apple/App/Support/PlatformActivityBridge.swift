// Bridges platform activity signals into the shared SwiftUI session lifecycle.
import SwiftUI

#if os(macOS)
  import AppKit

  /// SwiftUI owns the session; this bridge reports the AppKit-only window occlusion state.
  @MainActor
  struct PlatformActivityBridge: NSViewRepresentable {
    let onChange: @MainActor @Sendable (Bool) -> Void

    /// Creates the coordinator that owns the AppKit notification observer.
    func makeCoordinator() -> Coordinator { Coordinator(onChange: onChange) }

    /// Installs an AppKit view that reports window attachment changes to the coordinator.
    func makeNSView(context: Context) -> OcclusionView {
      let view = OcclusionView()
      view.onWindowChange = { [weak coordinator = context.coordinator] window in
        coordinator?.observe(window)
      }
      return view
    }

    /// Leaves the bridge unchanged because observation is managed by window attachment.
    func updateNSView(_ nsView: OcclusionView, context: Context) {}

    /// Owns the single window observer so changing windows cannot retain stale notifications.
    final class Coordinator {
      let onChange: @MainActor @Sendable (Bool) -> Void
      private var observer: NSObjectProtocol?

      /// Stores the main-actor callback used to synchronize session occlusion state.
      init(onChange: @escaping @MainActor @Sendable (Bool) -> Void) { self.onChange = onChange }

      /// Replaces the observer for a newly attached window and immediately reports its state.
      func observe(_ window: NSWindow?) {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        guard let window else { return }
        report(window)
        observer = NotificationCenter.default.addObserver(
          forName: NSWindow.didChangeOcclusionStateNotification, object: window, queue: .main
        ) { [weak window, onChange] _ in
          guard let window else { return }
          Task { @MainActor in
            onChange(!window.occlusionState.contains(.visible))
          }
        }
      }

      /// Delivers the current AppKit occlusion state on the main actor.
      private func report(_ window: NSWindow) {
        Task { @MainActor [onChange] in
          onChange(!window.occlusionState.contains(.visible))
        }
      }

      /// Removes the AppKit observer so coordinator teardown cannot leave a dangling callback.
      deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    }
  }

  /// Notifies the representable when AppKit attaches or detaches the hosting window.
  final class OcclusionView: NSView {
    var onWindowChange: ((NSWindow?) -> Void)?
    /// Reports every window attachment transition so occlusion observation stays current.
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      onWindowChange?(window)
    }
  }
#else
  /// iOS relies on scenePhase, so no extra platform activity observer is required.
  @MainActor
  struct PlatformActivityBridge: View {
    let onChange: @MainActor @Sendable (Bool) -> Void

    /// Supplies an inert view while preserving one cross-platform call site.
    var body: some View { EmptyView() }
  }
#endif
