// Defines presentation-only state shared between the workspace, plots, and export surfaces.
import Foundation
import TransitCore
import TransitVisualization

/// Names the primary workspace areas so navigation uses stable identifiers and labels.
enum WorkspaceSection: String, CaseIterable, Identifiable {
  case simulation
  case guidedLabs

  /// Uses the case itself as the stable navigation identity.
  var id: Self { self }

  /// Supplies the user-facing label for the selected workspace area.
  var title: String {
    switch self {
    case .simulation: "Simulation"
    case .guidedLabs: "Guided Labs"
    }
  }

  /// Supplies the SF Symbol associated with this workspace area.
  var systemImage: String {
    switch self {
    case .simulation: "sparkles"
    case .guidedLabs: "graduationcap"
    }
  }
}

/// Identifies a supported export representation for generated lab data.
enum ExportFormat: String, CaseIterable, Identifiable {
  case csv
  case oc
  case markdown

  /// Uses the format case as a stable picker identity.
  var id: Self { self }

  /// Supplies the user-facing label for an export choice.
  var title: String {
    switch self {
    case .csv: "Light curve CSV"
    case .oc: "O-C CSV"
    case .markdown: "Lab notes Markdown"
    }
  }

  /// Selects the extension required by the export representation.
  var filenameExtension: String {
    switch self {
    case .csv, .oc: "csv"
    case .markdown: "md"
    }
  }
}

/// Scales simulation time advancement, including an explicit paused state.
enum PlaybackSpeed: Double, CaseIterable, Sendable, Hashable {
  case paused = 0
  case halfX = 0.5
  case oneX = 1
  case twoX = 2
  case fourX = 4

  /// Supplies the compact speed label used by playback controls.
  var title: String {
    switch self {
    case .paused: "Paused"
    case .halfX: "0.5x"
    case .oneX: "1x"
    case .twoX: "2x"
    case .fourX: "4x"
    }
  }
}

/// Distinguishes interactive native simulation from reference execution.
enum NativeRuntimeMode: String, Sendable, Hashable {
  case interactive, reference

  /// Supplies the user-facing mode label.
  var title: String { self == .interactive ? "Interactive" : "Reference" }
}

/// Selects the amount of control detail shown in the native interface.
enum InterfaceTier: String, CaseIterable, Sendable, Hashable {
  case essential, advanced

  /// Supplies the user-facing interface-tier label.
  var title: String { self == .essential ? "Essential" : "Advanced" }
}

/// Keys reusable sampled series so cache reuse cannot cross scenario revisions.
struct SeriesKey: Sendable, Hashable {
  let revision: Int
  let scenario: EducationScenarioV4
  let samples: Int
  let centerSeconds: Double
  let runtimeMode: NativeRuntimeMode

  /// Captures every input that affects the reusable series cache entry.
  init(
    revision: Int, scenario: EducationScenarioV4, samples: Int, centerSeconds: Double,
    runtimeMode: NativeRuntimeMode = .interactive
  ) {
    self.revision = revision
    self.scenario = scenario
    self.samples = samples
    self.centerSeconds = centerSeconds
    self.runtimeMode = runtimeMode
  }
}

/// Describes the time and flux extent needed to map a light curve into a view.
struct LightCurveDomain: Sendable, Equatable {
  let firstTimeSeconds: Double
  let lastTimeSeconds: Double
  let lowerFlux: Double
  let upperFlux: Double

  /// Accepts explicit bounds when a caller already has a valid plotting domain.
  init(
    firstTimeSeconds: Double, lastTimeSeconds: Double, lowerFlux: Double,
    upperFlux: Double
  ) {
    self.firstTimeSeconds = firstTimeSeconds
    self.lastTimeSeconds = lastTimeSeconds
    self.lowerFlux = lowerFlux
    self.upperFlux = upperFlux
  }

  /// Derives padded, finite display bounds from sampled plot points.
  init(plot: PlotSnapshot) {
    firstTimeSeconds = plot.points.first?.timeSeconds ?? 0
    lastTimeSeconds = plot.points.last?.timeSeconds ?? firstTimeSeconds
    var minimumFlux = Double.infinity
    var maximumFlux = -Double.infinity
    for point in plot.points {
      minimumFlux = min(minimumFlux, point.flux)
      maximumFlux = max(maximumFlux, point.flux)
    }
    if !minimumFlux.isFinite || !maximumFlux.isFinite {
      minimumFlux = 0
      maximumFlux = 1
    }
    let fluxRange = max(maximumFlux - minimumFlux, 1e-8)
    lowerFlux = minimumFlux - fluxRange * 0.1
    upperFlux = maximumFlux + fluxRange * 0.1
  }
}

/// Holds reusable plot and timing snapshots produced for one series key.
struct SeriesSnapshot: Sendable, Equatable {
  let key: SeriesKey
  let plot: PlotSnapshot
  let oc: OCSnapshot
  /// Actual event diagnostics sampled around neighboring epochs.
  /// This remains separate from `oc`, which is an illustrative teaching proxy.
  let timingDiagnosticSteps: [EducationStep]
  let lightCurveDomain: LightCurveDomain
}

