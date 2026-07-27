// Provides deterministic, presentation-independent guided-lab progress and reporting.
import Foundation

/// Orders the increasingly explicit hints available during a guided lab.
public enum GuidedHintLevel: String, Codable, Sendable, CaseIterable {
  case l1 = "L1"
  case l2 = "L2"
  case l3 = "L3"
}
/// Defines a weighted learner prompt with a stable response-storage key.
public struct GuidedLabPrompt: Codable, Sendable, Hashable {
  public let id: String
  public let responseKey: String
  public let prompt: String
  public let weight: Double
  /// Creates a prompt whose key keeps saved responses independent of display text.
  public init(id: String, responseKey: String, prompt: String, weight: Double = 1) {
    self.id = id
    self.responseKey = responseKey
    self.prompt = prompt
    self.weight = weight
  }
}
/// Groups prompts into one navigable stage of a guided lab.
public struct GuidedLabPhase: Codable, Sendable, Hashable {
  public let id: String
  public let title: String
  public let prompts: [GuidedLabPrompt]
  /// Creates a phase from its stable identifier, title, and prompts.
  public init(id: String, title: String, prompts: [GuidedLabPrompt]) {
    self.id = id
    self.title = title
    self.prompts = prompts
  }
}
/// Stores a learner's observation while comparing two labelled lab states.
public struct GuidedLabComparison: Codable, Sendable, Hashable {
  public let leftLabel: String
  public let rightLabel: String
  public let observation: String
  /// Creates the comparison using the two displayed labels and recorded observation.
  public init(leftLabel: String, rightLabel: String, observation: String) {
    self.leftLabel = leftLabel
    self.rightLabel = rightLabel
    self.observation = observation
  }
}
/// Persists guided-lab navigation, responses, and comparison work independently of UI state.
public struct GuidedLabSession: Codable, Sendable, Hashable {
  public let lessonID: String
  public private(set) var phaseIndex: Int
  public private(set) var passedPhaseIDs: Set<String>
  public private(set) var responses: [String: String]
  public private(set) var comparison: GuidedLabComparison?
  /// Restores or starts a session while keeping all persisted progress explicit.
  public init(
    lessonID: String, phaseIndex: Int = 0, passedPhaseIDs: Set<String> = [],
    responses: [String: String] = [:], comparison: GuidedLabComparison? = nil
  ) {
    self.lessonID = lessonID
    self.phaseIndex = phaseIndex
    self.passedPhaseIDs = passedPhaseIDs
    self.responses = responses
    self.comparison = comparison
  }
  /// Stores a response under its stable prompt key for later rubric evaluation.
  public mutating func setResponse(_ response: String, for key: String) {
    responses[key] = response
  }
  /// Marks a phase as passed without inferring progress from the current screen.
  public mutating func pass(phaseID: String) { passedPhaseIDs.insert(phaseID) }
  /// Moves within the available phases while clamping untrusted navigation indices.
  public mutating func move(to index: Int, phaseCount: Int) {
    phaseIndex = min(max(index, 0), max(phaseCount - 1, 0))
  }
  /// Records the optional comparison observation for the final report.
  public mutating func setComparison(_ value: GuidedLabComparison) { comparison = value }
}
/// Summarizes weighted guided-lab progress for display and report export.
public struct GuidedRubricResult: Sendable, Equatable {
  public let score: Double
  public let earnedWeight: Double
  public let totalWeight: Double
}
/// Builds deterministic prompts, hints, scores, and Markdown for guided labs.
public enum GuidedLearning {
  /// Returns the fixed prompt phases for a lesson so progress keys remain stable.
  public static func phases(for lessonID: String) -> [GuidedLabPhase] {
    let title = LessonCatalog.lessons.first { $0.id == lessonID }?.title ?? lessonID
    return [
      .init(
        id: "observe", title: "Observe",
        prompts: [
          .init(
            id: "observation", responseKey: "\(lessonID).observe",
            prompt: "What do you observe in \(title)?")
        ]),
      .init(
        id: "explain", title: "Explain",
        prompts: [
          .init(
            id: "explanation", responseKey: "\(lessonID).explain",
            prompt: "What mechanism explains it?", weight: 2)
        ]),
    ]
  }
  /// Supplies the requested hint level without deriving content from learner responses.
  public static func hint(for level: GuidedHintLevel, lessonID: String) -> String {
    switch level {
    case .l1: return "Inspect the timing and flux change."
    case .l2: return "Compare the feature with the projected geometry."
    case .l3: return "State which physical quantity changes and why."
    }
  }
  /// Scores nonempty saved responses using the phase definitions' explicit weights.
  public static func rubric(session: GuidedLabSession) -> GuidedRubricResult {
    let prompts = phases(for: session.lessonID).flatMap(\.prompts)
    let total = prompts.reduce(0) { $0 + $1.weight }
    let earned = prompts.reduce(0) {
      $0
        + ((session.responses[$1.responseKey]?.trimmingCharacters(in: .whitespacesAndNewlines)
          .isEmpty == false) ? $1.weight : 0)
    }
    return .init(score: total == 0 ? 0 : earned / total, earnedWeight: earned, totalWeight: total)
  }
  /// Renders a portable report with a safe code fence for arbitrary response text.
  public static func markdownReport(session: GuidedLabSession) -> String {
    let fence = dynamicFence(
      for: session.responses.values.joined(separator: "\n")
        + (session.comparison?.observation ?? ""))
    let result = rubric(session: session)
    var lines = [
      "# Guided Lab Report", "", "- Lesson: \(session.lessonID)", "- Score: \(result.score)", "",
      "## Responses", "",
    ]
    for key in session.responses.keys.sorted() {
      lines += ["### \(key)", fence, session.responses[key] ?? "", fence, ""]
    }
    if let comparison = session.comparison {
      lines += [
        "## Comparison", "",
        "A (\(comparison.leftLabel)) vs B (\(comparison.rightLabel)): \(comparison.observation)",
        "",
      ]
    }
    return lines.joined(separator: "\n")
  }
  /// Chooses a fence longer than any backtick run so embedded responses remain literal.
  private static func dynamicFence(for content: String) -> String {
    let longestRun = content.split { $0 != "`" }.map(\.count).max() ?? 0
    return String(repeating: "`", count: max(3, longestRun + 1))
  }
}
