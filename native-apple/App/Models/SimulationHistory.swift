// Stores bounded, exportable local history for the native education presentation.
import Foundation

/// Records one finite light-curve measurement for local plotting and export.
struct LightCurveSample: Sendable, Equatable {
  let timeSeconds: Double
  let flux: Double
}

/// Maintains a bounded, chronologically ordered light-curve history with one undo level.
struct LightCurveHistory: Sendable {
  static let capacity = 2_000
  private(set) var samples: [LightCurveSample] = []
  private var clearedSamples: [LightCurveSample]?

  /// Inserts or replaces a finite sample while preserving chronological capacity bounds.
  mutating func append(timeSeconds: Double, flux: Double) {
    guard timeSeconds.isFinite, flux.isFinite else { return }
    clearedSamples = nil
    if let index = samples.firstIndex(where: { $0.timeSeconds == timeSeconds }) {
      samples[index] = .init(timeSeconds: timeSeconds, flux: flux)
    } else if let index = samples.firstIndex(where: { $0.timeSeconds > timeSeconds }) {
      samples.insert(.init(timeSeconds: timeSeconds, flux: flux), at: index)
    } else {
      samples.append(.init(timeSeconds: timeSeconds, flux: flux))
    }
    if samples.count > Self.capacity { samples.removeFirst(samples.count - Self.capacity) }
  }
  /// Clears samples while retaining them for a single user-visible undo action.
  mutating func clear() {
    guard !samples.isEmpty else { return }
    clearedSamples = samples
    samples = []
  }
  /// Restores the most recently cleared samples, if an undo snapshot exists.
  mutating func undoClear() {
    guard let clearedSamples else { return }
    samples = clearedSamples
    self.clearedSamples = nil
  }
  /// Discards history and undo state when the accepted scenario changes.
  mutating func reset() {
    samples = []
    clearedSamples = nil
  }
  /// Serializes the chronological samples in the stable light-curve CSV schema.
  var csv: String {
    (["time_s,flux"] + samples.map { "\($0.timeSeconds),\($0.flux)" }).joined(separator: "\n")
      + "\n"
  }
}

/// Identifies the body whose transit timing is being tracked.
enum TransitBody: String, Sendable, Hashable, CaseIterable { case planet, moon }
/// Identifies the signal treatment associated with a timing event.
enum TransitSignalSeries: String, Sendable, Hashable, CaseIterable { case raw, fit, detrended }
/// Records one finite transit-center diagnostic and its source signal.
struct TransitEvent: Sendable, Equatable {
  let body: TransitBody
  let centerSeconds: Double
  let observedFlux: Double
  let series: TransitSignalSeries
}
/// Represents the least-squares linear timing model used for O-C residuals.
struct LinearEphemeris: Sendable, Equatable {
  let epochSeconds: Double
  let periodSeconds: Double
  /// Predicts the center time for an ordinal under this ephemeris.
  func predictedCenter(for ordinal: Int) -> Double {
    epochSeconds + Double(ordinal) * periodSeconds
  }
}

/// Maintains bounded per-body timing diagnostics and a single clear undo snapshot.
struct TransitEventHistory: Sendable {
  static let capacityPerBody = 128
  private(set) var events: [TransitBody: [TransitEvent]] = [:]
  private var clearedEvents: [TransitBody: [TransitEvent]]?

  /// Adds a completed finite event, replacing duplicate centers and enforcing capacity.
  mutating func append(_ event: TransitEvent, currentTimeSeconds: Double) {
    guard currentTimeSeconds.isFinite, event.centerSeconds.isFinite, event.observedFlux.isFinite,
      event.centerSeconds <= currentTimeSeconds
    else { return }
    clearedEvents = nil
    var bodyEvents = events[event.body, default: []]
    if let index = bodyEvents.firstIndex(where: { $0.centerSeconds == event.centerSeconds }) {
      bodyEvents[index] = event
    } else {
      bodyEvents.append(event)
      bodyEvents.sort { $0.centerSeconds < $1.centerSeconds }
    }
    if bodyEvents.count > Self.capacityPerBody {
      bodyEvents.removeFirst(bodyEvents.count - Self.capacityPerBody)
    }
    events[event.body] = bodyEvents
  }
  /// Fits a linear ephemeris when enough completed events establish a positive period.
  func ephemeris(for body: TransitBody) -> LinearEphemeris? {
    let centers = events[body, default: []].map(\.centerSeconds)
    guard centers.count >= 2 else { return nil }
    let n = Double(centers.count)
    let meanOrdinal = (n - 1) / 2
    let meanTime = centers.reduce(0, +) / n
    let numerator = centers.enumerated().reduce(0.0) {
      $0 + (Double($1.offset) - meanOrdinal) * ($1.element - meanTime)
    }
    let denominator = (0..<centers.count).reduce(0.0) { $0 + pow(Double($1) - meanOrdinal, 2) }
    let period = numerator / denominator
    guard period.isFinite, period > 0 else { return nil }
    return .init(epochSeconds: meanTime - period * meanOrdinal, periodSeconds: period)
  }
  /// Returns O-C residuals in milliseconds relative to the fitted body ephemeris.
  func residualMilliseconds(for body: TransitBody) -> [(ordinal: Int, milliseconds: Double)] {
    guard let ephemeris = ephemeris(for: body) else { return [] }
    return events[body, default: []].enumerated().map {
      ($0.offset, ($0.element.centerSeconds - ephemeris.predictedCenter(for: $0.offset)) * 1_000)
    }
  }
  /// Returns the newest O-C residual for concise presentation.
  func latestResidualMilliseconds(for body: TransitBody) -> Double? {
    residualMilliseconds(for: body).last?.milliseconds
  }
  /// Calculates RMS O-C residual magnitude when the body has timing data.
  func rmsResidualMilliseconds(for body: TransitBody) -> Double? {
    let values = residualMilliseconds(for: body).map(\.milliseconds)
    guard !values.isEmpty else { return nil }
    return sqrt(values.reduce(0) { $0 + $1 * $1 } / Double(values.count))
  }
  /// Clears all event histories while retaining one undo snapshot.
  mutating func clear() {
    guard !events.isEmpty else { return }
    clearedEvents = events
    events = [:]
  }
  /// Restores the most recently cleared event histories, if available.
  mutating func undoClear() {
    guard let clearedEvents else { return }
    events = clearedEvents
    self.clearedEvents = nil
  }
  /// Discards event and undo history when it must not cross scenarios.
  mutating func reset() {
    events = [:]
    clearedEvents = nil
  }
  /// Serializes per-body timing diagnostics using the O-C CSV schema.
  var csv: String {
    var rows = ["body,ordinal,center_s,oc_ms,series,flux"]
    for body in TransitBody.allCases {
      let residuals = Dictionary(
        uniqueKeysWithValues: residualMilliseconds(for: body).map { ($0.ordinal, $0.milliseconds) })
      for (ordinal, event) in events[body, default: []].enumerated() {
        let residual = residuals[ordinal].map { String($0) } ?? ""
        rows.append(
          "\(body.rawValue),\(ordinal),\(event.centerSeconds),\(residual),\(event.series.rawValue),\(event.observedFlux)"
        )
      }
    }
    return rows.joined(separator: "\n") + "\n"
  }
}
