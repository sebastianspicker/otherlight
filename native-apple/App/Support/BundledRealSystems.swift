// Loads bundled real-system catalog data and adapts entries to native education scenarios.
import Foundation
import TransitCore

/// Loads the optional bundled catalog without making session startup depend on it.
enum BundledRealSystems {
  /// Lists selectable catalog entries while treating an unavailable bundle as empty.
  static var labels: [(String, String)] {
    snapshot?.systems.map { ($0.id, $0.label) } ?? []
  }

  /// Imports one selected bundled entry or reports why it cannot be used.
  static func scenario(id: String) throws -> EducationScenarioV4 {
    guard let snapshot else { throw BundledSystemError.unavailable }
    guard let system = snapshot.systems.first(where: { $0.id == id }) else {
      throw BundledSystemError.missing(id)
    }
    return try RealSystemSnapshotImport.scenario(from: system)
  }

  /// Lazily decodes the bundled snapshot once so catalog failures remain recoverable.
  private static let snapshot: RealSystemSnapshotDTO? = {
    guard
      let url = Bundle.main.url(forResource: "real-systems.snapshot", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(RealSystemSnapshotDTO.self, from: data)
  }()
}

/// Distinguishes an unreadable catalog resource from an unknown selected identifier.
enum BundledSystemError: LocalizedError {
  case unavailable
  case missing(String)
  /// Supplies user-facing recovery text without exposing bundle implementation details.
  var errorDescription: String? {
    switch self {
    case .unavailable: "The bundled real-system snapshot could not be loaded."
    case .missing: "The selected bundled system is unavailable."
    }
  }
}
