// Measures repeated core simulation snapshots against the educational responsiveness target.
import Foundation
import TransitCore
import TransitEducation

/// Measures the core step cost against the teaching experience's responsiveness target.
private enum OtherlightBenchmark {
  static let warmupCount = 5
  static let sampleCount = 20
  static let targetMilliseconds = 50.0

  /// Warms the simulation, samples it repeatedly, and prints stable latency percentiles.
  static func run() throws {
    let scenario = ScenarioCatalog.default
    let transitCenter = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4

    for _ in 0..<warmupCount {
      _ = try sampleStep(for: scenario, at: transitCenter)
    }

    var samples: [Double] = []
    samples.reserveCapacity(sampleCount)
    for _ in 0..<sampleCount {
      let clock = ContinuousClock()
      let start = clock.now
      _ = try sampleStep(for: scenario, at: transitCenter)
      samples.append(milliseconds(start.duration(to: clock.now)))
    }

    samples.sort()
    let median = percentile(samples, fraction: 0.5)
    let p95 = percentile(samples, fraction: 0.95)
    print(
      "OtherlightBenchmark warmups=\(warmupCount) samples=\(sampleCount) "
        + "median_ms=\(String(format: "%.3f", median)) "
        + "p95_ms=\(String(format: "%.3f", p95)) "
        + "target_ms=\(String(format: "%.0f", targetMilliseconds))")
  }

  /// Creates an isolated engine so each benchmark sample includes normal setup cost.
  private static func sampleStep(for scenario: EducationScenarioV4, at timeSeconds: Double) throws
    -> EducationStep
  {
    var engine = try SimulationEngine(scenario: scenario)
    return try engine.step(at: timeSeconds)
  }

  /// Interpolates a percentile from already sorted latency samples.
  private static func percentile(_ sortedValues: [Double], fraction: Double) -> Double {
    let position = Double(sortedValues.count - 1) * fraction
    let lowerIndex = Int(position.rounded(.down))
    let upperIndex = Int(position.rounded(.up))
    let proportion = position - Double(lowerIndex)
    return sortedValues[lowerIndex]
      + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * proportion
  }

  /// Converts `Duration` components to milliseconds for the human-readable benchmark output.
  private static func milliseconds(_ duration: Duration) -> Double {
    let components = duration.components
    return (Double(components.seconds) + Double(components.attoseconds) / 1e18) * 1_000
  }
}

do {
  try OtherlightBenchmark.run()
} catch {
  fputs("OtherlightBenchmark failed: \(error.localizedDescription)\n", stderr)
  exit(EXIT_FAILURE)
}
