// Declares the session-only macOS host for portable Education and native Scientific V5 work.
import SwiftUI

/// Hosts the two intentionally distinct local profiles without adding workspace or network persistence.
@main
struct OtherlightMacApp: App {
  var body: some Scene {
    WindowGroup("OtherlightMac") {
      OtherlightMacHostView()
    }
    .defaultSize(width: 1_280, height: 800)
    .windowResizability(.contentMinSize)
  }
}
