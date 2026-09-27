// Implements calculation delivery, playback, and presentation lifecycle for EducationSession.
import Foundation
import TransitCore
import TransitVisualization

/// Provides calculation delivery, playback, and presentation lifecycle operations for an education session.
extension EducationSession {
  /// Starts or stops playback while cancelling stale scheduled ticks when paused.
  func toggleRunning() {
    if !hasStarted { start() }
    isRunning.toggle()
    if isRunning {
      if playbackSpeed == .paused { playbackSpeed = .oneX }
      calculationStatus = isRenderingActive ? "Running" : "Paused while hidden"
      if isRenderingActive { startPlayback() }
    } else {
      playbackTask?.cancel()
      playbackTask = nil
      generation += 1
      calculationStatus = "Paused"
    }
  }

  /// Moves the current time to the scenario's nominal transit focus.
  func jumpToTransit() {
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: scenario)
    requestCalculation(refreshSeries: false)
  }

  /// Stops playback and restores transit-focused time without rebuilding the series.
  func resetSimulation() {
    playbackTask?.cancel()
    playbackTask = nil
    isRunning = false
    simulationTimeSeconds = PlaybackClockPolicy.transitFocus(for: scenario)
    calculationStatus = "Paused"
    requestCalculation(refreshSeries: false, announcesWork: false)
  }

  /// Requests a fresh sampled series for the current accepted scenario.
  func recalculate() { requestCalculation(refreshSeries: true) }

  /// Updates playback speed, treating the paused speed as a stop request.
  func setPlaybackSpeed(_ speed: PlaybackSpeed) {
    playbackSpeed = speed
    if speed == .paused, isRunning { toggleRunning() }
  }

  /// Changes local execution semantics and prevents histories from mixing different result modes.
  func setRuntimeMode(_ mode: NativeRuntimeMode) {
    guard runtimeMode != mode else { return }
    runtimeMode = mode
    resetHistories()
    requestCalculation(refreshSeries: true)
  }

  /// Clamps scene zoom to safe view bounds.
  func setSceneZoom(_ zoom: Double) { sceneZoom = min(max(zoom, 0.5), 4) }

  /// Restores the neutral scene zoom used by reset controls.
  func resetSceneZoom() { sceneZoom = 1 }

  /// Clears light-curve history while preserving its one-level undo state.
  func clearLightCurveHistory() { lightCurveHistory.clear() }

  /// Restores light-curve history from the last clear when available.
  func undoClearLightCurveHistory() { lightCurveHistory.undoClear() }

  /// Clears transit timing history while preserving its one-level undo state.
  func clearTransitEventHistory() { transitEventHistory.clear() }

  /// Restores transit timing history from the last clear when available.
  func undoClearTransitEventHistory() { transitEventHistory.undoClear() }

  /// Clamps sample density to supported bounds before invalidating the cached series.
  func setSampleCount(_ count: Int) {
    let supportedCount = min(max(count, 32), 512)
    guard sampleCount != supportedCount else { return }
    sampleCount = supportedCount
    requestCalculation(refreshSeries: true)
  }

  /// Suspends delivery and playback while the host reports the window as occluded.
  func setOccluded(_ occluded: Bool) {
    guard isOccluded != occluded else { return }
    let wasActive = isRenderingActive
    isOccluded = occluded
    updateRenderingActivity(wasActive: wasActive)
  }

  /// Applies scene lifecycle changes to calculation and playback activity.
  func setSceneActive(_ active: Bool) {
    guard isSceneActive != active else { return }
    let wasActive = isRenderingActive
    isSceneActive = active
    updateRenderingActivity(wasActive: wasActive)
  }

  /// Reports whether calculations and playback may consume rendering resources.
  private var isRenderingActive: Bool { hasStarted && isSceneActive && !isOccluded }

  /// Submits a generation-tagged calculation only while rendering activity is permitted.
  func requestCalculation(refreshSeries: Bool, announcesWork: Bool = true) {
    if refreshSeries {
      seriesRevision += 1
      // The old frame remains visible during recalculation, but it must not be exported with
      // newly accepted parameters or freshly reset histories.
      canExport = false
    }
    guard isRenderingActive else { return }
    generation += 1
    displayState = frame == nil ? .loading : .ready
    if announcesWork, !isRunning { calculationStatus = "Calculating…" }
    let request = CalculationRequestBuilder(
      generation: generation, seriesRevision: seriesRevision, scenario: scenario,
      sampleCount: sampleCount, timeSeconds: simulationTimeSeconds, runtimeMode: runtimeMode,
      referenceSubsteps: referenceSubsteps
    ).build()
    Task { [weak self] in
      guard let self else { return }
      await runtime.submit(request) { [weak self] outcome in self?.receive(outcome) }
    }
  }

  /// Starts one cancellable cadence loop that advances time and coalesces requests.
  private func startPlayback() {
    guard isRunning, isRenderingActive else { return }
    playbackTask?.cancel()
    cadenceWindowStart = nil
    acceptedFramesInCadenceWindow = 0
    Self.logger.info("Playback started")
    let playbackScenario = scenario
    playbackTask = Task { [weak self] in
      let clock = ContinuousClock()
      var previousTick = clock.now
      let policy = PlaybackClockPolicy(scenario: playbackScenario)
      var nextTick = previousTick.advanced(by: PlaybackClockPolicy.interval)
      while !Task.isCancelled {
        do {
          try await clock.sleep(until: nextTick, tolerance: .milliseconds(1))
        } catch {
          return
        }
        let now = clock.now
        let elapsed = previousTick.duration(to: now)
        previousTick = now
        nextTick = policy.nextTick(after: nextTick, now: now)
        guard let self, self.isRunning, self.isRenderingActive else { return }
        self.advancePlayback(byRealSeconds: EducationHistoryPolicy.seconds(elapsed))
        self.requestCalculation(refreshSeries: false, announcesWork: false)
      }
    }
  }

  /// Advances simulation time through the policy so elapsed time stays bounded.
  private func advancePlayback(byRealSeconds elapsedSeconds: Double) {
    simulationTimeSeconds = PlaybackClockPolicy(scenario: scenario).advancedTime(
      from: simulationTimeSeconds, elapsedSeconds: elapsedSeconds, speed: playbackSpeed)
  }

  /// Exposes the policy's playback bounds for presentation and test consistency.
  static func playbackBounds(for scenario: EducationScenarioV4) -> ClosedRange<Double> {
    PlaybackClockPolicy(scenario: scenario).bounds
  }

  /// Synchronizes pause state with runtime activity revisions to reject stale resumes.
  private func updateRenderingActivity(wasActive: Bool) {
    let isActive = isRenderingActive
    guard wasActive != isActive else { return }
    activityRevision += 1
    let revision = activityRevision
    playbackTask?.cancel()
    playbackTask = nil
    if !isActive {
      generation += 1
      if isRunning { calculationStatus = "Paused while hidden" }
      Self.logger.info("Rendering suspended")
      Task { await runtime.setPaused(true, activityRevision: revision) }
      return
    }
    Self.logger.info("Rendering resumed")
    Task { [weak self] in
      guard let self else { return }
      await runtime.setPaused(false, activityRevision: revision)
      guard revision == activityRevision, isRenderingActive else { return }
      requestCalculation(refreshSeries: false, announcesWork: !isRunning)
      if isRunning {
        calculationStatus = "Running"
        startPlayback()
      }
    }
  }

  /// Accepts only current, active results so stale actor deliveries cannot mutate UI state.
  private func receive(_ outcome: CalculationOutcome) {
    guard outcome.generation == generation,
      outcome.seriesKey
        == CalculationRequestBuilder(
          generation: generation, seriesRevision: seriesRevision, scenario: scenario,
          sampleCount: sampleCount, timeSeconds: simulationTimeSeconds, runtimeMode: runtimeMode,
          referenceSubsteps: referenceSubsteps
        ).build().seriesKey,
      isRenderingActive
    else { return }
    switch outcome {
    case .success(let candidate):
      frame = candidate
      if !canExport { canExport = true }
      displayState = .ready
      let nextStatus = isRunning ? runningStatus : "Updated"
      if calculationStatus != nextStatus { calculationStatus = nextStatus }
      recordHistory(from: candidate)
      recordAcceptedFrame()
    case .failure(_, _, let message):
      displayState = .error(message)
      calculationStatus = message
    }
  }

  /// Measures accepted-frame cadence over one-second windows for playback status.
  private func recordAcceptedFrame() {
    let now = clock.now
    guard let start = cadenceWindowStart else {
      cadenceWindowStart = now
      acceptedFramesInCadenceWindow = 1
      return
    }
    acceptedFramesInCadenceWindow += 1
    let elapsed = EducationHistoryPolicy.seconds(start.duration(to: now))
    guard elapsed >= 1 else { return }
    presentationUpdatesPerSecond = Double(acceptedFramesInCadenceWindow - 1) / elapsed
    acceptedFramesInCadenceWindow = 1
    cadenceWindowStart = now
    if isRunning {
      calculationStatus = runningStatus
      Self.logger.debug("Accepted presentation cadence: \(self.presentationUpdatesPerSecond) Hz")
    }
  }

  /// Formats live playback status with cadence only after it has been measured.
  private var runningStatus: String {
    EducationHistoryPolicy.playbackStatus(
      speed: playbackSpeed, updatesPerSecond: presentationUpdatesPerSecond)
  }

  /// Prevents light-curve and timing histories from crossing accepted scenario changes.
  func resetHistories() {
    lightCurveHistory.reset()
    transitEventHistory.reset()
  }

  /// Extracts display and timing diagnostics from an accepted frame for local export.
  private func recordHistory(from candidate: PresentationFrame) {
    lightCurveHistory.append(
      timeSeconds: candidate.currentStep.timeSeconds, flux: candidate.currentStep.flux)
    let currentTime = candidate.currentStep.timeSeconds
    for event in EducationHistoryPolicy.events(from: candidate) {
      transitEventHistory.append(event, currentTimeSeconds: currentTime)
    }
  }
}
