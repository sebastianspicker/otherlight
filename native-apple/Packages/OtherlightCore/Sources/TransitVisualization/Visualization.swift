// Maps core simulation outputs to scene, plot, and accessible presentation snapshots.
import Foundation
import TransitCore

/// Adapts one simulation step into the scene data needed by renderers.
public struct SceneSnapshot: Codable, Sendable, Hashable {
  public let timeSeconds: Double
  public let skyPoints: [SkyPoint]
  public let flux: Double
  /// Creates the scene snapshot while retaining only the renderer-relevant fields.
  public init(step: EducationStep) {
    timeSeconds = step.timeSeconds
    skyPoints = step.skyPoints
    flux = step.flux
  }
}
/// Represents one time-flux sample in a light-curve plot.
public struct PlotPoint: Codable, Sendable, Hashable {
  public let timeSeconds: Double
  public let flux: Double
  /// Creates a plot point from SI time and normalized flux.
  public init(timeSeconds: Double, flux: Double) {
    self.timeSeconds = timeSeconds
    self.flux = flux
  }
}
/// Collects light-curve points derived from a sequence of simulation steps.
public struct PlotSnapshot: Codable, Sendable, Hashable {
  public let points: [PlotPoint]
  /// Converts steps into the compact data series needed by plot renderers.
  public init(steps: [EducationStep]) {
    points = steps.map { .init(timeSeconds: $0.timeSeconds, flux: $0.flux) }
  }
}
/// Collects observed-minus-calculated timing signals for an O-C visualization.
public struct OCSnapshot: Codable, Sendable, Hashable {
  public let timings: [TransitTimingSignal]
  /// Extracts timing signals from steps without recomputing the simulation.
  public init(steps: [EducationStep]) { timings = steps.map(\.timing) }
}
/// Produces concise text alternatives for scene, plot, and O-C snapshots.
public enum AccessibleSummary {
  /// Summarizes visible bodies and flux so a scene remains understandable without graphics.
  public static func scene(_ snapshot: SceneSnapshot) -> String {
    let bodies = snapshot.skyPoints.map(\.body).joined(separator: ", ")
    return
      "Time \(snapshot.timeSeconds) seconds. Bodies: \(bodies). Flux \(String(format: "%.6f", snapshot.flux))."
  }
  /// Summarizes the number of light-curve samples for assistive technologies.
  public static func plot(_ snapshot: PlotSnapshot) -> String {
    "Light curve with \(snapshot.points.count) samples."
  }
  /// Summarizes the number of timing samples for assistive technologies.
  public static func oc(_ snapshot: OCSnapshot) -> String {
    "O-C series with \(snapshot.timings.count) timing samples."
  }
}
