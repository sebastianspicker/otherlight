// Defines the versioned, validated workspace document used by the native education app.
import Foundation
import SwiftUI
import TransitCore
import TransitEducation
import TransitScienceContracts
import UniformTypeIdentifiers

/// Defines the native workspace document type identifiers used by SwiftUI file dialogs.
extension UTType {
  static let otherlightWorkspace = UTType(
    exportedAs: "com.sebastianspicker.Otherlight.workspace", conformingTo: .json)
  static let otherlightWorkspaceFile = UTType(filenameExtension: "otherlight", conformingTo: .json)!
  /// Preserves the registered legacy identifier when opening Transit Light Curve Lab documents.
  static let legacyTransitLabWorkspace = UTType(
    exportedAs: "com.sebastianspicker.TransitLightCurveLab.workspace", conformingTo: .json)
  static let legacyTransitLabWorkspaceFile = UTType(
    filenameExtension: "transitlab", conformingTo: .json)!
}

/// Validates and serializes the versioned workspace file used by the native app.
struct OtherlightWorkspaceDocument: FileDocument, Equatable {
  static let schemaVersion = "workspace-v1"
  /// Declares the app-owned workspace types that may be opened from disk.
  static var readableContentTypes: [UTType] {
    [
      .otherlightWorkspace,
      .otherlightWorkspaceFile,
      .legacyTransitLabWorkspace,
      .legacyTransitLabWorkspaceFile,
    ]
  }

  let workspace: OtherlightWorkspacePayload

  /// Validates a workspace before allowing it to become a writable document.
  init(workspace: OtherlightWorkspacePayload) throws {
    try workspace.validate()
    self.workspace = workspace
  }

  /// Decodes file contents supplied by SwiftUI's document-opening lifecycle.
  init(configuration: ReadConfiguration) throws {
    guard let data = configuration.file.regularFileContents else {
      throw WorkspaceDocumentError.missingContents
    }
    try self.init(data: data)
  }

  /// Strictly validates JSON shape and semantic workspace rules before decoding succeeds.
  init(data: Data) throws {
    do {
      try WorkspaceJSONShapeValidator.validate(data)
      let decoded = try JSONDecoder().decode(OtherlightWorkspacePayload.self, from: data)
      try decoded.validate()
      workspace = decoded
    } catch let error as WorkspaceDocumentError {
      throw error
    } catch {
      throw WorkspaceDocumentError.invalidJSON(error.localizedDescription)
    }
  }

  /// Produces a regular file wrapper from canonical workspace JSON.
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: try encodedData())
  }

  /// Encodes sorted, human-readable JSON for stable review and workspace persistence.
  func encodedData() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(workspace)
  }
}

/// Represents the complete versioned native workspace payload and its optional scientific branch.
struct OtherlightWorkspacePayload: Codable, Equatable, Sendable {
  let schemaVersion: String
  let productContext: ProductContext
  let education: EducationWorkspace
  let scientific: ScientificWorkspace?

  /// Creates a current-version workspace while requiring callers to supply its context and education state.
  init(
    productContext: ProductContext, education: EducationWorkspace,
    scientific: ScientificWorkspace? = nil
  ) {
    schemaVersion = OtherlightWorkspaceDocument.schemaVersion
    self.productContext = productContext
    self.education = education
    self.scientific = scientific
  }

  /// Enforces version, context, scenario, guided-lab, and scientific payload invariants.
  func validate() throws {
    try validateProductContext()
    let imported = try importedScenario()
    try validateScenario(imported)
    try validateGuidedLab()
    try validateScientificWorkspace()
  }

  /// Verifies the workspace version and the profile-dependent presence of science data.
  private func validateProductContext() throws {
    guard schemaVersion == OtherlightWorkspaceDocument.schemaVersion else {
      throw WorkspaceDocumentError.unsupportedSchemaVersion(schemaVersion)
    }
    guard productContext.hasValidStableIdentifiers,
      (productContext.profile == .scientific) == (scientific != nil)
    else { throw WorkspaceDocumentError.unsupportedProductContext }
  }

