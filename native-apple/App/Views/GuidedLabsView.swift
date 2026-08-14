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
            Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
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
            Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
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
          Text(lesson.objective).font(.caption).foregroundStyle(.secondary)
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
      VStack(alignment: .leading, spacing: 16) {
        if let lesson = lessons.first(where: { $0.id == session.selectedLessonID }) {
          Text(lesson.title).font(.title2.weight(.semibold))
          Text(lesson.objective).foregroundStyle(.secondary)
        }

        if let phase = session.currentGuidedPhase {
          HStack {
            Text("Phase \(session.guidedPhaseIndex + 1) of \(session.guidedPhases.count)")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
            Spacer()
            Text(phase.title).font(.headline)
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
    }
    .onAppear {
      if let selectedLessonID { session.selectLesson(id: selectedLessonID) }
    }
    .accessibilityIdentifier("guided-lab-detail")
  }

  /// Creates one accessible response editor for the current guided phase.
  @ViewBuilder
  private func promptEditor(_ prompt: GuidedLabPrompt) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(prompt.prompt)
      TextEditor(
        text: Binding(
          get: { session.guidedResponse(for: prompt.responseKey) },
          set: { session.setGuidedResponse($0, for: prompt.responseKey) })
      )
      .frame(minHeight: 90)
      .accessibilityLabel(prompt.prompt)
      .accessibilityIdentifier("guided-response-\(prompt.id)")
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
      }
    }
  }

  /// Builds the hint depth picker and its current contextual guidance.
  private var hintControls: some View {
    GroupBox("Hint") {
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
        Text(session.guidedHintText).foregroundStyle(.secondary)
      }
    }
  }

  /// Builds the free-form comparison evidence field used by the lesson rubric.
  private var comparisonControls: some View {
    GroupBox("A/B comparison") {
      VStack(alignment: .leading, spacing: 6) {
        Text("Record one evidence-based difference between the baseline and current state.")
          .foregroundStyle(.secondary)
        TextEditor(
          text: Binding(
            get: { session.guidedComparisonObservation },
            set: { session.setGuidedComparisonObservation($0) })
        )
        .frame(minHeight: 70)
        .accessibilityLabel("A/B comparison observation")
        .accessibilityIdentifier("guided-comparison")
        .overlay {
          RoundedRectangle(cornerRadius: 6)
            .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
        }
      }
    }
  }

  /// Shows the current lesson check and response-rubric result.
  @ViewBuilder
  private func lessonProgress(report: LessonReport?) -> some View {
    if let report, let check = report.checks.first {
      Label(check.message, systemImage: check.passed ? "checkmark.circle.fill" : "circle")
        .foregroundStyle(check.passed ? .green : .secondary)
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
      .foregroundStyle(.secondary)
    }
  }

  /// Builds phase movement and completion actions with session-provided completion gating.
  private var phaseControls: some View {
    HStack {
      Button("Previous phase") { session.moveGuidedPhase(by: -1) }
        .disabled(session.guidedPhaseIndex == 0)
      Button("Next phase") { session.moveGuidedPhase(by: 1) }
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
        .font(.footnote).foregroundStyle(.secondary)
    }
  }
}
