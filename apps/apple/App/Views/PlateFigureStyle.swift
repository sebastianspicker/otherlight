// Defines the native Deep Field colour roles, type, and evidence surfaces shared by the Apple apps.
import SwiftUI

/// Names the Deep Field colour roles backed by dark-only asset-catalog colour sets.
///
/// The roles mirror the Browser tokens in `styles/deep-field/tokens.css` and the canvas ink in
/// `render/canvas/figureInk.ts`: near-black space carries hairline-ruled surfaces, text is
/// starlight, one ice-blue accent marks the learner's change, and the sky plate is the deepest
/// surface. Each colour set has a single universal value because the interface is dark only.
enum DeepField {
  static let space = Color("DeepField/Space")
  static let surface = Color("DeepField/Surface")
  static let surface2 = Color("DeepField/Surface2")
  static let surface3 = Color("DeepField/Surface3")
  static let plate = Color("DeepField/Plate")
  static let well = Color("DeepField/Well")
  static let ink = Color("DeepField/Ink")
  static let ink2 = Color("DeepField/Ink2")
  static let ink3 = Color("DeepField/Ink3")
  static let onAccent = Color("DeepField/OnAccent")
  static let rule = Color("DeepField/Rule")
  static let ruleStrong = Color("DeepField/RuleStrong")
  static let fieldBorder = Color("DeepField/FieldBorder")
  static let figureFrame = Color("DeepField/FigureFrame")
  static let accent = Color("DeepField/Accent")
  static let accentStrong = Color("DeepField/AccentStrong")
  static let starlight = Color("DeepField/Starlight")
  static let caution = Color("DeepField/Caution")
  static let cautionWash = Color("DeepField/CautionWash")
  static let fault = Color("DeepField/Fault")
  static let faultWash = Color("DeepField/FaultWash")
  static let pass = Color("DeepField/Pass")
  static let plateInk = Color("DeepField/PlateInk")
  static let plateInk3 = Color("DeepField/PlateInk3")
  static let plateRule = Color("DeepField/PlateRule")

  /// Trace A, the accepted model, is drawn in ink.
  static let traceA = ink
  /// Trace B, the learner's change and the current state, is drawn in the accent.
  static let traceB = accent

  /// Radius shared by panels and the sky plate.
  static let panelRadius: CGFloat = 14
  /// Radius shared by buttons, fields, and margin notes.
  static let controlRadius: CGFloat = 8
}

/// Native text styles: New York stands in for STIX, SF and SF Mono for Atkinson, all with Dynamic Type.
extension Font {
  /// Screen titles, set in the serif like the Browser's display heading.
  static let deepFieldDisplay = Font.system(.largeTitle, design: .serif, weight: .medium)
  /// Panel and figure titles, set in the interface face.
  static let deepFieldTitle = Font.system(.title3, weight: .semibold)
  /// Lesson phase titles, concept titles, and smaller section heads.
  static let deepFieldHeading = Font.system(.headline)
  /// Small tracked capitals used sparingly as instrument labels.
  static let deepFieldLabel = Font.system(.caption2, design: .monospaced, weight: .medium)
  /// Units and figure keys, set in the serif italic.
  static let deepFieldUnit = Font.system(.subheadline, design: .serif).italic()
  /// Lesson prompts and other reading prose.
  static let deepFieldProse = Font.system(.body)
  /// Displayed relations and variables, where the serif italic matters.
  static let deepFieldEquation = Font.system(.title3, design: .serif)
  /// Readouts, identifiers, and serialized evidence.
  static let deepFieldReadout = Font.system(.callout, design: .monospaced)
}

/// Names the kind of evidence on screen, matching the Browser's evidence line.
enum EvidenceKind {
  case education
  case scientific

  /// Supplies the emphasized lead of the evidence line.
  var lead: String {
    switch self {
    case .education: "Education preview"
    case .scientific: "Scientific workspace"
    }
  }

  /// Supplies the plain continuation of the evidence line.
  var statement: String {
    switch self {
    case .education: "a teaching model with stated limits, computed on this device."
    case .scientific:
      "a session-only V5 execution workspace on this Mac. Never an Education substitute."
    }
  }

  /// Colours the marker dot: the accent for Education, starlight for the Scientific boundary.
  var marker: Color {
    switch self {
    case .education: DeepField.accent
    case .scientific: DeepField.starlight
    }
  }
}

