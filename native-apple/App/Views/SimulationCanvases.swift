// Draws the sky-plane and light-curve canvas representations of simulation snapshots.
import SwiftUI
import TransitVisualization

/// Draws the projected star and transiting bodies in sky-plane coordinates.
struct SkyCanvas: View {
  let scene: SceneSnapshot
  let starRadiusMetres: Double
  let planetRadiusMetres: Double
  let moonRadiusMetres: Double?
  let zoomMultiplier: Double

  /// Builds the non-interactive Canvas using radii scaled to the stellar disc.
  var body: some View {
    Canvas { context, size in
      let starDiameter = min(size.width, size.height) * 0.68 * min(max(zoomMultiplier, 0.5), 4)
      let starScreenRadius = starDiameter / 2
      let star = CGRect(
        x: size.width / 2 - starDiameter / 2,
        y: size.height / 2 - starDiameter / 2,
        width: starDiameter,
        height: starDiameter)
      context.fill(Path(ellipseIn: star), with: .color(.yellow.opacity(0.88)))
      for point in scene.skyPoints {
        let x = size.width * 0.5 + point.position.x / starRadiusMetres * starScreenRadius
        let y = size.height * 0.5 - point.position.y / starRadiusMetres * starScreenRadius
        let physicalRadius =
          point.body == "planet" ? planetRadiusMetres : moonRadiusMetres ?? 0
        let radius = max(4, physicalRadius / starRadiusMetres * starScreenRadius)
        let color: Color = point.body == "planet" ? .indigo : .gray
        context.fill(
          Path(
            ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)),
          with: .color(color))
      }
    }
    .accessibilityHidden(true)
  }
}

/// Displays observed-minus-calculated residuals recorded for one transiting body.
struct TransitOCChart: View {
  let history: TransitEventHistory
  let transitBody: TransitBody

  /// Builds the residual plot or its data-collection placeholder.
  var body: some View {
    let residuals = history.residualMilliseconds(for: transitBody)
    ZStack {
      Canvas { context, size in
        let plot = CGRect(origin: .zero, size: size).insetBy(dx: 24, dy: 18)
        let middle = plot.midY
        context.stroke(
          Path {
            $0.move(to: CGPoint(x: plot.minX, y: middle))
            $0.addLine(to: CGPoint(x: plot.maxX, y: middle))
          }, with: .color(.secondary.opacity(0.45)))
        guard residuals.count > 1 else { return }
        let maximumMagnitude = max(
          residuals.map { abs($0.milliseconds) }.max() ?? 0, Double.leastNonzeroMagnitude)
        for residual in residuals {
          let x =
            plot.minX + CGFloat(residual.ordinal) / CGFloat(max(residuals.count - 1, 1))
            * plot.width
          let y = middle - residual.milliseconds / maximumMagnitude * plot.height * 0.42
          context.fill(
            Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)),
            with: .color(.orange))
        }
      }
      .accessibilityHidden(true)
      if residuals.count < 2 {
        Text("Collect at least two \(transitBody.rawValue) transit events to calculate O-C.")
          .font(.caption)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .padding()
      }
    }
  }
}

/// Layers the reference light curve, accepted samples, and current-frame marker.
struct LightCurveCanvas: View {
  let series: SeriesSnapshot
  let history: LightCurveHistory
  let markerTimeSeconds: Double
  let markerFlux: Double

  /// Builds the composite, accessibility-hidden light-curve drawing.
  var body: some View {
    ZStack {
      StaticLightCurveCanvas(series: series)
        .equatable()
      AcceptedLightCurveHistoryCanvas(history: history, domain: series.lightCurveDomain)
      LightCurveMarkerCanvas(
        domain: series.lightCurveDomain,
        markerTimeSeconds: markerTimeSeconds,
        markerFlux: markerFlux)
    }
    .accessibilityHidden(true)
  }
}

/// Draws previously accepted light-curve samples over the static reference curve.
private struct AcceptedLightCurveHistoryCanvas: View {
  let history: LightCurveHistory
  let domain: LightCurveDomain

  /// Builds point marks only for samples inside the current plotting domain.
  var body: some View {
    Canvas { context, size in
      let mapper = LightCurveCoordinateMapper(domain: domain, size: size)
      for sample in history.samples {
        guard let point = mapper.point(timeSeconds: sample.timeSeconds, flux: sample.flux) else {
          continue
        }
        context.fill(
          Path(ellipseIn: CGRect(x: point.x - 2, y: point.y - 2, width: 4, height: 4)),
          with: .color(.orange.opacity(0.75)))
      }
    }
  }
}

/// Caches the static curve drawing until the series identity changes.
@MainActor
private struct StaticLightCurveCanvas: View, Equatable {
  let series: SeriesSnapshot

  /// Suppresses redundant redraws because the immutable key covers every rendered series input.
  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.series.key == rhs.series.key
  }

  /// Builds the framed reference curve Canvas.
  var body: some View {
    Canvas { context, size in
      let drawing = LightCurveDrawing(
        plot: series.plot,
        domain: series.lightCurveDomain,
        size: size)
      context.stroke(
        Path(CGRect(origin: drawing.bounds.origin, size: drawing.bounds.size)),
        with: .color(.secondary.opacity(0.3)))
      guard let path = drawing.curvePath else { return }
      context.stroke(path, with: .color(.accentColor), lineWidth: 2)
    }
  }
}

