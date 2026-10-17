// Provides adaptive lesson navigation and guided-lab detail presentation.
import SwiftUI
import TransitEducation

/// Selects the navigation arrangement used for guided labs on each platform.
enum GuidedLabsNavigationStyle: Equatable {
  case regular
  case compact
}

/// Presents lessons as a desktop split view or compact list-to-detail navigation.
struct GuidedLabsView: View {
  let session: EducationSession
  let navigationStyle: GuidedLabsNavigationStyle

  /// Selects the regular or compact navigation shell while sharing the same lesson session.
  init(session: EducationSession, navigationStyle: GuidedLabsNavigationStyle = .regular) {
    self.session = session
    self.navigationStyle = navigationStyle
  }

  /// Builds the platform-appropriate lesson navigation around shared detail content.
  var body: some View {
    #if os(iOS)
      if navigationStyle == .compact {
        compactLessonNavigation
      } else {
        regularIPadLessonNavigation
      }
    #else
      desktopLessonNavigation
    #endif
  }

  #if os(macOS)
    /// Preserves the always-visible lesson list used by the desktop workspace.
    private var desktopLessonNavigation: some View {
      HSplitView {
        List(LessonCatalog.lessons, id: \.id) { lesson in
          lessonRow(lesson, activates: true)
        }
        GuidedLabDetail(session: session)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  #endif

  #if os(iOS)
    /// Keeps lessons and their selected detail visible in a regular-width iPad split layout.
    private var regularIPadLessonNavigation: some View {
      NavigationSplitView {
        List(
          LessonCatalog.lessons,
          id: \.id,
          selection: Binding(
            get: { session.selectedLessonID },
            set: { if let id = $0 { session.selectLesson(id: id) } })
        ) { lesson in
          VStack(alignment: .leading, spacing: 3) {
            Text(lesson.title)
            Text(lesson.objective).font(.caption).foregroundStyle(DeepField.ink2)
          }
          .tag(lesson.id)
        }
        .navigationTitle("Guided Labs")
        .navigationSplitViewColumnWidth(min: 210, ideal: 270)
      } detail: {
        GuidedLabDetail(session: session)
      }
    }

    /// Pushes an individual lesson detail from the compact Guided Labs tab.
    private var compactLessonNavigation: some View {
      List(LessonCatalog.lessons, id: \.id) { lesson in
        NavigationLink {
          GuidedLabDetail(session: session, selectedLessonID: lesson.id)
        } label: {
          VStack(alignment: .leading, spacing: 3) {
            Text(lesson.title)
            Text(lesson.objective).font(.caption).foregroundStyle(DeepField.ink2)
          }
        }
        .accessibilityIdentifier("guided-lab-\(lesson.id)")
      }
      .accessibilityIdentifier("guided-labs-list")
    }
  #endif

  /// Builds a selectable lesson row without duplicating the list's selection styling.
  @ViewBuilder
  private func lessonRow(_ lesson: LessonDefinition, activates: Bool) -> some View {
    Button {
      if activates { session.selectLesson(id: lesson.id) }
    } label: {
      HStack {
        VStack(alignment: .leading) {
          Text(lesson.title)
          Text(lesson.objective).font(.caption).foregroundStyle(DeepField.ink2)
        }
        Spacer()
        if lesson.id == session.selectedLessonID {
          Image(systemName: "checkmark")
            .accessibilityLabel("Selected")
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("guided-lab-\(lesson.id)")
  }
}

/// Renders one selected lesson's prompts, evidence controls, progress, and phase actions.
private struct GuidedLabDetail: View {
  let session: EducationSession
  let selectedLessonID: String?

  /// Initializes a detail view that may activate a lesson when pushed from compact navigation.
  init(session: EducationSession, selectedLessonID: String? = nil) {
    self.session = session
    self.selectedLessonID = selectedLessonID
  }

  /// Builds the scrollable lesson workspace from root-owned session state.
  var body: some View {
    let lessons = LessonCatalog.lessons
    let report = session.currentLessonReport
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        RunningHead(kind: .education)
        if let lesson = lessons.first(where: { $0.id == session.selectedLessonID }) {
          ScreenTitle(kicker: "Guided Lab", title: lesson.title, subtitle: lesson.objective)
        }

        if let phase = session.currentGuidedPhase {
          VStack(alignment: .leading, spacing: 6) {
            Rectangle().fill(DeepField.rule).frame(height: 1)
            Text("Phase \(session.guidedPhaseIndex + 1) of \(session.guidedPhases.count)")
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(DeepField.accent)
            Text(phase.title).font(.deepFieldTitle).foregroundStyle(DeepField.ink)
              .accessibilityAddTraits(.isHeader)
          }
          ForEach(phase.prompts, id: \.id) { prompt in
            promptEditor(prompt)
          }
        }

        hintControls
        comparisonControls
        lessonProgress(report: report)
        phaseControls
        completionProgress(totalLessons: lessons.count)
      }
      .padding(24)
      .frame(maxWidth: 760, alignment: .leading)
      .buttonStyle(RaisedButtonStyle())
    }
    .spaceGround()
    .onAppear {
      if let selectedLessonID { session.selectLesson(id: selectedLessonID) }
    }
    .accessibilityIdentifier("guided-lab-detail")
  }

  /// Creates one accessible response editor for the current guided phase.
  @ViewBuilder
  private func promptEditor(_ prompt: GuidedLabPrompt) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(prompt.prompt).font(.deepFieldProse).foregroundStyle(DeepField.ink)
      TextEditor(
        text: Binding(
          get: { session.guidedResponse(for: prompt.responseKey) },
          set: { session.setGuidedResponse($0, for: prompt.responseKey) })
      )
      .frame(minHeight: 90)
      .accessibilityLabel(prompt.prompt)
      .accessibilityIdentifier("guided-response-\(prompt.id)")
      .wellField()
    }
  }

  /// Builds the hint depth picker and its current contextual guidance.
  private var hintControls: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Hint").font(.deepFieldHeading).foregroundStyle(DeepField.ink)
      VStack(alignment: .leading, spacing: 8) {
        Picker(
          "Level",
          selection: Binding(
            get: { session.hintLevel },
            set: { session.setHintLevel($0) })
        ) {
          ForEach(HintLevel.allCases, id: \.self) { level in
            Text(level.rawValue).tag(level)
          }
        }
        .pickerStyle(.segmented)
        Text(session.guidedHintText).foregroundStyle(DeepField.ink)
      }
      .marginNote(.caution)
    }
  }

  /// Builds the free-form comparison evidence field used by the lesson rubric.
  private var comparisonControls: some View {
    EvidenceSection(title: "A/B comparison") {
      VStack(alignment: .leading, spacing: 6) {
        Text("Record one evidence-based difference between the baseline and current state.")
          .foregroundStyle(DeepField.ink2)
        TextEditor(
          text: Binding(
            get: { session.guidedComparisonObservation },
            set: { session.setGuidedComparisonObservation($0) })
        )
        .frame(minHeight: 70)
        .accessibilityLabel("A/B comparison observation")
        .accessibilityIdentifier("guided-comparison")
        .wellField()
      }
    }
  }

  /// Shows the current lesson check and response-rubric result.
  @ViewBuilder
  private func lessonProgress(report: LessonReport?) -> some View {
    if let report, let check = report.checks.first {
      Label(check.message, systemImage: check.passed ? "checkmark.circle.fill" : "circle")
        .foregroundStyle(check.passed ? DeepField.pass : DeepField.ink2)
    } else {
      ProgressView("Waiting for a simulation frame")
    }

    let rubric = session.currentGuidedRubric
    VStack(alignment: .leading, spacing: 5) {
      ProgressView(value: rubric.score)
      Text(
        "Response rubric: \(rubric.earnedWeight, format: .number)/\(rubric.totalWeight, format: .number)"
      )
      .font(.footnote)
      .foregroundStyle(DeepField.ink2)
    }
  }

  /// Builds phase movement and completion actions with session-provided completion gating.
  private var phaseControls: some View {
    HStack {
      Button("Previous phase") { session.moveGuidedPhase(by: -1) }
        .disabled(session.guidedPhaseIndex == 0)
      Button("Next phase") { session.moveGuidedPhase(by: 1) }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(
          !session.guidedPhaseReady || session.guidedPhaseIndex >= session.guidedPhases.count - 1)
      Spacer()
      Button("Complete lab") { session.completeCurrentLesson() }
        .disabled(!session.canCompleteGuidedLesson)
    }
  }

  /// Displays completed-lab count against the stable catalog size.
  private func completionProgress(totalLessons: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      ProgressView(value: Double(session.completedLessonIDs.count), total: Double(totalLessons))
      Text("\(session.completedLessonIDs.count) of \(totalLessons) labs completed")
        .font(.footnote).foregroundStyle(DeepField.ink2)
    }
  }
}

