// Presents the simulation dashboard, diagnostics, and calculation-state fallbacks.
import Foundation
import SwiftUI
import TransitEducation
import TransitVisualization

/// Presents the current simulation frame, diagnostics, and calculation status.
struct SimulationDashboard: View {
  let session: EducationSession

  /// Builds the scrollable dashboard from the latest valid presentation frame.
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        RunningHead(kind: .education)
        HStack(alignment: .firstTextBaseline) {
          ScreenTitle(
            kicker: "Transit experiment", title: "Simulation",
            subtitle: "Watch the geometry, read the light, and time each transit.")
          Spacer()
          Text(session.calculationStatus).font(.callout).foregroundStyle(PlateFigure.ink2)
        }
        if let frame = session.frame {
          SimulationPlotRow(frame: frame, session: session)
          EvidenceSection(number: "Figure 3", title: "O-C history", key: "milliseconds") {
            TransitOCChart(
              history: session.transitEventHistory, transitBody: session.selectedTransitBody
            )
            .background(PlateFigure.paper)
            .frame(height: 170)
          }
          TimingHistoryControls(session: session)
          SimulationFrameSummary(
            frame: frame, transitEventCount: session.selectedTransitEventCount,
            latestResidualMilliseconds: session.selectedTransitLatestResidualMilliseconds
          )
          .equatable()
        } else if case .loading = session.displayState {
          ProgressView("Calculating the selected scenario…").frame(
            maxWidth: .infinity, minHeight: 500)
        } else if case .error(let message) = session.displayState {
          ContentUnavailableView(
            "Calculation needs attention", systemImage: "exclamationmark.triangle",
            description: Text(message)
          )
          .frame(minHeight: 500)
        } else {
          ContentUnavailableView("No simulation frame", systemImage: "waveform.path")
            .frame(minHeight: 500)
        }
      }
      .padding(24)
    }
    .paperGround()
    .accessibilityIdentifier("simulation-dashboard")
  }

}

/// Renders a portable two-star lab without representing it as a scientific execution surface.
struct DetachedBinaryLabView: View {
  let session: EducationSession

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  #endif

