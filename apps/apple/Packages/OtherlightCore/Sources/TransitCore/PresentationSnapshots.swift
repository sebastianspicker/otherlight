// Defines simulation output snapshots consumed by education and visualization modules.
import Foundation

/// Names a simulated body and its sky-plane position for rendering.
public struct SkyPoint: Codable, Sendable, Hashable {
  public var body: String
  public var position: Vector3
  /// Creates a named body snapshot at a sky-plane position.
  public init(body: String, position: Vector3) {
    self.body = body
    self.position = position
  }
}

/// Stores calculated and observed-minus-calculated timing information for one transit index.
public struct TransitTimingSignal: Codable, Sendable, Hashable {
  public var transitNumber: Int
  public var calculatedSeconds: Double
  public var observedMinusCalculatedSeconds: Double
  /// Creates one transit timing signal from calculated and residual times.
  public init(transitNumber: Int, calculatedSeconds: Double, observedMinusCalculatedSeconds: Double)
  {
    self.transitNumber = transitNumber
    self.calculatedSeconds = calculatedSeconds
    self.observedMinusCalculatedSeconds = observedMinusCalculatedSeconds
  }
}

/// Holds optional contact and center times for planet and moon transits.
public struct TransitTimingDiagnostics: Codable, Sendable, Hashable {
  public var planetTransitCenterSec: Double?
  public var planetTransitDurationSec: Double?
  public var planetIngressSec: Double?
  public var planetEgressSec: Double?
  public var moonTransitCenterSec: Double?
  public var moonTransitDurationSec: Double?
  public var moonIngressSec: Double?
  public var moonEgressSec: Double?
  /// Creates empty optional transit timing diagnostics.
  public init() {}
}

/// Breaks total flux into transit and phase contributions for explanation and plotting.
public struct FluxComponents: Codable, Sendable, Hashable {
  public var total: Double
  public var transitFactor: Double
  public var stellarPreTransit: Double
  public var planetPhase: Double
  public var moonPhase: Double
  /// Creates flux components for a rendered simulation step.
  public init(
    total: Double, transitFactor: Double, stellarPreTransit: Double, planetPhase: Double,
    moonPhase: Double
  ) {
    self.total = total
    self.transitFactor = transitFactor
    self.stellarPreTransit = stellarPreTransit
    self.planetPhase = planetPhase
    self.moonPhase = moonPhase
  }
}

/// Describes one named rendering condition for presentation layers.
public struct RenderEvent: Codable, Sendable, Hashable {
  public let id: String
  public let kind: String
  public let label: String
  public let active: Bool
  /// Creates a named rendering event and its active state.
  public init(id: String, kind: String, label: String, active: Bool) {
    self.id = id
    self.kind = kind
    self.label = label
    self.active = active
  }
}

/// Provides normalized phase, occultation, and event signals for view layers.
public struct RenderSignals: Codable, Sendable, Hashable {
  public var phase: Double
  public var dayNightFraction: Double
  public var occultedFraction: Double
  public var events: [RenderEvent]
  /// Creates normalized signals for phase, occultation, and rendering events.
  public init(
    phase: Double, dayNightFraction: Double, occultedFraction: Double, events: [RenderEvent] = []
  ) {
    self.phase = phase
    self.dayNightFraction = dayNightFraction
    self.occultedFraction = occultedFraction
    self.events = events
  }
}

/// Captures the complete simulation snapshot consumed by education and visualization modules.
public struct EducationStep: Codable, Sendable, Hashable {
  public var timeSeconds: Double
  public var skyPoints: [SkyPoint]
  public var flux: Double
  public var fluxComponents: FluxComponents
  public var timing: TransitTimingSignal
  public var transitTiming: TransitTimingDiagnostics
  public var renderSignals: RenderSignals
  public var warnings: [String]
  /// Creates a complete education snapshot for one simulation time.
  public init(
    timeSeconds: Double, skyPoints: [SkyPoint], flux: Double, fluxComponents: FluxComponents? = nil,
    timing: TransitTimingSignal, transitTiming: TransitTimingDiagnostics = .init(),
    renderSignals: RenderSignals, warnings: [String]
  ) {
    self.timeSeconds = timeSeconds
    self.skyPoints = skyPoints
    self.flux = flux
    self.fluxComponents =
      fluxComponents
      ?? .init(total: flux, transitFactor: flux, stellarPreTransit: 1, planetPhase: 0, moonPhase: 0)
    self.timing = timing
    self.transitTiming = transitTiming
    self.renderSignals = renderSignals
    self.warnings = warnings
  }
}
