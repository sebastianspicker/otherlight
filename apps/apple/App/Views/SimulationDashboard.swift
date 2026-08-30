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
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          VStack(alignment: .leading, spacing: 3) {
            Text("Simulation").font(.title2.weight(.semibold))
            Text("Explore transit geometry, flux, and event-derived timing diagnostics.")
              .foregroundStyle(.secondary)
          }
          Spacer()
          Text(session.calculationStatus).foregroundStyle(.secondary)
        }
        if let frame = session.frame {
          SimulationPlotRow(frame: frame, session: session)
          PlotCard(title: "O-C event history (milliseconds)") {
            TransitOCChart(
              history: session.transitEventHistory, transitBody: session.selectedTransitBody)
          }
          .frame(height: 170)
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
      .padding(20)
    }
    .accessibilityIdentifier("simulation-dashboard")
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
    PlotCard(title: "Sky view") {
      SkyCanvas(
        scene: frame.scene,
        starRadiusMetres: frame.starRadiusMetres,
        planetRadiusMetres: frame.planetRadiusMetres,
        moonRadiusMetres: frame.moonRadiusMetres,
        zoomMultiplier: session.sceneZoom)
    }
    .frame(height: 280)
    PlotCard(title: "Normalized light curve") {
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
  let transitEventCount: Int
  let latestResidualMilliseconds: Double?

  /// Compares data that changes the accessibility summary while throttling frame churn.
  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.frame.series.key == rhs.frame.series.key
      && lhs.frame.generation / 15 == rhs.frame.generation / 15
      && lhs.transitEventCount == rhs.transitEventCount
      && lhs.latestResidualMilliseconds == rhs.latestResidualMilliseconds
  }

  /// Builds the visible caption and consolidated accessibility label.
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(AccessibleSummary.scene(frame.scene))
      Text(AccessibleSummary.plot(frame.plot))
      Text(timingSummary)
    }
    .font(.caption)
    .foregroundStyle(.secondary)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilitySummary)
  }

  /// Combines scene, light-curve, and timing values into one spoken summary.
  private var accessibilitySummary: String {
    "Sky view. \(AccessibleSummary.scene(frame.scene)) "
      + "Light-curve marker: time \(frame.scene.timeSeconds) seconds, normalized flux "
      + "\(String(format: "%.6f", frame.scene.flux)). "
      + AccessibleSummary.plot(frame.plot)
      + " \(timingSummary)"
  }

  /// Describes whether enough event history exists to calculate an O-C residual.
  private var timingSummary: String {
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
        .foregroundStyle(.secondary)
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
    .padding(12)
    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
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
        .foregroundStyle(.secondary)
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
      .padding(12)
      .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
  #endif

  /// Formats an O-C metric or explains the minimum event requirement.
  private func formatted(_ value: Double?) -> String {
    guard let value else { return "Needs at least two events" }
    return String(format: "%.3f ms", value)
  }
}

/// Wraps a plot in a consistently styled titled card.
private struct PlotCard<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  /// Builds the card chrome around its caller-supplied plot content.
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
    .padding(12)
    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
  }
}

/// Selects the navigation presentation used by the same guided-lab content.