  /// Builds the adaptive hypothesis, reveal, sky, and light-curve learning surface.
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        RunningHead(kind: .education)
        header
        hypothesisCard
        if let frame = session.frame {
          adaptivePlots(frame: frame)
          SimulationFrameSummary(frame: frame, includesScene: session.isBinaryLabSkyVisible)
            .equatable()
            .accessibilityIdentifier("detached-binary-figure-summary")
        } else if case .loading = session.displayState {
          ProgressView("Calculating the detached-binary Education preview…")
            .frame(maxWidth: .infinity, minHeight: 360)
        } else if case .error(let message) = session.displayState {
          ContentUnavailableView(
            "Education preview needs attention", systemImage: "exclamationmark.triangle",
            description: Text(message)
          )
          .frame(maxWidth: .infinity, minHeight: 360)
        }
      }
      .padding(24)
    }
    .paperGround()
    .accessibilityIdentifier("detached-binary-lab")
  }

  /// Labels the bounded mode and its live calculation state without implying scientific execution.
  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      ScreenTitle(
        kicker: "Detached binary lab", title: "Read the light of two stars",
        subtitle: "Two-star barycentric geometry and luminous-disk overlap.")
      Spacer()
      Text(session.calculationStatus).font(.callout).foregroundStyle(PlateFigure.ink2)
    }
  }

  /// Requires an explicit learner hypothesis before guarded reveal and locked controls can advance.
  private var hypothesisCard: some View {
    EvidenceSection(title: "Hypothesis and reveal") {
      VStack(alignment: .leading, spacing: 10) {
        Picker(
          "Hypothesis",
          selection: Binding(
            get: { session.binaryLab?.hypothesis },
            set: { if let hypothesis = $0 { session.setBinaryLabHypothesis(hypothesis) } })
        ) {
          Text("Choose a hypothesis").tag(BinaryLabWorkspace.Hypothesis?.none)
          Text("Primary eclipse is deepest")
            .tag(Optional(BinaryLabWorkspace.Hypothesis.primaryEclipseDeepest))
          Text("Secondary eclipse dominates")
            .tag(Optional(BinaryLabWorkspace.Hypothesis.secondaryEclipseDominates))
          Text("Eccentricity shifts eclipse spacing")
            .tag(Optional(BinaryLabWorkspace.Hypothesis.eccentricityShiftsEclipseSpacing))
        }
        .accessibilityIdentifier("binary-lab-hypothesis")

        if session.isBinaryLabSkyVisible {
          Label("Sky view revealed", systemImage: "eye")
            .foregroundStyle(PlateFigure.ink2)
        } else {
          Text("The sky view remains hidden until the V4 reveal condition is satisfied.")
            .font(.footnote)
            .foregroundStyle(PlateFigure.ink2)
          Button("Reveal sky view") { session.revealBinaryLabSky() }
            .disabled(!session.canRevealBinaryLabSky)
            .accessibilityIdentifier("binary-lab-reveal")
        }
        Label(
          session.isParameterEditingLocked
            ? "Parameters are locked until a hypothesis is selected."
            : "Parameters are unlocked. Use the inspector for primary-star photometry.",
          systemImage: session.isParameterEditingLocked ? "lock.fill" : "lock.open"
        )
        .font(.footnote)
        .foregroundStyle(PlateFigure.ink2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// Uses a vertical layout on narrow iPhone widths and side-by-side cards where space permits.
  @ViewBuilder
  private func adaptivePlots(frame: PresentationFrame) -> some View {
    #if os(iOS)
      if horizontalSizeClass == .compact {
        VStack(spacing: 12) { plotCards(frame: frame) }
      } else {
        HStack(spacing: 12) { plotCards(frame: frame) }
      }
    #else
      HStack(spacing: 12) { plotCards(frame: frame) }
    #endif
  }

  /// Supplies the same compact-safe plot cards to each platform-specific container.
  @ViewBuilder
  private func plotCards(frame: PresentationFrame) -> some View {
    PlateFrame(label: "Plate 1 · sky plane") {
      if session.isBinaryLabSkyVisible {
        SkyCanvas(
          scene: frame.scene, starRadiusMetres: frame.starRadiusMetres,
          planetRadiusMetres: frame.planetRadiusMetres, moonRadiusMetres: frame.moonRadiusMetres,
          zoomMultiplier: session.sceneZoom)
      } else {
        ContentUnavailableView(
          "Sky view is guarded", systemImage: "eye.slash",
          description: Text("Choose a hypothesis, then reveal the two-star geometry."))
      }
    }
    .frame(height: 280)
    FigureCard(number: "Figure 2", title: "Relative starlight") {
      LightCurveCanvas(
        series: frame.series, history: session.lightCurveHistory,
        markerTimeSeconds: frame.scene.timeSeconds, markerFlux: frame.scene.flux)
    }
    .frame(height: 280)
  }
}

/// Arranges the sky and light-curve cards vertically whenever a compact width would clip them.
private struct SimulationPlotRow: View {
  let frame: PresentationFrame
  let session: EducationSession

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  #endif

  /// Selects a compact-safe vertical stack or the regular horizontal plot layout.
  var body: some View {
    #if os(iOS)
      if horizontalSizeClass == .compact {
        VStack(spacing: 12) { plotCards }
      } else {
        HStack(spacing: 12) { plotCards }
      }
    #else
      HStack(spacing: 12) { plotCards }
    #endif
  }

  /// Supplies identically sized plot cards to either adaptive container.
  @ViewBuilder
  private var plotCards: some View {
    PlateFrame(label: "Plate 1 · sky plane") {
      SkyCanvas(
        scene: frame.scene,
        starRadiusMetres: frame.starRadiusMetres,
        planetRadiusMetres: frame.planetRadiusMetres,
        moonRadiusMetres: frame.moonRadiusMetres,
        zoomMultiplier: session.sceneZoom)
    }
    .frame(height: 280)
    FigureCard(number: "Figure 2", title: "Relative starlight") {
      LightCurveCanvas(
        series: frame.series,
        history: session.lightCurveHistory,
        markerTimeSeconds: frame.scene.timeSeconds,
        markerFlux: frame.scene.flux)
    }
    .frame(height: 280)
  }
}

/// Summarizes visual simulation data in text for assistive technologies.
@MainActor
private struct SimulationFrameSummary: View, Equatable {
  let frame: PresentationFrame
  let includesScene: Bool
  let transitEventCount: Int?
  let latestResidualMilliseconds: Double?

  /// Creates a visual-evidence summary, with timing evidence when the dashboard provides it.
  init(
    frame: PresentationFrame, includesScene: Bool = true, transitEventCount: Int? = nil,
    latestResidualMilliseconds: Double? = nil
  ) {
    self.frame = frame
    self.includesScene = includesScene
    self.transitEventCount = transitEventCount
    self.latestResidualMilliseconds = latestResidualMilliseconds
  }

  /// Compares data that changes the accessibility summary while throttling frame churn.
  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.frame.series.key == rhs.frame.series.key
      && lhs.frame.generation / 15 == rhs.frame.generation / 15
      && lhs.includesScene == rhs.includesScene
      && lhs.transitEventCount == rhs.transitEventCount
      && lhs.latestResidualMilliseconds == rhs.latestResidualMilliseconds
  }

  /// Builds the visible caption and consolidated accessibility label.
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      if includesScene { Text(AccessibleSummary.scene(frame.scene)) }
      Text(AccessibleSummary.plot(frame.plot))
      if let timingSummary { Text(timingSummary) }
    }
    .font(.caption)
    .foregroundStyle(PlateFigure.ink2)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilitySummary)
  }

  /// Combines scene, light-curve, and timing values into one spoken summary.
  private var accessibilitySummary: String {
    (includesScene ? "Sky view. \(AccessibleSummary.scene(frame.scene)) " : "")
      + "Light-curve marker: time \(frame.scene.timeSeconds) seconds, normalized flux "
      + "\(String(format: "%.6f", frame.scene.flux)). "
      + AccessibleSummary.plot(frame.plot)
      + (timingSummary.map { " \($0)" } ?? "")
  }

  /// Describes whether enough event history exists to calculate an O-C residual.
  private var timingSummary: String? {
    guard let transitEventCount else { return nil }
    guard let latestResidualMilliseconds else {
      return "\(transitEventCount) diagnostic transit events; at least two are needed for O-C."
    }
    return String(
      format: "%d diagnostic transit events; latest O-C %.3f milliseconds.",
      transitEventCount, latestResidualMilliseconds)
  }
}