/// States which kind of evidence the current screen shows, above a hairline rule.
struct RunningHead: View {
  let kind: EvidenceKind

  /// Builds the marker dot, emphasized lead, and plain statement as one readable line.
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Circle()
          .fill(kind.marker)
          .frame(width: 6, height: 6)
          .padding(3)
          .background(kind.marker.opacity(0.14), in: Circle())
          .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
          .accessibilityHidden(true)
        Text(
          "\(Text(kind.lead).fontWeight(.semibold).foregroundStyle(DeepField.ink)) — \(kind.statement)"
        )
        .foregroundStyle(DeepField.ink3)
        .font(.footnote)
        .fixedSize(horizontal: false, vertical: true)
      }
      Rectangle().fill(DeepField.rule).frame(height: 1)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Sets a screen title with its accent instrument-label kicker and supporting line.
struct ScreenTitle: View {
  let kicker: String
  let title: String
  let subtitle: String?

  /// Builds the title block directly on the space ground, without panel chrome.
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(kicker).instrumentLabel(DeepField.accent)
      Text(title).font(.deepFieldDisplay).foregroundStyle(DeepField.ink)
        .accessibilityAddTraits(.isHeader)
      if let subtitle {
        Text(subtitle).foregroundStyle(DeepField.ink2)
      }
    }
  }
}

/// Sets a region as a numbered panel: an optional figure number, a title, and an italic key.
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

  /// Builds the panel heading and caller-supplied content.
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        if let number {
          Text(number).instrumentLabel()
        }
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(title).font(.deepFieldTitle).foregroundStyle(DeepField.ink)
            .accessibilityAddTraits(.isHeader)
          if let key {
            Text(key).font(.deepFieldUnit).foregroundStyle(DeepField.ink3)
          }
        }
      }
      content
    }
    .deepFieldPanel()
  }
}

/// Frames the sky view as Plate 1, the deepest surface, with an envelope line and registration marks.
struct PlateFrame<Content: View>: View {
  let label: String
  @ViewBuilder let content: Content

  /// Creates a plate with its envelope label.
  init(label: String, @ViewBuilder content: () -> Content) {
    self.label = label
    self.content = content()
  }

  /// Builds the plate ground, envelope label, marks, hairline, and content.
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .instrumentLabel(DeepField.plateInk3)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isHeader)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
    .padding(12)
    .background(DeepField.plate, in: RoundedRectangle(cornerRadius: DeepField.panelRadius))
    .overlay(alignment: .bottomLeading) { RegistrationMark(edge: .leading).padding(8) }
    .overlay(alignment: .bottomTrailing) { RegistrationMark(edge: .trailing).padding(8) }
    .overlay {
      RoundedRectangle(cornerRadius: DeepField.panelRadius)
        .strokeBorder(DeepField.plateRule, lineWidth: 1)
    }
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
    .stroke(DeepField.plateInk3, lineWidth: 1)
    .frame(width: 12, height: 12)
    .accessibilityHidden(true)
  }
}

/// Distinguishes the tone of a margin note.
enum MarginNoteTone {
  case neutral
  case caution
  case fault

  /// Supplies the 3-point left rule colour that identifies the tone.
  var rule: Color {
    switch self {
    case .neutral: DeepField.ruleStrong
    case .caution: DeepField.caution
    case .fault: DeepField.fault
    }
  }

  /// Supplies the faint wash behind the note.
  var wash: Color {
    switch self {
    case .neutral: DeepField.surface2
    case .caution: DeepField.cautionWash
    case .fault: DeepField.faultWash
    }
  }

  /// Supplies the hairline around the note, tinted to its tone.
  var border: Color {
    switch self {
    case .neutral: DeepField.rule
    case .caution: DeepField.caution.opacity(0.22)
    case .fault: DeepField.fault.opacity(0.22)
    }
  }
}

/// Sets supporting evidence, hints, or limits as a margin note rather than an alert.
struct MarginNote: ViewModifier {
  let tone: MarginNoteTone