/// Bundles a series with its generation-specific scene and instantaneous step.
struct PresentationFrame: Sendable, Equatable {
  let generation: Int
  let series: SeriesSnapshot
  let scene: SceneSnapshot
  let currentStep: EducationStep
  let starRadiusMetres: Double
  let planetRadiusMetres: Double
  let moonRadiusMetres: Double?

  /// Exposes the reusable light-curve plot for presentation convenience.
  var plot: PlotSnapshot { series.plot }
  /// Exposes the reusable O-C snapshot for presentation convenience.
  var oc: OCSnapshot { series.oc }
}

/// Carries a generation-tagged request from the UI into the simulation actor.
struct CalculationRequest: Sendable, Equatable {
  let generation: Int
  let seriesKey: SeriesKey
  let timeSeconds: Double
  let runtimeMode: NativeRuntimeMode

  /// Preserves the request identity and runtime mode for stale-result filtering.
  init(
    generation: Int, seriesKey: SeriesKey, timeSeconds: Double,
    runtimeMode: NativeRuntimeMode = .interactive
  ) {
    self.generation = generation
    self.seriesKey = seriesKey
    self.timeSeconds = timeSeconds
    self.runtimeMode = runtimeMode
  }
}

/// Produces consistent requests from mutable session state at submission time.
struct CalculationRequestBuilder: Sendable {
  let generation: Int
  let seriesRevision: Int
  let scenario: EducationScenarioV4
  let sampleCount: Int
  let timeSeconds: Double
  let runtimeMode: NativeRuntimeMode = .interactive

  /// Builds a request whose cache key centers on the scenario's transit focus.
  func build() -> CalculationRequest {
    CalculationRequest(
      generation: generation,
      seriesKey: SeriesKey(
        revision: seriesRevision, scenario: scenario, samples: sampleCount,
        centerSeconds: PlaybackClockPolicy.transitFocus(for: scenario), runtimeMode: runtimeMode),
      timeSeconds: timeSeconds, runtimeMode: runtimeMode)
  }
}

/// Constrains playback to a transit-centered interval and a safe elapsed-time budget.
struct PlaybackClockPolicy: Sendable {
  static let interval = Duration.nanoseconds(16_666_667)
  static let maximumElapsedSeconds = 0.25

  let bounds: ClosedRange<Double>
  let periodSeconds: Double

  /// Derives a stable transit window from the scenario's orbital period.
  init(scenario: EducationScenarioV4) {
    let center = Self.transitFocus(for: scenario)
    let halfSpan = scenario.planet.orbit.periodSeconds * 0.09
    bounds = (center - halfSpan)...(center + halfSpan)
    periodSeconds = scenario.planet.orbit.periodSeconds
  }

  /// Returns the nominal transit time used to center plots and playback.
  static func transitFocus(for scenario: EducationScenarioV4) -> Double {
    scenario.epochSeconds + scenario.planet.orbit.periodSeconds / 4
  }

  /// Advances, wraps, or clamps time while preventing long suspension jumps.
  func advancedTime(
    from timeSeconds: Double, elapsedSeconds: Double, speed: PlaybackSpeed = .oneX,
    wrap: Bool = true
  ) -> Double {
    guard speed != .paused else { return timeSeconds }
    let elapsed = min(max(elapsedSeconds, 0), Self.maximumElapsedSeconds)
    let width = bounds.upperBound - bounds.lowerBound
    guard width > 0 else { return bounds.lowerBound }
    let advanced = timeSeconds + elapsed * speed.rawValue * periodSeconds / 16
    guard wrap else { return min(max(advanced, bounds.lowerBound), bounds.upperBound) }
    let remainder = (advanced - bounds.lowerBound).truncatingRemainder(dividingBy: width)
    return bounds.lowerBound + (remainder >= 0 ? remainder : remainder + width)
  }

  /// Chooses the next future cadence instant after a delayed playback tick.
  func nextTick(
    after scheduledTick: ContinuousClock.Instant, now: ContinuousClock.Instant
  ) -> ContinuousClock.Instant {
    let followingTick = scheduledTick.advanced(by: Self.interval)
    return followingTick > now ? followingTick : now.advanced(by: Self.interval)
  }
}

/// Represents either a completed frame or a request-tagged calculation failure.
enum CalculationOutcome: Sendable, Equatable {
  case success(PresentationFrame)
  case failure(generation: Int, seriesKey: SeriesKey, message: String)

  /// Exposes the originating generation for stale-result filtering.
  var generation: Int {
    switch self {
    case .success(let frame): frame.generation
    case .failure(let generation, _, _): generation
    }
  }

  /// Exposes the originating series key for cache/result validation.
  var seriesKey: SeriesKey {
    switch self {
    case .success(let frame): frame.series.key
    case .failure(_, let seriesKey, _): seriesKey
    }
  }
}

/// Tracks runtime queueing and cache behavior for diagnostics and tests.
struct SimulationRuntimeMetrics: Sendable, Equatable {
  var submittedRequests = 0
  var coalescedRequests = 0
  var completedFrames = 0
  var seriesBuilds = 0
}
