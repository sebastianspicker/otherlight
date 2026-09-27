// Defines the native Plate & Figure colour roles, type, and evidence surfaces shared by the Apple apps.
import SwiftUI

/// Names the Plate & Figure colour roles backed by light and dark asset-catalog variants.
///
/// The roles mirror the Browser tokens in `styles/plate-figure/tokens.css`: paper and ink carry
/// the interface, blue pencil marks the learner's change, and the sky plate stays dark.
enum PlateFigure {
  static let paper = Color("PlateFigure/Paper")
  static let paperRaised = Color("PlateFigure/PaperRaised")
  static let paperSunk = Color("PlateFigure/PaperSunk")
  static let ink = Color("PlateFigure/Ink")
  static let ink2 = Color("PlateFigure/Ink2")
  static let ink3 = Color("PlateFigure/Ink3")
  static let rule = Color("PlateFigure/Rule")
  static let ruleStrong = Color("PlateFigure/RuleStrong")
  static let pencil = Color("PlateFigure/Pencil")
  static let caution = Color("PlateFigure/Caution")
  static let cautionWash = Color("PlateFigure/CautionWash")
  static let fault = Color("PlateFigure/Fault")
  static let pass = Color("PlateFigure/Pass")
  static let plate = Color("PlateFigure/Plate")
  static let plateInk = Color("PlateFigure/PlateInk")
  static let plateInk3 = Color("PlateFigure/PlateInk3")
  static let plateRule = Color("PlateFigure/PlateRule")

  /// Radius shared by editable fields; sections and figures stay square.
  static let controlRadius: CGFloat = 3
}

/// Native text styles: the system serif stands in for STIX and scales with Dynamic Type.
extension Font {
  /// Screen titles, set like the Browser's display heading.
  static let plateDisplay = Font.system(.largeTitle, design: .serif, weight: .medium)
  /// Section and figure titles.
  static let plateTitle = Font.system(.title2, design: .serif, weight: .medium)
  /// Lesson phase titles and smaller section heads.
  static let plateHeading = Font.system(.title3, design: .serif, weight: .medium)
  /// Figure numbers, kickers, and units, set in the serif italic.
  static let plateCaption = Font.system(.subheadline, design: .serif).italic()
  /// Lesson prompts and other reading prose.
  static let plateProse = Font.system(.body, design: .serif)
  /// Readouts, identifiers, and serialized evidence.
  static let plateReadout = Font.system(.callout, design: .monospaced)
}

/// Names the kind of evidence on screen, matching the Browser's running head.
enum EvidenceKind {
  case education
  case scientific

  /// Supplies the emphasized lead of the running head.
  var lead: String {
    switch self {
    case .education: "Education preview"
    case .scientific: "Scientific workspace"
    }
  }

  /// Supplies the plain continuation of the running head.
  var statement: String {
    switch self {
    case .education: "a teaching model with stated limits, computed on this device."
    case .scientific:
      "a validated V5 run on this Mac, session only. Never an Education substitute."
    }
  }
}

/// States which kind of evidence the current screen shows, above a hairline rule.
struct RunningHead: View {
  let kind: EvidenceKind

  /// Builds the italic lead and plain statement as one readable line.
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(
        "\(Text(kind.lead).italic().fontWeight(.semibold).foregroundStyle(PlateFigure.ink)) — \(kind.statement)"
      )
      .foregroundStyle(PlateFigure.ink2)
      .font(.system(.subheadline, design: .serif))
      .fixedSize(horizontal: false, vertical: true)
      Rectangle().fill(PlateFigure.rule).frame(height: 1)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Sets a screen title with its italic kicker and supporting line.
struct ScreenTitle: View {
  let kicker: String
  let title: String
  let subtitle: String?

  /// Builds the title block without card chrome.
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(kicker).font(.plateCaption).foregroundStyle(PlateFigure.ink2)
      Text(title).font(.plateDisplay).foregroundStyle(PlateFigure.ink)
        .accessibilityAddTraits(.isHeader)
      if let subtitle {
        Text(subtitle).foregroundStyle(PlateFigure.ink2)
      }
    }
  }
}

/// Opens a ruled section: a 1-point ink rule, an optional figure number, and a serif title.
struct EvidenceSection<Content: View>: View {
  let number: String?
  let title: String
  let key: String?
  @ViewBuilder let content: Content

  /// Creates a section with an optional figure number and italic key.
  init(
    number: String? = nil, title: String, key: String? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.number = number
    self.title = title
    self.key = key
    self.content = content()
  }