  /// Imports the browser-parity scenario while translating import errors at the document boundary.
  private func importedScenario() throws -> EducationScenarioV4 {
    do {
      return try BrowserV4Import.scenario(
        from: education.scenario, identifier: productContext.scenario)
    } catch {
      throw WorkspaceDocumentError.invalidScenarioImport(error.localizedDescription)
    }
  }

  /// Validates the imported scenario with the same native simulation engine used by a live session.
  private func validateScenario(_ scenario: EducationScenarioV4) throws {
    let issues = SimulationEngine.validate(scenario)
    guard issues.isEmpty else {
      throw WorkspaceDocumentError.invalidScenario(ValidationError(issues))
    }
  }

  /// Validates optional guided-lab state without coupling it to scenario import logic.
  private func validateGuidedLab() throws {
    if let guidedLab = education.guidedLab {
      guard guidedLab.isValid else { throw WorkspaceDocumentError.invalidGuidedLab }
    }
  }

  /// Ensures optional scientific payloads retain their strict request contract.
  private func validateScientificWorkspace() throws {
    if let scientific {
      do {
        try scientific.request.validate()
      } catch {
        throw WorkspaceDocumentError.invalidScientificRequest
      }
    }
  }

  /// Narrows general workspace validity to the interactive native education session contract.
  func validateForEducationSession() throws {
    try validate()
    guard productContext.profile == .education,
      productContext.runtime == .interactive,
      education.scenario.mode == "general-lab",
      scientific == nil
    else { throw WorkspaceDocumentError.unsupportedProductContext }
  }

  /// Imports the browser-parity scenario using the stable workspace scenario identifier.
  func educationScenario() throws -> EducationScenarioV4 {
    try BrowserV4Import.scenario(from: education.scenario, identifier: productContext.scenario)
  }
}

/// Centralizes validity checks for the persisted guided-lab payload.
extension GuidedLabWorkspace {
  /// Keeps persisted guided-lab constraints explicit and independently checkable.
  fileprivate var isValid: Bool {
    guard LessonCatalog.lessons.contains(where: { $0.id == learning.lessonID }) else {
      return false
    }
    guard learning.stepIndex >= 0, (learning.phaseIndex ?? 0) >= 0 else { return false }
    guard learning.passedStepIDs.allSatisfy(ProductContext.isStableIdentifier),
      Set(learning.passedStepIDs).count == learning.passedStepIDs.count
    else { return false }
    guard learning.lastScore.map({ $0.isFinite && $0 >= 0 }) ?? true else { return false }
    return responses.allSatisfy { entry in
      !entry.key.isEmpty && entry.key.count <= 512
        && (entry.value.primary?.count ?? 0) <= 20_000
        && (entry.value.secondary?.count ?? 0) <= 20_000
    }
  }
}

/// Captures stable product-routing identifiers that make workspace payloads self-describing.
struct ProductContext: Codable, Equatable, Sendable {
  /// Distinguishes education workspaces from scientific request workspaces.
  enum Profile: String, Codable, Sendable { case education, scientific }
  /// Identifies the product surface represented by the workspace.
  enum Mode: String, Codable, Sendable { case simulation, lab }
  /// Identifies the saved control-detail tier.
  enum Interface: String, Codable, Sendable { case essential, advanced }
  /// Records whether the selected scenario came from a preset or real-system catalog.
  enum Source: String, Codable, Sendable { case preset, real }
  /// Identifies the execution semantics required to reopen the workspace.
  enum Runtime: String, Codable, Sendable { case interactive, reference }

  let profile: Profile
  let mode: Mode
  let ui: Interface
  let source: Source
  let scenario: String
  let lab: String
  let lesson: String
  let runtime: Runtime

  /// Verifies all persisted routing identifiers use the constrained stable format.
  fileprivate var hasValidStableIdentifiers: Bool {
    Self.isStableIdentifier(scenario) && Self.isStableIdentifier(lab)
      && Self.isStableIdentifier(lesson)
  }