/// Teaches the six relations behind the Education figures, one concept card each.
///
/// Mirrors the Browser field guide in `observatory/templates/fieldGuide.ts`: every card sets its
/// relation as a displayed equation with a spoken label, explains it while naming its simplifying
/// assumptions, and points back into the experiment.
struct FieldGuide: View {
  /// Builds the guide heading and an adaptive grid of concept cards.
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text("Field guide").instrumentLabel()
        Text("Reading a light curve").font(.deepFieldTitle).foregroundStyle(DeepField.ink)
          .accessibilityAddTraits(.isHeader)
        Text(
          "Six relations behind every figure on this page. Each is the idealised textbook form; the Education model adds the effects the notes name."
        )
        .foregroundStyle(DeepField.ink2)
        .fixedSize(horizontal: false, vertical: true)
      }
      LazyVGrid(
        columns: [GridItem(.adaptive(minimum: 260), spacing: 12, alignment: .top)],
        alignment: .leading, spacing: 12
      ) {
        ForEach(Array(FieldGuideConcept.all.enumerated()), id: \.element.title) { index, concept in
          FieldGuideCard(number: index + 1, concept: concept)
        }
      }
    }
    .padding(.top, 24)
    .accessibilityIdentifier("field-guide")
  }
}

/// Holds one field-guide concept: its relation, spoken relation, explanation, and pointer.
private struct FieldGuideConcept {
  let title: String
  let relation: Text
  let relationLabel: String
  let body: String
  let tryIt: String