  /// Adds the 3-point left rule, faint wash, and hairline that identify the note's tone.
  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: DeepField.controlRadius)
    content
      .padding(.vertical, 12)
      .padding(.leading, 16)
      .padding(.trailing, 14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(tone.wash, in: shape)
      .overlay(alignment: .leading) {
        Rectangle().fill(tone.rule).frame(width: 3)
      }
      .clipShape(shape)
      .overlay { shape.strokeBorder(tone.border, lineWidth: 1) }
  }
}

/// Sets a region on the panel surface with a hairline, a 14-point radius, and a soft lift.
struct DeepFieldPanel: ViewModifier {
  let padding: CGFloat

  /// Adds the surface ground, hairline, and lift shadow behind the content.
  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: DeepField.panelRadius)
    content
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        shape
          .fill(DeepField.surface)
          .shadow(color: .black.opacity(0.35), radius: 1, y: 1)
          .shadow(color: .black.opacity(0.45), radius: 16, y: 12)
      }
      .overlay { shape.strokeBorder(DeepField.rule, lineWidth: 1) }
  }
}

/// Sets a text editor as an inset well with a 3:1 field border and an accent focus ring.
struct WellField: ViewModifier {
  @FocusState private var isFocused: Bool

  /// Replaces the default editor chrome with the inset well and its focus-aware border.
  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: DeepField.controlRadius)
    content
      .focused($isFocused)
      .scrollContentBackground(.hidden)
      .foregroundStyle(DeepField.ink)
      .padding(8)
      .background(DeepField.well, in: shape)
      .overlay {
        shape.strokeBorder(
          isFocused ? DeepField.accentStrong : DeepField.fieldBorder,
          lineWidth: isFocused ? 2 : 1)
      }
  }
}

/// Accent-filled button for the one primary action a surface exists for.
struct PrimaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  /// Builds an accent label with dark text (above 8:1) that keeps pressed and disabled states legible.
  func makeBody(configuration: Configuration) -> some View {
    let shape = RoundedRectangle(cornerRadius: DeepField.controlRadius)
    configuration.label
      .font(.body.weight(.semibold))
      .padding(.horizontal, 16)
      .padding(.vertical, 9)
      .foregroundStyle(isEnabled ? DeepField.onAccent : DeepField.ink3)
      .background(
        isEnabled
          ? (configuration.isPressed ? DeepField.accentStrong : DeepField.accent)
          : DeepField.surface2,
        in: shape
      )
      .overlay { shape.strokeBorder(isEnabled ? Color.clear : DeepField.rule, lineWidth: 1) }
      .contentShape(shape)
  }
}

/// Quiet raised button on Surface 2 for every non-primary action.
struct RaisedButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  /// Builds a raised label with a hairline that darkens to Surface 3 while pressed.
  func makeBody(configuration: Configuration) -> some View {
    let shape = RoundedRectangle(cornerRadius: DeepField.controlRadius)
    configuration.label
      .font(.body.weight(.medium))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .foregroundStyle(isEnabled ? DeepField.ink : DeepField.ink3)
      .background(configuration.isPressed ? DeepField.surface3 : DeepField.surface2, in: shape)
      .overlay { shape.strokeBorder(DeepField.ruleStrong, lineWidth: 1) }
      .opacity(isEnabled ? 1 : 0.7)
      .contentShape(shape)
  }
}

/// Exposes the Deep Field modifiers as chainable view helpers.
extension View {
  /// Sets the view as a margin note of the given tone.
  func marginNote(_ tone: MarginNoteTone = .neutral) -> some View {
    modifier(MarginNote(tone: tone))
  }

  /// Applies the inset-well field treatment to a text editor.
  func wellField() -> some View {
    modifier(WellField())
  }

  /// Sets the view as a panel on the surface ground.
  func deepFieldPanel(padding: CGFloat = 16) -> some View {
    modifier(DeepFieldPanel(padding: padding))
  }

  /// Sets text as a small tracked instrument label in the given colour.
  func instrumentLabel(_ color: Color = DeepField.ink3) -> some View {
    font(.deepFieldLabel)
      .tracking(1)
      .textCase(.uppercase)
      .foregroundStyle(color)
  }

  /// Places a screen on the Deep Field space ground.
  func spaceGround() -> some View {
    background(DeepField.space)
  }

  /// Places an instrument column, such as the inspector, on the panel surface.
  func surfaceGround() -> some View {
    background(DeepField.surface)
  }
}
