// Finds the frontmost standard app window so release capture includes no desktop content.

import CoreGraphics
import Foundation

/// Returns the largest visible layer-zero window owned by the requested process.
func visibleWindowID(for processID: pid_t) -> CGWindowID? {
  guard
    let windows = CGWindowListCopyWindowInfo(
      [.optionOnScreenOnly, .excludeDesktopElements],
      kCGNullWindowID) as? [[String: Any]]
  else { return nil }

  return
    windows
    .filter { ($0[kCGWindowOwnerPID as String] as? Int32) == processID }
    .filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
    .compactMap { window -> (CGWindowID, CGFloat)? in
      guard
        let identifier = window[kCGWindowNumber as String] as? CGWindowID,
        let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
        let width = bounds["Width"],
        let height = bounds["Height"]
      else { return nil }
      return (identifier, width * height)
    }
    .max(by: { $0.1 < $1.1 })?.0
}

guard CommandLine.arguments.count == 2, let processID = pid_t(CommandLine.arguments[1]) else {
  FileHandle.standardError.write(Data("usage: find-macos-window-id.swift <pid>\n".utf8))
  exit(64)
}

guard let windowID = visibleWindowID(for: processID) else { exit(1) }
print(windowID)