  /// Builds the rule, heading, and caller-supplied content.
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Rectangle().fill(PlateFigure.ink).frame(height: 1)
      VStack(alignment: .leading, spacing: 2) {
        if let number {
          Text(number).font(.plateCaption).foregroundStyle(PlateFigure.ink2)
        }
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(title).font(.plateTitle).foregroundStyle(PlateFigure.ink)
            .accessibilityAddTraits(.isHeader)
          if let key {
            Text(key).font(.plateCaption).foregroundStyle(PlateFigure.ink3)
          }
        }
      }
      content
    }
  }
}

/// Frames the sky view as a dark photographic plate with an envelope line and registration marks.
struct PlateFrame<Content: View>: View {
  let label: String
  @ViewBuilder let content: Content

  /// Creates a plate with its envelope label.
  init(label: String, @ViewBuilder content: () -> Content) {
    self.label = label
    self.content = content()
  }

  /// Builds the plate background, label, marks, and content.
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label.uppercased())
        .font(.system(.caption2, design: .monospaced))
        .tracking(1)
        .foregroundStyle(PlateFigure.plateInk3)
        .accessibilityHidden(true)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
    .padding(12)
    .background(PlateFigure.plate)
    .overlay(alignment: .bottomLeading) { RegistrationMark(edge: .leading).padding(6) }
    .overlay(alignment: .bottomTrailing) { RegistrationMark(edge: .trailing).padding(6) }
    .overlay { Rectangle().stroke(PlateFigure.plateRule, lineWidth: 1) }
    .environment(\.colorScheme, .dark)
  }
}

/// Draws one corner bracket of the plate's registration marks.
private struct RegistrationMark: View {
  let edge: HorizontalEdge

  /// Builds a 12-point L-shaped mark on the requested lower corner.
  var body: some View {
    Path { path in
      let x: CGFloat = edge == .leading ? 0 : 12
      path.move(to: CGPoint(x: x, y: 0))
      path.addLine(to: CGPoint(x: x, y: 12))
      path.addLine(to: CGPoint(x: 12 - x, y: 12))
    }
    .stroke(PlateFigure.plateInk3, lineWidth: 1)
    .frame(width: 12, height: 12)
    .accessibilityHidden(true)
  }
}

/// Distinguishes the tone of a ruled margin note.
enum MarginNoteTone {
  case neutral
  case caution
}

/// Sets supporting evidence, hints, or limits as a ruled margin note rather than an alert.
struct MarginNote: ViewModifier {
  let tone: MarginNoteTone

  /// Adds the left rule and wash that identify the note's tone.
  func body(content: Content) -> some View {
    content
      .padding(.vertical, 10)
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(tone == .caution ? PlateFigure.cautionWash : PlateFigure.paperSunk)
      .overlay(alignment: .leading) {
        Rectangle()
          .fill(tone == .caution ? PlateFigure.caution : PlateFigure.ruleStrong)
          .frame(width: 3)
      }
  }
}

/// Gives a text editor the ruled-paper field treatment used by Browser inputs.
struct RuledField: ViewModifier {
  /// Replaces the default editor chrome with a raised paper field and a strong rule.
  func body(content: Content) -> some View {
    content
      .scrollContentBackground(.hidden)
      .padding(6)
      .background(
        PlateFigure.paperRaised,
        in: RoundedRectangle(cornerRadius: PlateFigure.controlRadius)
      )
      .overlay {
        RoundedRectangle(cornerRadius: PlateFigure.controlRadius)
          .stroke(PlateFigure.ruleStrong, lineWidth: 1)
      }
  }
}

/// Solid-ink button for the one action a surface exists for.
struct InkButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  /// Builds an ink-filled label that keeps its pressed and disabled states legible.
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.body.weight(.semibold))
      .padding(.horizontal, 16)
      .padding(.vertical, 9)
      .foregroundStyle(isEnabled ? PlateFigure.paper : PlateFigure.ink3)
      .background(
        isEnabled
          ? (configuration.isPressed ? PlateFigure.ink2 : PlateFigure.ink)
          : Color.clear,
        in: RoundedRectangle(cornerRadius: PlateFigure.controlRadius)
      )
      .overlay {
        RoundedRectangle(cornerRadius: PlateFigure.controlRadius)
          .stroke(isEnabled ? PlateFigure.ink : PlateFigure.rule, lineWidth: 1)
      }
      .contentShape(Rectangle())
  }
}

/// Exposes the Plate & Figure modifiers as chainable view helpers.
extension View {
  /// Sets the view as a ruled margin note of the given tone.
  func marginNote(_ tone: MarginNoteTone = .neutral) -> some View {
    modifier(MarginNote(tone: tone))
  }

  /// Applies the ruled-paper treatment to a text editor.
  func ruledField() -> some View {
    modifier(RuledField())
  }

  /// Places a screen on the Plate & Figure paper ground.
  func paperGround() -> some View {
    background(PlateFigure.paper)
  }
}