  /// Restricts persisted identifiers to bounded lowercase kebab-case values.
  fileprivate static func isStableIdentifier(_ value: String) -> Bool {
    guard !value.isEmpty, value.count <= 128 else { return false }
    return value.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil
  }
}

/// Holds the browser-parity scenario and optional guided-lab progress for education mode.
struct EducationWorkspace: Codable, Equatable, Sendable {
  let scenario: BrowserV4ScenarioDTO
  let guidedLab: GuidedLabWorkspace?
}

/// Persists guided-learning progress, responses, hints, and optional binary-lab state.
struct GuidedLabWorkspace: Codable, Equatable, Sendable {
  let learning: GuidedLabLearning
  let responses: [String: GuidedLabResponse]
  let hintLevel: HintLevel
  let binaryLab: BinaryLabWorkspace?
}

/// Captures durable lesson progression separately from free-form guided responses.
struct GuidedLabLearning: Codable, Equatable, Sendable {
  let lessonID: String
  let stepIndex: Int
  let phaseIndex: Int?
  let passedStepIDs: [String]
  let lastScore: Double?

  /// Maps Swift naming to the established workspace JSON field names.
  enum CodingKeys: String, CodingKey {
    case lessonID = "lessonId"
    case stepIndex, phaseIndex, lastScore
    case passedStepIDs = "passedStepIds"
  }
}

/// Stores the primary and optional secondary response for one guided prompt.
struct GuidedLabResponse: Codable, Equatable, Sendable {
  let primary: String?
  let secondary: String?
}

/// Selects a bounded progressive hint level for guided learning.
enum HintLevel: String, Codable, Equatable, Sendable, CaseIterable {
  case l1 = "L1"
  case l2 = "L2"
  case l3 = "L3"
}

/// Persists the optional binary-lab reveal state and learner hypothesis.
struct BinaryLabWorkspace: Codable, Equatable, Sendable {
  /// Names the binary-lab hypotheses available for explicit learner selection.
  enum Hypothesis: String, Codable, Sendable {
    case primaryEclipseDeepest = "primary-eclipse-deepest"
    case secondaryEclipseDominates = "secondary-eclipse-dominates"
    case eccentricityShiftsEclipseSpacing = "eccentricity-shifts-eclipse-spacing"
  }

  let revealed: Bool
  let hypothesis: Hypothesis?
}

/// Wraps a strictly validated scientific forward request when scientific profile is selected.
struct ScientificWorkspace: Codable, Equatable, Sendable {
  let request: ScientificForwardRequestV5

  /// Limits decoding to the request field so unsupported scientific fields are rejected.
  private enum CodingKeys: String, CodingKey { case request }

  /// Validates a scientific request before it becomes persistable workspace state.
  init(request: ScientificForwardRequestV5) throws {
    try request.validate()
    self.request = request
  }

  /// Decodes through the validating initializer to preserve request invariants.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedRequest = try container.decode(ScientificForwardRequestV5.self, forKey: .request)
    try decodedRequest.validate()
    request = decodedRequest
  }
}

/// Enumerates user-recoverable validation failures for workspace import and export.
enum WorkspaceDocumentError: LocalizedError {
  case missingContents
  case invalidJSON(String)
  case unsupportedSchemaVersion(String)
  case unsupportedProductContext
  case invalidScenario(ValidationError)
  case invalidScenarioImport(String)
  case invalidGuidedLab
  case invalidScientificRequest

  /// Provides specific recovery text while keeping invalid payload details bounded.
  var errorDescription: String? {
    switch self {
    case .missingContents: "The workspace file has no readable contents."
    case .invalidJSON(let message): "The workspace is not valid JSON: \(message)"
    case .unsupportedSchemaVersion(let version): "Unsupported workspace schema version: \(version)."
    case .unsupportedProductContext: "This workspace is not supported by the native education app."
    case .invalidScenario(let error):
      "The workspace scenario is invalid: \(error.localizedDescription)"
    case .invalidScenarioImport(let message): "The workspace scenario is invalid: \(message)"
    case .invalidGuidedLab: "The workspace contains unsupported guided-lab progress."
    case .invalidScientificRequest: "A scientific workspace request must be a JSON object."
    }
  }
}

