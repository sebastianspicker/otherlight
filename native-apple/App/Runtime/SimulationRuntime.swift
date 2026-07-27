// Serializes calculation requests and returns generation-tagged presentation snapshots.
import Foundation
import TransitCore
import TransitEducation
import TransitVisualization

/// Complete scenario requests coalesce while one core calculation is in flight.
/// Responses carry their request generation, so `EducationSession` can discard stale work.
actor SimulationRuntime {
  /// Couples an outcome with whether producing it required a new reusable series.
  private struct Computation: Sendable {
    let outcome: CalculationOutcome
    let builtSeries: Bool
  }

  private var pending: CalculationRequest?
  private var isCalculating = false
  private var isPaused = false
  private var latestActivityRevision = 0
  private var latestSubmittedGeneration = Int.min
  private var cachedSeries: SeriesSnapshot?
  private var runtimeMetrics = SimulationRuntimeMetrics()

  /// Enqueues only a newer request so rendering work coalesces behind the latest generation.
  func submit(
    _ request: CalculationRequest,
    deliver: @escaping @Sendable @MainActor (CalculationOutcome) -> Void
  ) {
    runtimeMetrics.submittedRequests += 1
    guard request.generation > latestSubmittedGeneration else { return }
    latestSubmittedGeneration = request.generation
    guard !isPaused else { return }
    if isCalculating || pending != nil { runtimeMetrics.coalescedRequests += 1 }
    pending = request
    startIfNeeded(deliver: deliver)
  }

  /// Applies monotonic activity revisions so late lifecycle updates cannot resume stale work.
  func setPaused(_ paused: Bool, activityRevision: Int) {
    guard activityRevision >= latestActivityRevision else { return }
    latestActivityRevision = activityRevision
    isPaused = paused
    if paused { pending = nil }
  }

  /// Returns a snapshot of queue and cache counters for diagnostics and tests.
  func metrics() -> SimulationRuntimeMetrics { runtimeMetrics }

  /// Begins one drain task only when queued work can safely be calculated.
  private func startIfNeeded(
    deliver: @escaping @Sendable @MainActor (CalculationOutcome) -> Void
  ) {
    guard !isCalculating, !isPaused, pending != nil else { return }
    isCalculating = true
    Task { await drain(deliver: deliver) }
  }

  /// Drains the latest pending request, allowing arrivals to replace obsolete queued work.
  private func drain(
    deliver: @escaping @Sendable @MainActor (CalculationOutcome) -> Void
  ) async {
    while !isPaused, let request = pending {
      pending = nil
      let reusableSeries = cachedSeries
      let computation = await Task.detached(priority: .userInitiated) {
        Self.calculate(request, reusableSeries: reusableSeries)
      }.value

      runtimeMetrics.completedFrames += 1
      if computation.builtSeries, case .success(let frame) = computation.outcome {
        cachedSeries = frame.series
        runtimeMetrics.seriesBuilds += 1
      }
      if isPaused { break }
      await deliver(computation.outcome)
    }
    isCalculating = false
    if !isPaused { startIfNeeded(deliver: deliver) }
  }

  /// Calculates a frame off the actor while reusing only an exactly matching series key.
  private static func calculate(
    _ request: CalculationRequest, reusableSeries: SeriesSnapshot?
  ) -> Computation {
    let key = request.seriesKey
    let builtSeries = reusableSeries?.key != key
    do {
      guard key.samples >= 16 else { throw SimulationError.insufficientSamples }
      let scenario = key.scenario
      var engine = try SimulationEngine(scenario: scenario)
      let series: SeriesSnapshot
      if let reusableSeries, reusableSeries.key == key {
        series = reusableSeries
      } else {
        let span = scenario.planet.orbit.periodSeconds * 0.18
        let times = (0..<key.samples).map { index in
          key.centerSeconds + (-0.5 + Double(index) / Double(key.samples - 1)) * span
        }
        let plot = PlotSnapshot(steps: try engine.sample(times: times))
        let ocTimes = (-4...4).map { epoch in
          key.centerSeconds + Double(epoch) * scenario.planet.orbit.periodSeconds
        }
        let timingDiagnosticSteps = try engine.sample(times: ocTimes)
        let oc = OCSnapshot(steps: timingDiagnosticSteps)
        series = SeriesSnapshot(
          key: key, plot: plot, oc: oc, timingDiagnosticSteps: timingDiagnosticSteps,
          lightCurveDomain: LightCurveDomain(plot: plot))
      }

      let currentStep = try engine.step(at: request.timeSeconds)
      let frame = PresentationFrame(
        generation: request.generation,
        series: series,
        scene: SceneSnapshot(step: currentStep),
        currentStep: currentStep,
        starRadiusMetres: scenario.star.radiusMetres,
        planetRadiusMetres: scenario.planet.radiusMetres,
        moonRadiusMetres: scenario.moon?.radiusMetres
      )
      return Computation(outcome: .success(frame), builtSeries: builtSeries)
    } catch {
      return Computation(
        outcome: .failure(
          generation: request.generation, seriesKey: request.seriesKey,
          message: error.localizedDescription),
        builtSeries: builtSeries)
    }
  }
}

/// Describes deterministic request validation failures before simulation work begins.
enum SimulationError: LocalizedError, Sendable {
  case insufficientSamples
  /// Supplies the recovery message surfaced through a generation-tagged failure outcome.
  var errorDescription: String? { "At least 16 samples are required to draw the light curve." }
}