/// Draws the vertical time cursor and marker for the currently displayed frame.
private struct LightCurveMarkerCanvas: View {
  let domain: LightCurveDomain
  let markerTimeSeconds: Double
  let markerFlux: Double

  /// Builds the marker only when its physical values map into the plotting domain.
  var body: some View {
    Canvas { context, size in
      let mapper = LightCurveCoordinateMapper(domain: domain, size: size)
      let bounds = mapper.bounds
      guard let marker = mapper.point(timeSeconds: markerTimeSeconds, flux: markerFlux) else {
        return
      }
      var markerLine = Path()
      markerLine.move(to: CGPoint(x: marker.x, y: bounds.minY))
      markerLine.addLine(to: CGPoint(x: marker.x, y: bounds.maxY))
      context.stroke(
        markerLine,
        with: .color(.orange),
        style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
      context.fill(
        Path(ellipseIn: CGRect(x: marker.x - 4, y: marker.y - 4, width: 8, height: 8)),
        with: .color(.orange))
    }
  }
}

/// Displays the static O-C series supplied by the presentation snapshot.
struct OCChart: View {
  let series: SeriesSnapshot

  /// Builds the equatable O-C Canvas wrapper.
  var body: some View {
    StaticOCChart(series: series)
      .equatable()
      .accessibilityHidden(true)
  }
}

/// Caches the snapshot O-C drawing until its series identity changes.
@MainActor
private struct StaticOCChart: View, Equatable {
  let series: SeriesSnapshot

  /// Compares the rendered-series key to suppress redundant Canvas updates.
  nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.series.key == rhs.series.key
  }

  /// Builds the zero-baseline residual Canvas and event points.
  var body: some View {
    Canvas { context, size in
      let plot = CGRect(origin: .zero, size: size).insetBy(dx: 24, dy: 18)
      let middle = plot.midY
      context.stroke(
        Path {
          $0.move(to: CGPoint(x: plot.minX, y: middle))
          $0.addLine(to: CGPoint(x: plot.maxX, y: middle))
        }, with: .color(.secondary.opacity(0.45)))
      let points = series.oc.timings
      guard points.count > 1 else { return }
      for point in points {
        let x =
          plot.minX + CGFloat(point.transitNumber - points[0].transitNumber)
          / CGFloat(max(1, points.last!.transitNumber - points[0].transitNumber)) * plot.width
        let y = middle - point.observedMinusCalculatedSeconds / 120 * plot.height * 0.45
        context.fill(
          Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(.orange))
      }
    }
  }
}

/// Precomputes the coordinate conversion and path inputs for a light-curve Canvas.
private struct LightCurveDrawing {
  let mapper: LightCurveCoordinateMapper
  private let points: [PlotPoint]

  /// Exposes the mapper bounds for the enclosing Canvas border.
  var bounds: CGRect { mapper.bounds }

  /// Captures the plot points and coordinate domain for a specific Canvas size.
  init(plot: PlotSnapshot, domain: LightCurveDomain, size: CGSize) {
    mapper = LightCurveCoordinateMapper(domain: domain, size: size)
    points = plot.points
  }

  /// Produces a continuous path when every plotted sample lies within the domain.
  var curvePath: Path? {
    guard points.count > 1 else { return nil }
    var path = Path()
    for (index, point) in points.enumerated() {
      guard let position = mapper.point(timeSeconds: point.timeSeconds, flux: point.flux) else {
        return nil
      }
      index == 0 ? path.move(to: position) : path.addLine(to: position)
    }
    return path
  }
}

/// Maps physical time and normalized flux values into inset Canvas coordinates.
struct LightCurveCoordinateMapper {
  let bounds: CGRect
  let domain: LightCurveDomain

  /// Defines the inset plotting bounds for a domain at the given Canvas size.
  init(domain: LightCurveDomain, size: CGSize) {
    self.domain = domain
    bounds = CGRect(origin: .zero, size: size).insetBy(dx: 24, dy: 24)
  }

  /// Converts a domain-valid light-curve sample into a Canvas point, or rejects it.
  func point(timeSeconds: Double, flux: Double) -> CGPoint? {
    let timeSpanSeconds = domain.lastTimeSeconds - domain.firstTimeSeconds
    guard timeSpanSeconds > 0 else { return nil }
    let normalizedTime = (timeSeconds - domain.firstTimeSeconds) / timeSpanSeconds
    guard (0...1).contains(normalizedTime) else { return nil }
    let normalizedFlux = min(
      max(
        (domain.upperFlux - flux)
          / max(domain.upperFlux - domain.lowerFlux, 1e-8),
        0),
      1)
    return CGPoint(
      x: bounds.minX + normalizedTime * bounds.width,
      y: bounds.minY + normalizedFlux * bounds.height)
  }
}