/// Rejects unknown or missing JSON fields before Codable can silently accept them.
private enum WorkspaceJSONShapeValidator {
  /// Validates the complete nested workspace JSON shape, including strict science request decoding.
  static func validate(_ data: Data) throws {
    let value = try JSONSerialization.jsonObject(with: data)
    let root = try object(value, path: "workspace")
    try exact(
      root, required: ["schemaVersion", "productContext", "education"], optional: ["scientific"],
      path: "workspace")
    let product = try object(root["productContext"], path: "productContext")
    try exact(
      product,
      required: ["profile", "mode", "ui", "source", "scenario", "lab", "lesson", "runtime"],
      path: "productContext")
    let education = try object(root["education"], path: "education")
    try exact(education, required: ["scenario"], optional: ["guidedLab"], path: "education")
    let scenario = try object(education["scenario"], path: "education.scenario")
    try exact(
      scenario,
      required: ["version", "mode", "runtime", "bodies", "orbits"],
      optional: ["observer", "photometry", "dynamics", "didactics", "binaryLab", "baselineFlux"],
      path: "education.scenario")
    if let guidedValue = education["guidedLab"] {
      let guided = try object(guidedValue, path: "education.guidedLab")
      try exact(
        guided, required: ["learning", "responses", "hintLevel"], optional: ["binaryLab"],
        path: "education.guidedLab")
      let learning = try object(guided["learning"], path: "education.guidedLab.learning")
      try exact(
        learning, required: ["lessonId", "stepIndex", "passedStepIds"],
        optional: ["phaseIndex", "lastScore"], path: "education.guidedLab.learning")
      let responses = try object(guided["responses"], path: "education.guidedLab.responses")
      for (key, responseValue) in responses {
        let response = try object(responseValue, path: "education.guidedLab.responses.\(key)")
        try exact(
          response, required: [], optional: ["primary", "secondary"],
          path: "education.guidedLab.responses.\(key)")
      }
      if let binaryValue = guided["binaryLab"] {
        let binary = try object(binaryValue, path: "education.guidedLab.binaryLab")
        try exact(
          binary, required: ["revealed"], optional: ["hypothesis"],
          path: "education.guidedLab.binaryLab")
      }
    }
    if let scientificValue = root["scientific"] {
      let scientific = try object(scientificValue, path: "scientific")
      try exact(scientific, required: ["request"], path: "scientific")
      let request = try object(scientific["request"], path: "scientific.request")
      do {
        _ = try ScienceRequestCodec.decodeStrict(
          from: JSONSerialization.data(withJSONObject: request, options: [.sortedKeys]))
      } catch {
        throw WorkspaceDocumentError.invalidJSON(
          "scientific.request is invalid: \(error.localizedDescription)")
      }
    }
  }

  /// Requires an object at the given path so subsequent key checks are meaningful.
  private static func object(_ value: Any?, path: String) throws -> [String: Any] {
    guard let value = value as? [String: Any] else {
      throw WorkspaceDocumentError.invalidJSON("\(path) must be an object.")
    }
    return value
  }

  /// Enforces an exact key set to keep persisted workspace contracts forward-safe.
  private static func exact(
    _ value: [String: Any], required: Set<String>, optional: Set<String> = [], path: String
  ) throws {
    let keys = Set(value.keys)
    let missing = required.subtracting(keys)
    let unknown = keys.subtracting(required.union(optional))
    guard missing.isEmpty else {
      throw WorkspaceDocumentError.invalidJSON(
        "\(path) is missing required fields: \(missing.sorted().joined(separator: ", ")).")
    }
    guard unknown.isEmpty else {
      throw WorkspaceDocumentError.invalidJSON(
        "\(path) contains unsupported fields: \(unknown.sorted().joined(separator: ", ")).")
    }
  }
}