  /// Sets a variable in the serif italic.
  private static func v(_ symbol: String) -> Text { Text(symbol).italic() }

  /// Sets a lowered subscript.
  private static func sub(_ symbol: String) -> Text {
    Text(symbol).font(.system(.footnote, design: .serif)).baselineOffset(-4)
  }

  /// Sets a raised superscript.
  private static func sup(_ symbol: String) -> Text {
    Text(symbol).font(.system(.footnote, design: .serif)).baselineOffset(7)
  }

  /// Supplies the six concepts with the Browser's copy; body markdown italicizes variables.
  static var all: [FieldGuideConcept] {
    [
      FieldGuideConcept(
        title: "Transit depth",
        relation: Text("\(v("δ")) ≈ (\(v("R"))\(sub("p")) / \(v("R"))\(sub("★")))\(sup("2"))"),
        relationLabel: "Depth is approximately the planet-to-star radius ratio, squared",
        body:
          "For an opaque planet fully inside a uniformly bright stellar disk, the depth equals the covered area fraction. A Jupiter-size planet in front of a Sun-like star removes about 1 % of the light; an Earth removes about 84 parts per million.",
        tryIt:
          "Double the planet radius in the parameter inspector and apply it: the geometric depth estimate grows four-fold; the computed signal also depends on limb darkening and overlap."
      ),
      FieldGuideConcept(
        title: "Limb darkening",
        relation: Text(
          "\(v("I"))(\(v("μ"))) / \(v("I"))(1) = 1 − \(v("u"))\(sub("1"))(1 − \(v("μ"))) − \(v("u"))\(sub("2"))(1 − \(v("μ")))\(sup("2"))"
        ),
        relationLabel:
          "Quadratic limb-darkening law: relative intensity equals one minus u1 times one minus mu, minus u2 times one minus mu squared",
        body:
          "Toward the limb we see higher, cooler layers of the photosphere, so the disk fades at its edge. Here *μ* = cos *θ*, where *θ* is the angle between the local surface normal and the line of sight, and *u*₁, *u*₂ are coefficients fitted for the star and the passband. For a small planet crossing near disk centre, the transit is deeper than the uniform-disk estimate. A chord near the dim limb can instead be shallower.",
        tryIt: "Look at the plate: the stellar disk dims toward its rim."
      ),
      FieldGuideConcept(
        title: "Impact parameter",
        relation: Text("\(v("b")) = \(v("a")) |cos \(v("i"))| / \(v("R"))\(sub("★"))"),
        relationLabel:
          "Impact parameter equals semi-major axis times the absolute value of cosine of inclination, over stellar radius",
        body:
          "The sky-projected distance of the planet’s path from the stellar centre, in stellar radii, for a circular orbit of radius *a* seen at inclination *i* (90° is edge-on). A larger *b* means a shorter chord; for 1 − *R*ₚ/*R*★ < *b* < 1 + *R*ₚ/*R*★ the planet grazes the limb; beyond that there is no transit.",
        tryIt:
          "Watch the planet's path across the plate: a chord farther from the disk centre is shorter, and so is the transit."
      ),
      FieldGuideConcept(
        title: "Transit duration",
        relation: Text(
          "\(v("T"))\(sub("14")) ≈ (\(v("P"))/π) arcsin[(\(v("R"))\(sub("★"))/\(v("a"))) √((1 + \(v("k")))\(sup("2")) − \(v("b"))\(sup("2"))) / sin \(v("i"))]"
        ),
        relationLabel:
          "Total duration is approximately P over pi times arcsine of R star over a, times the square root of the difference between the square of one plus k and b squared, over sine i",
        body:
          "First to fourth contact for a circular orbit with period *P*, where *k* = *R*ₚ/*R*★. Around the same star and at fixed *b* and *k*, wider Keplerian orbits are slower, so transits last longer (*T* ∝ *P*^1/3 when *a* ≫ *R*★).",
        tryIt: "Jump to transit and read the ingress and egress off the time axis."
      ),
      FieldGuideConcept(
        title: "Transit timing",
        relation: Text(
          "O − C = \(v("T"))\(sub("obs")) − (\(v("T"))\(sub("0")) + \(v("n"))\(v("P")))"),
        relationLabel:
          "Observed minus computed equals observed mid-transit time minus the quantity T zero plus n times P",
        body:
          "A lone planet on a Keplerian orbit transits on a strict schedule: epoch *n* falls at *T*₀ + *nP*. A moon pulls the planet around their common barycentre, so transits arrive slightly early or late; the O − C diagram records that rhythm.",
        tryIt:
          "Pick an exomoon teaching scenario, let several transits pass and read Figure 3, the O-C history."
      ),
      FieldGuideConcept(
        title: "Eclipsing binaries",
        relation: Text(
          "\(v("δ"))\(sub("sec")) / \(v("δ"))\(sub("pri")) ≈ \(v("S"))\(sub("2")) / \(v("S"))\(sub("1"))"
        ),
        relationLabel:
          "Secondary over primary eclipse depth is approximately the ratio of the stars’ surface brightnesses",
        body:
          "Two stars cover each other twice per orbit. For circular orbits and uniformly bright stellar disks, the same area is hidden at both eclipses, so their depth ratio equals the surface-brightness ratio. Limb darkening can change this relation. *S*₁ belongs to the star hidden at the deeper, primary eclipse (the hotter one), *S*₂ to its companion; in bolometric light *S* ∝ *T*⁴.",
        tryIt: "Choose the Detached binary lab scenario and compare the two eclipse depths."
      ),
    ]
  }
}

