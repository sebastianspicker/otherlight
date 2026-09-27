// Runs reproducible Education workloads and reports informational latency and resident-memory data.
import Darwin.Mach
import Foundation
import TransitCore
import TransitEducation

/// Measures fixed interactive, reference, and retained-series workloads without performance gates.
private enum OtherlightBenchmark {
  static let workloadVersion = "education-v1"
  static let seed: UInt64 = 0
  static let warmupCount = 5
  static let repeatCount = 20
  static let seriesSampleCount = 64

  /// Keeps each benchmark output alive until its work and retention assertions have been checked.
  private struct WorkloadOutput {
    let steps: [EducationStep]
    let checksum: Double
  }

  /// Describes one deterministic workload and the exact work it must retain.
  private struct Workload {
    let name: String
    let expectedStepCount: Int
    let execute: () throws -> WorkloadOutput
  }

  /// Runs every fixed workload after warm-up and reports latency distributions and resident memory.
  static func run() throws {
    let scenario = ScenarioCatalog.default
    let transitCenter = scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
    let workloads = [
      Workload(name: "interactive", expectedStepCount: 1) {
        var engine = try SimulationEngine(scenario: scenario)
        let step = try engine.step(at: transitCenter)
        return .init(steps: [step], checksum: step.flux)
      },
      Workload(name: "reference", expectedStepCount: 1) {
        var engine = try ReferenceSimulationEngine(
          scenario: scenario,
          configuration: .init(mode: .reference, referenceSubsteps: 5))
        let step = try engine.step(at: transitCenter)
        return .init(steps: [step], checksum: step.flux)
      },
      Workload(name: "series", expectedStepCount: seriesSampleCount) {
        var engine = try SimulationEngine(scenario: scenario)
        let span = scenario.planet.orbit.periodSeconds * 0.18
        let lastIndex = Double(seriesSampleCount - 1)
        let times = (0..<seriesSampleCount).map { index -> Double in
          let fraction = Double(index) / lastIndex
          return transitCenter + (-0.5 + fraction) * span
        }
        let steps = try engine.sample(times: times)
        return .init(
          steps: steps,
          checksum: steps.reduce(0) { $0 + $1.flux })
      },
    ]

    print(
      "OtherlightBenchmark workload_version=\(workloadVersion) seed=\(seed) "
        + "warmups=\(warmupCount) repeats=\(repeatCount) series_samples=\(seriesSampleCount)")
    for workload in workloads {
      try warm(workload)
      let memory = try measureResidentMemory(workload)
      let latencies = try measureLatencies(workload)
      printDistribution(workload.name, latencies: latencies)
      print(
        "OtherlightBenchmark memory workload=\(workload.name) "
          + "resident_before_bytes=\(memory.before) resident_after_bytes=\(memory.after) "
          + "resident_delta_bytes=\(memory.after - memory.before)")
    }
  }

  /// Stabilizes generated code and allocation paths before collecting informational timings.
  private static func warm(_ workload: Workload) throws {
    for _ in 0..<warmupCount { try assertRequiredWork(workload.execute(), workload: workload) }
  }

  /// Measures each complete workload separately and retains its result through the assertion.
  private static func measureLatencies(_ workload: Workload) throws -> [Double] {
    try (0..<repeatCount).map { _ in
      let clock = ContinuousClock()
      let start = clock.now
      try assertRequiredWork(workload.execute(), workload: workload)
      return milliseconds(start.duration(to: clock.now))
    }
  }

  /// Takes a resident-memory snapshot around one asserted workload outside the latency samples.
  private static func measureResidentMemory(
    _ workload: Workload
  ) throws -> (before: UInt64, after: UInt64) {
    let before = residentMemoryBytes()
    let output = try workload.execute()
    try assertRequiredWork(output, workload: workload)
    let after = withExtendedLifetime(output) { residentMemoryBytes() }
    return (before, after)
  }

  /// Ensures timing only describes completed, retained workload outputs instead of eliminated work.
  private static func assertRequiredWork(_ output: WorkloadOutput, workload: Workload) throws {
    let retainedChecksum = output.steps.reduce(0) { $0 + $1.flux }
    guard output.steps.count == workload.expectedStepCount,
      output.checksum.isFinite,
      output.checksum == retainedChecksum
    else {
      throw BenchmarkError.requiredWorkWasNotRetained
    }
    withExtendedLifetime(output) {}
  }

  /// Prints an interpolated distribution so machine and human comparisons retain tail latency.
  private static func printDistribution(_ workload: String, latencies: [Double]) {
    let sorted = latencies.sorted()
    print(
      "OtherlightBenchmark latency workload=\(workload) count=\(sorted.count) "
        + "min_ms=\(formatted(sorted.first ?? 0)) "
        + "median_ms=\(formatted(percentile(sorted, fraction: 0.5))) "
        + "p95_ms=\(formatted(percentile(sorted, fraction: 0.95))) "
        + "max_ms=\(formatted(sorted.last ?? 0))")
  }

  /// Reads the current process resident size without folding it into the timing measurement.
  private static func residentMemoryBytes() -> UInt64 {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let status = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    return status == KERN_SUCCESS ? UInt64(info.resident_size) : 0
  }

  /// Interpolates a percentile from an already sorted nonempty latency collection.
  private static func percentile(_ sortedValues: [Double], fraction: Double) -> Double {
    guard !sortedValues.isEmpty else { return 0 }
    let position = Double(sortedValues.count - 1) * fraction
    let lowerIndex = Int(position.rounded(.down))
    let upperIndex = Int(position.rounded(.up))
    let proportion = position - Double(lowerIndex)
    return sortedValues[lowerIndex]
      + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * proportion
  }

  /// Converts monotonic duration components to milliseconds for output.
  private static func milliseconds(_ duration: Duration) -> Double {
    let components = duration.components
    return (Double(components.seconds) + Double(components.attoseconds) / 1e18) * 1_000
  }

  /// Formats values consistently for line-oriented benchmark comparison.
  private static func formatted(_ value: Double) -> String { String(format: "%.3f", value) }
}

/// Represents an invalid benchmark workload whose required output was optimized away or lost.
private enum BenchmarkError: LocalizedError {
  case requiredWorkWasNotRetained

  var errorDescription: String? { "benchmark workload did not retain a finite result" }
}

do {
  try OtherlightBenchmark.run()
} catch {
  fputs("OtherlightBenchmark failed: \(error.localizedDescription)\n", stderr)
  exit(EXIT_FAILURE)
}