/// Controls selection, inspection, and clearing of accepted light-curve and timing history.
private struct TimingHistoryControls: View {
  let session: EducationSession

  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  #endif

  /// Builds compact history metrics and destructive actions with their undo controls.
  var body: some View {
    #if os(iOS)
      if horizontalSizeClass == .compact {
        compactHistoryControls
      } else {
        regularHistoryControls
      }
    #else
      regularHistoryControls
    #endif
  }

  /// Preserves the desktop grid while allowing aligned metrics on ample horizontal space.
  private var regularHistoryControls: some View {
    Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
      GridRow {
        Picker(
          "Timing body",
          selection: Binding(
            get: { session.selectedTransitBody },
            set: { session.setSelectedTransitBody($0) })
        ) {
          ForEach(TransitBody.allCases, id: \.self) { body in
            Text(body.rawValue.capitalized).tag(body)
          }
        }
        .frame(maxWidth: 240)
        Text(
          "\(session.selectedTransitEventCount) \(session.selectedTransitBody.rawValue) events · \(session.lightCurveHistory.samples.count) accepted frames"
        )
        .foregroundStyle(PlateFigure.ink2)
      }
      GridRow {
        Text("Latest O-C")
        Text(formatted(session.selectedTransitLatestResidualMilliseconds))
      }
      GridRow {
        Text("RMS O-C")
        Text(formatted(session.selectedTransitRMSMilliseconds))
      }
      GridRow {
        HStack {
          Button("Clear light history") { session.clearLightCurveHistory() }
          Button("Undo") { session.undoClearLightCurveHistory() }
            .accessibilityLabel("Undo light history clear")
        }
        HStack {
          Button("Clear timing history") { session.clearTransitEventHistory() }
          Button("Undo") { session.undoClearTransitEventHistory() }
            .accessibilityLabel("Undo timing history clear")
        }
      }
    }
    .font(.caption)
    .marginNote()
  }

  #if os(iOS)
    /// Stacks history metrics and actions so controls remain legible in compact widths.
    private var compactHistoryControls: some View {
      VStack(alignment: .leading, spacing: 10) {
        Picker(
          "Timing body",
          selection: Binding(
            get: { session.selectedTransitBody },
            set: { session.setSelectedTransitBody($0) })
        ) {
          ForEach(TransitBody.allCases, id: \.self) { body in
            Text(body.rawValue.capitalized).tag(body)
          }
        }
        .pickerStyle(.segmented)
        Text(
          "\(session.selectedTransitEventCount) \(session.selectedTransitBody.rawValue) events · \(session.lightCurveHistory.samples.count) accepted frames"
        )
        .foregroundStyle(PlateFigure.ink2)
        LabeledContent(
          "Latest O-C", value: formatted(session.selectedTransitLatestResidualMilliseconds))
        LabeledContent("RMS O-C", value: formatted(session.selectedTransitRMSMilliseconds))
        VStack(alignment: .leading, spacing: 6) {
          Button("Clear light history") { session.clearLightCurveHistory() }
          Button("Undo light history clear") { session.undoClearLightCurveHistory() }
          Button("Clear timing history") { session.clearTransitEventHistory() }
          Button("Undo timing history clear") { session.undoClearTransitEventHistory() }
        }
      }
      .font(.caption)
      .marginNote()
    }
  #endif

  /// Formats an O-C metric or explains the minimum event requirement.
  private func formatted(_ value: Double?) -> String {
    guard let value else { return "Needs at least two events" }
    return String(format: "%.3f ms", value)
  }
}

/// Sets a plot as a numbered journal figure on paper, with a serif title and no card chrome.
private struct FigureCard<Content: View>: View {
  let number: String
  let title: String
  @ViewBuilder let content: Content

  /// Builds the figure number, title, and caller-supplied plot content.
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(number).font(.plateCaption).foregroundStyle(PlateFigure.ink2)
      Text(title).font(.plateHeading).foregroundStyle(PlateFigure.ink)
        .accessibilityAddTraits(.isHeader)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
  }
}

/// Selects the navigation presentation used by the same guided-lab content.