/// Sets one concept as a panel: index, title, displayed relation, explanation, and pointer.
private struct FieldGuideCard: View {
  let number: Int
  let concept: FieldGuideConcept

  /// Builds the card with the relation between hairlines and a spoken label for it.
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(number < 10 ? "0\(number)" : "\(number)")
        .instrumentLabel()
        .accessibilityHidden(true)
      Text(concept.title).font(.deepFieldHeading).foregroundStyle(DeepField.ink)
        .accessibilityAddTraits(.isHeader)
      concept.relation
        .font(.deepFieldEquation)
        .foregroundStyle(DeepField.ink)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(DeepField.rule).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(DeepField.rule).frame(height: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(concept.relationLabel)
      Text(bodyText)
        .font(.subheadline)
        .foregroundStyle(DeepField.ink2)
        .fixedSize(horizontal: false, vertical: true)
      Text(
        "\(Text("TRY IT").font(.deepFieldLabel).tracking(1).foregroundStyle(DeepField.accent))  \(concept.tryIt)"
      )
      .font(.subheadline)
      .foregroundStyle(DeepField.ink)
      .fixedSize(horizontal: false, vertical: true)
    }
    .deepFieldPanel(padding: 20)
  }

  /// Parses the body's inline markdown italics without treating its text as a format string.
  private var bodyText: AttributedString {
    (try? AttributedString(markdown: concept.body)) ?? AttributedString(concept.body)
  }
}
