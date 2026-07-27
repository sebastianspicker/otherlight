// Provides the file-document adapter for exporting simulation frames and lesson reports.
import SwiftUI
import UniformTypeIdentifiers

/// Adapts accepted simulation state into the document formats exposed by SwiftUI export.
struct ExportDocument: FileDocument {
  /// Declares the text formats that SwiftUI may import into a placeholder document.
  static var readableContentTypes: [UTType] { [.commaSeparatedText, .plainText] }

  let frame: PresentationFrame?
  let planetRadius: Double
  let moonRadius: Double
  let moonOffset: Double
  let lightCurveHistory: LightCurveHistory
  let transitEventHistory: TransitEventHistory
  let format: ExportFormat
  let lessonMarkdown: String?

  /// Captures accepted data and the requested export format without revalidating UI drafts.
  init(
    frame: PresentationFrame?, planetRadius: Double, moonRadius: Double, moonOffset: Double,
    lightCurveHistory: LightCurveHistory = .init(),
    transitEventHistory: TransitEventHistory = .init(), format: ExportFormat = .csv,
    lessonMarkdown: String? = nil
  ) {
    self.frame = frame
    self.planetRadius = planetRadius
    self.moonRadius = moonRadius
    self.moonOffset = moonOffset
    self.lightCurveHistory = lightCurveHistory
    self.transitEventHistory = transitEventHistory
    self.format = format
    self.lessonMarkdown = lessonMarkdown
  }

  /// Creates a benign placeholder because exports are write-oriented documents.
  init(configuration: ReadConfiguration) throws {
    frame = nil
    planetRadius = 1
    moonRadius = 0.35
    moonOffset = 0.2
    lightCurveHistory = .init()
    transitEventHistory = .init()
    format = .csv
    lessonMarkdown = nil
  }

  /// Encodes the selected representation into a regular UTF-8 file wrapper.
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    let text: String
    switch format {
    case .csv: text = csv
    case .oc: text = oc
    case .markdown: text = lessonMarkdown ?? markdown
    }
    return FileWrapper(regularFileWithContents: Data(text.utf8))
  }

  /// Returns an otherwise identical document with a different requested representation.
  func with(format: ExportFormat) -> ExportDocument {
    ExportDocument(
      frame: frame, planetRadius: planetRadius, moonRadius: moonRadius, moonOffset: moonOffset,
      lightCurveHistory: lightCurveHistory, transitEventHistory: transitEventHistory,
      format: format, lessonMarkdown: lessonMarkdown)
  }

  /// Returns the stable light-curve CSV payload.
  var csv: String { lightCurveHistory.csv }

  /// Returns the stable O-C diagnostics CSV payload.
  var oc: String { transitEventHistory.csv }

  /// Builds Markdown notes from accepted frame and history values for lab export.
  var markdown: String {
    """
    # Otherlight notes

    - Planet radius: \(planetRadius)
    - Moon radius: \(moonRadius)
    - Moon phase offset: \(moonOffset)
    - Transit depth: \(1 - (frame?.currentStep.flux ?? 1))
    - Timing events: \(transitEventHistory.events.values.reduce(0) { $0 + $1.count }) diagnostic transit centers.
    - O-C boundary: education-model event diagnostics, not calibrated observational data.
    """
  }
}
