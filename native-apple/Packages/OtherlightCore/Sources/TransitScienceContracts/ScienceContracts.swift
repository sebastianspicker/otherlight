// Defines strict, engine-neutral Scientific V5 contracts and reproducible request identity.
import Foundation

/// Centralizes finite resource and numerical limits shared by the V5 scientific contract.
public enum ScienceLimits {
  public static let maximumBodies = 3
  public static let maximumSamples = 100_000
  public static let maximumAcceptedSteps = 500_000
  public static let maximumRHSEvaluations = 8_000_000
  public static let maximumWallTimeSeconds = 60.0
  public static let gravitationalConstant = 6.67430e-11
  public static let minimumRelativeTolerance = 100 * Double.ulpOfOne
}

/// Encodes a finite three-component scientific vector as a JSON array.
public struct ScienceVector3: Codable, Equatable, Sendable {
  public let x: Double
  public let y: Double
  public let z: Double

  /// Validates exactly three finite components before creating the vector.
  public init(_ values: [Double]) throws {
    guard values.count == 3, values.allSatisfy(\.isFinite) else {
      throw ScienceContractError.invalid("vector", "exactly three finite values")
    }
    x = values[0]
    y = values[1]
    z = values[2]
  }

  /// Creates the vector from explicit Cartesian components through shared validation.
  public init(x: Double, y: Double, z: Double) throws { try self.init([x, y, z]) }
  /// Returns the JSON-array component order required by the V5 interchange contract.
  public var values: [Double] { [x, y, z] }
  /// Returns the Euclidean magnitude used for direction and barycentre validation.
  public var magnitude: Double { sqrt(x * x + y * y + z * z) }

  /// Decodes and validates the V5 JSON-array representation rather than accepting arbitrary shapes.
  public init(from decoder: Decoder) throws {
    var values = try decoder.unkeyedContainer()
    var decoded: [Double] = []
    while !values.isAtEnd { decoded.append(try values.decode(Double.self)) }
    try self.init(decoded)
  }

  /// Encodes the vector in stable x-y-z array order for cross-runtime compatibility.
  public func encode(to encoder: Encoder) throws {
    var values = encoder.unkeyedContainer()
    for value in self.values { try values.encode(value) }
  }
}

/// Enumerates the supported V5 gravitating body roles.
public enum ScientificBodyKind: String, Codable, Sendable { case star, planet, moon, companion }

/// Stores a body's barycentric SI position and velocity for a V5 request.
public struct ScientificStateV5: Codable, Equatable, Sendable {
  public let positionM: ScienceVector3
  public let velocityMps: ScienceVector3

  /// Creates one immutable state from its validated position and velocity vectors.
  public init(positionM: ScienceVector3, velocityMps: ScienceVector3) {
    self.positionM = positionM
    self.velocityMps = velocityMps
  }
}

/// Defines one finite-radius gravitating body in the strict V5 scenario contract.
public struct ScientificBodyV5: Codable, Equatable, Sendable {
  public let id: String
  public let kind: ScientificBodyKind
  public let massKg: Double
  public let radiusM: Double
  public let state: ScientificStateV5

  /// Creates a body record whose physical constraints are checked with its parent request.
  public init(
    id: String, kind: ScientificBodyKind, massKg: Double, radiusM: Double,
    state: ScientificStateV5
  ) {
    self.id = id
    self.kind = kind
    self.massKg = massKg
    self.radiusM = radiusM
    self.state = state
  }
}

/// Defines the fixed observer direction and target body for radial-velocity output.
public struct ScienceObserverV5: Codable, Equatable, Sendable {
  public let lineOfSight: ScienceVector3
  public let targetBodyId: String
  public let distanceM: Double?

  /// Creates observer metadata while leaving physical validation to the enclosing request.
  public init(lineOfSight: ScienceVector3, targetBodyId: String, distanceM: Double? = nil) {
    self.lineOfSight = lineOfSight
    self.targetBodyId = targetBodyId
    self.distanceM = distanceM
  }
}

/// Captures the numerical configuration serialized by the V5 scientific request.
public struct DOP853Settings: Codable, Equatable, Sendable {
  public let method: String
  public let positionToleranceM: Double
  public let velocityToleranceMps: Double
  public let relativeTolerance: Double
  public let maxStepSec: Double

  /// Creates DOP853 settings whose accepted values are enforced during request validation.
  public init(
    method: String = "DOP853", positionToleranceM: Double, velocityToleranceMps: Double,
    relativeTolerance: Double, maxStepSec: Double
  ) {
    self.method = method
    self.positionToleranceM = positionToleranceM
    self.velocityToleranceMps = velocityToleranceMps
    self.relativeTolerance = relativeTolerance
    self.maxStepSec = maxStepSec
  }
}

/// Collects the strict V5 system, observer, epoch, and integrator inputs.
public struct ScienceScenarioV5: Codable, Equatable, Sendable {
  public let schemaVersion: String
  public let id: String
  public let epochJdTdb: Double
  public let timeScale: String
  public let bodies: [ScientificBodyV5]
  public let observer: ScienceObserverV5
  public let integrator: DOP853Settings

  /// Creates the scenario envelope without bypassing request-level validation.
  public init(
    schemaVersion: String, id: String, epochJdTdb: Double, timeScale: String,
    bodies: [ScientificBodyV5], observer: ScienceObserverV5, integrator: DOP853Settings
  ) {
    self.schemaVersion = schemaVersion
    self.id = id
    self.epochJdTdb = epochJdTdb
    self.timeScale = timeScale
    self.bodies = bodies
    self.observer = observer
    self.integrator = integrator
  }
}

/// Represents the only supported strict V5 forward-propagation request shape.
public struct ScientificForwardRequestV5: Codable, Equatable, Sendable {
  public let kind: String
  public let scenario: ScienceScenarioV5
  public let startOffsetSec: Double
  public let endOffsetSec: Double
  public let sampleCadenceSec: Double
  public let outputs: [String]
  public let seed: Int64

  /// Creates a request whose cross-field constraints are checked by `validate()`.
  public init(
    kind: String, scenario: ScienceScenarioV5, startOffsetSec: Double, endOffsetSec: Double,
    sampleCadenceSec: Double, outputs: [String], seed: Int64
  ) {
    self.kind = kind
    self.scenario = scenario
    self.startOffsetSec = startOffsetSec
    self.endOffsetSec = endOffsetSec
    self.sampleCadenceSec = sampleCadenceSec
    self.outputs = outputs
    self.seed = seed
  }

  /// Enforces V5's serialized, physical, numerical, and resource-boundary invariants.
  public func validate() throws {
    try validateRequestKindAndScenario()
    try validateBodies()
    try validateObserver()
    try validateIntegrator()
    try validateTimingAndOutputs()
    try validateSampleGrid()
    try validateMinimumStepCount()
    try validateSeed()
    try validateBarycentreAndContact()
  }

  /// Validates the request discriminator and immutable scenario metadata.
  private func validateRequestKindAndScenario() throws {
    guard kind == "forward" else {
      throw ScienceContractError.invalid("request.kind", "exactly 'forward'")
    }
    guard scenario.schemaVersion == "v5", scenario.timeScale == "TDB" else {
      throw ScienceContractError.invalid(
        "request.scenario", "schemaVersion 'v5' and timeScale 'TDB'")
    }
    guard !scenario.id.isEmpty, scenario.id.count <= 128, scenario.epochJdTdb.isFinite,
      scenario.epochJdTdb > 0
    else { throw ScienceContractError.invalid("request.scenario", "a valid scenario id and epoch") }
  }

  /// Validates bounded, uniquely identified bodies with physical mass and radius values.
  private func validateBodies() throws {
    guard scenario.bodies.count >= 2, scenario.bodies.count <= ScienceLimits.maximumBodies else {
      throw ScienceContractError.invalid(
        "request.scenario.bodies", "between 2 and at most 3 bodies")
    }
    let identifiers = scenario.bodies.map(\.id)
    guard Set(identifiers).count == identifiers.count,
      identifiers.allSatisfy({ !$0.isEmpty && $0.count <= 128 })
    else {
      throw ScienceContractError.invalid("request.scenario.bodies", "unique non-empty ids")
    }
    for body in scenario.bodies {
      guard body.massKg.isFinite, body.massKg > 0, body.radiusM.isFinite, body.radiusM > 0 else {
        throw ScienceContractError.invalid(
          "request.scenario.bodies[\(body.id)]", "finite positive mass and radius")
      }
    }
  }

  /// Validates the observer's referenced target and normalized viewing direction.
  private func validateObserver() throws {
    let identifiers = scenario.bodies.map(\.id)
    guard identifiers.contains(scenario.observer.targetBodyId),
      !scenario.observer.targetBodyId.isEmpty
    else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.targetBodyId", "an existing body id")
    }
    let lineOfSightLength = scenario.observer.lineOfSight.magnitude
    guard abs(lineOfSightLength - 1) <= 1e-12 else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.lineOfSight", "a unit vector within 1e-12")
    }
    guard scenario.observer.distanceM.map({ $0.isFinite && $0 > 0 }) ?? true else {
      throw ScienceContractError.invalid(
        "request.scenario.observer.distanceM", "a finite positive value")
    }
  }

  /// Validates the supported DOP853 integrator and all its tolerance values.
  private func validateIntegrator() throws {
    guard scenario.integrator.method == "DOP853", scenario.integrator.positionToleranceM.isFinite,
      scenario.integrator.positionToleranceM > 0, scenario.integrator.velocityToleranceMps.isFinite,
      scenario.integrator.velocityToleranceMps > 0, scenario.integrator.relativeTolerance.isFinite,
      scenario.integrator.relativeTolerance >= ScienceLimits.minimumRelativeTolerance,
      scenario.integrator.relativeTolerance < 1, scenario.integrator.maxStepSec.isFinite,
      scenario.integrator.maxStepSec > 0
    else {
      throw ScienceContractError.invalid("request.scenario.integrator", "valid DOP853 tolerances")
    }
  }

  /// Validates the requested time window, sampling cadence, and output selection.
  private func validateTimingAndOutputs() throws {
    guard startOffsetSec.isFinite, endOffsetSec.isFinite, endOffsetSec > startOffsetSec,
      sampleCadenceSec.isFinite, sampleCadenceSec > 0
    else {
      throw ScienceContractError.invalid(
        "request", "finite ordered offsets and positive sample cadence")
    }
    guard outputs == ["radial-velocity"] else {
      throw ScienceContractError.invalid("request.outputs", "exactly ['radial-velocity']")
    }
  }

  /// Confirms that the inclusive sample grid is bounded and IEEE-754 representable.
  private func validateSampleGrid() throws {
    let validatedSampleCount = sampleCount
    guard validatedSampleCount <= ScienceLimits.maximumSamples else {
      throw ScienceContractError.invalid(
        "request", "at most \(ScienceLimits.maximumSamples) samples")
    }
    var previousSample = startOffsetSec
    for index in 1..<validatedSampleCount {
      let sample = startOffsetSec + Double(index) * sampleCadenceSec
      guard sample.isFinite, sample > previousSample else {
        throw ScienceContractError.invalid(
          "request", "a strictly increasing sample grid representable as IEEE-754 doubles")
      }
      previousSample = sample
    }
  }

  /// Rejects integrations whose required physical coverage exceeds the accepted-step budget.
  private func validateMinimumStepCount() throws {
    let minimumStepCount =
      ceil(max(0, endOffsetSec) / scenario.integrator.maxStepSec)
      + ceil(max(0, -startOffsetSec) / scenario.integrator.maxStepSec)
    guard minimumStepCount.isFinite,
      minimumStepCount <= Double(ScienceLimits.maximumAcceptedSteps)
    else {
      throw ScienceContractError.invalid(
        "request.scenario.integrator.maxStepSec",
        "at most \(ScienceLimits.maximumAcceptedSteps) required integration steps")
    }
  }

  /// Restricts persisted seeds to values that round-trip through JavaScript exactly.
  private func validateSeed() throws {
    guard seed >= -9_007_199_254_740_991, seed <= 9_007_199_254_740_991 else {
      throw ScienceContractError.invalid("request.seed", "a JavaScript-safe integer")
    }
  }

  /// Calculates the bounded inclusive output count, signaling overflow beyond the configured maximum.
  public var sampleCount: Int {
    let intervals = (endOffsetSec - startOffsetSec) / sampleCadenceSec
    guard intervals.isFinite, intervals >= 0,
      intervals < Double(ScienceLimits.maximumSamples)
    else { return ScienceLimits.maximumSamples + 1 }
    return Int(intervals.rounded(.down)) + 1
  }

  /// Verifies barycentric initial conditions and rejects starting finite-radius contact.
  private func validateBarycentreAndContact() throws {
    let totalMass = scenario.bodies.reduce(0) { $0 + $1.massKg }
    guard totalMass.isFinite else {
      throw ScienceContractError.invalid("request.scenario.bodies", "a finite total mass")
    }
    var position = [0.0, 0.0, 0.0]
    var velocity = position
    for body in scenario.bodies {
      for index in 0..<3 {
        position[index] += body.massKg * body.state.positionM.values[index]
        velocity[index] += body.massKg * body.state.velocityMps.values[index]
      }
    }
    let positionResidual = try ScienceVector3(position.map { $0 / totalMass }).magnitude
    let velocityResidual = try ScienceVector3(velocity.map { $0 / totalMass }).magnitude
    let positionScale = scenario.bodies.map { $0.state.positionM.magnitude }.max() ?? 0
    let velocityScale = scenario.bodies.map { $0.state.velocityMps.magnitude }.max() ?? 0
    guard positionResidual <= max(1e-3, positionScale * 1e-12),
      velocityResidual <= max(1e-9, velocityScale * 1e-12)
    else {
      throw ScienceContractError.invalid(
        "request.scenario.bodies", "a barycentric position and zero total momentum")
    }
    for leftIndex in scenario.bodies.indices {
      for rightIndex in scenario.bodies.indices where rightIndex > leftIndex {
        let left = scenario.bodies[leftIndex]
        let right = scenario.bodies[rightIndex]
        let displacement = zip(
          right.state.positionM.values, left.state.positionM.values
        ).map(-)
        guard displacement.allSatisfy(\.isFinite),
          (try ScienceVector3(displacement)).magnitude > left.radiusM + right.radiusM
        else {
          throw ScienceContractError.invalid(
            "request.scenario.bodies", "no initial finite-radius contact")
        }
      }
    }
  }
}

/// Classifies strict-contract failures separately from unavailable execution lanes.
public enum ScienceContractError: Error, LocalizedError, Equatable, Sendable {
  case invalid(String, String)
  case unsupportedExecution(String)
  /// Renders concise user-facing failure text while preserving the original validation path.
  public var errorDescription: String? {
    switch self {
    case .invalid(let path, let rule): "\(path) must contain \(rule)"
    case .unsupportedExecution(let message): message
    }
  }
}

/// Strict untrusted-data boundary. Synthesized `Codable` remains available for trusted values,
/// while portable workspace/import callers use this exact-key decoder.
public enum ScienceRequestCodec {
  /// Decodes untrusted JSON only after every object is checked for exact required keys.
  public static func decodeStrict(from data: Data) throws -> ScientificForwardRequestV5 {
    let raw = try JSONSerialization.jsonObject(with: data)
    let request = try object(raw, path: "request")
    try exact(
      request,
      required: [
        "kind", "scenario", "startOffsetSec", "endOffsetSec", "sampleCadenceSec", "outputs",
        "seed",
      ], path: "request")
    let scenario = try object(request["scenario"], path: "request.scenario")
    try exact(
      scenario,
      required: [
        "schemaVersion", "id", "epochJdTdb", "timeScale", "bodies", "observer", "integrator",
      ], path: "request.scenario")
    guard let bodies = scenario["bodies"] as? [Any] else {
      throw ScienceContractError.invalid("request.scenario.bodies", "an array")
    }
    for (index, rawBody) in bodies.enumerated() {
      let path = "request.scenario.bodies[\(index)]"
      let body = try object(rawBody, path: path)
      try exact(body, required: ["id", "kind", "massKg", "radiusM", "state"], path: path)
      let state = try object(body["state"], path: "\(path).state")
      try exact(state, required: ["positionM", "velocityMps"], path: "\(path).state")
    }
    let observer = try object(scenario["observer"], path: "request.scenario.observer")
    try exact(
      observer, required: ["lineOfSight", "targetBodyId"], optional: ["distanceM"],
      path: "request.scenario.observer")
    let integrator = try object(scenario["integrator"], path: "request.scenario.integrator")
    try exact(
      integrator,
      required: [
        "method", "positionToleranceM", "velocityToleranceMps", "relativeTolerance", "maxStepSec",
      ], path: "request.scenario.integrator")
    let decoded = try JSONDecoder().decode(ScientificForwardRequestV5.self, from: data)
    try decoded.validate()
    return decoded
  }

  /// Requires a JSON object at a named path before its exact schema is examined.
  public static func object(_ value: Any?, path: String) throws -> [String: Any] {
    guard let value = value as? [String: Any] else {
      throw ScienceContractError.invalid(path, "an object")
    }
    return value
  }

  /// Requires precisely the listed keys to prevent silently accepting contract extensions.
  public static func exact(
    _ value: [String: Any], required: Set<String>, optional: Set<String> = [], path: String
  ) throws {
    let actual = Set(value.keys)
    let missing = required.subtracting(actual)
    let unknown = actual.subtracting(required.union(optional))
    guard missing.isEmpty else {
      throw ScienceContractError.invalid(
        path, "required fields \(missing.sorted().joined(separator: ", "))")
    }
    guard unknown.isEmpty else {
      throw ScienceContractError.invalid(
        path, "no unsupported fields \(unknown.sorted().joined(separator: ", "))")
    }
  }
}

/// Produces deterministic request JSON and SHA-256 identifiers across supported runtimes.
public enum ScienceCanonicalJSON {
  /// Hashes the canonical strict request representation for manifest provenance.
  public static func requestFingerprint(_ request: ScientificForwardRequestV5) throws -> String {
    try request.validate()
    return SHA256.hexDigest(canonicalRequest(request).utf8)
  }

  /// Hashes raw artifact bytes so a manifest can bind exactly the emitted file.
  public static func artifactFingerprint(_ data: Data) -> String {
    SHA256.hexDigest([UInt8](data))
  }

  /// Serializes a request with stable ordering and number formatting for cross-language fingerprints.
  public static func canonicalRequest(_ request: ScientificForwardRequestV5) -> String {
    let bodies = request.scenario.bodies.map { body in
      "{\"id\":\(string(body.id)),\"kind\":\(string(body.kind.rawValue)),\"massKg\":\(number(body.massKg)),\"radiusM\":\(number(body.radiusM)),\"state\":{\"positionM\":\(vector(body.state.positionM)),\"velocityMps\":\(vector(body.state.velocityMps))}}"
    }.joined(separator: ",")
    let observerDistance =
      request.scenario.observer.distanceM.map { "\"distanceM\":\(number($0))," } ?? ""
    return
      "{\"endOffsetSec\":\(number(request.endOffsetSec)),\"kind\":\"forward\",\"outputs\":[\"radial-velocity\"],\"sampleCadenceSec\":\(number(request.sampleCadenceSec)),\"scenario\":{\"bodies\":[\(bodies)],\"epochJdTdb\":\(number(request.scenario.epochJdTdb)),\"id\":\(string(request.scenario.id)),\"integrator\":{\"maxStepSec\":\(number(request.scenario.integrator.maxStepSec)),\"method\":\"DOP853\",\"positionToleranceM\":\(number(request.scenario.integrator.positionToleranceM)),\"relativeTolerance\":\(number(request.scenario.integrator.relativeTolerance)),\"velocityToleranceMps\":\(number(request.scenario.integrator.velocityToleranceMps))},\"observer\":{\(observerDistance)\"lineOfSight\":\(vector(request.scenario.observer.lineOfSight)),\"targetBodyId\":\(string(request.scenario.observer.targetBodyId))},\"schemaVersion\":\"v5\",\"timeScale\":\"TDB\"},\"seed\":\(request.seed),\"startOffsetSec\":\(number(request.startOffsetSec))}"
  }

  /// Encodes a vector in canonical array order for request serialization.
  private static func vector(_ vector: ScienceVector3) -> String {
    "[\(vector.values.map(number).joined(separator: ","))]"
  }
  /// Escapes a string using JSON serialization so control characters retain JSON semantics.
  private static func string(_ value: String) -> String {
    var rendered = "\""
    for scalar in value.unicodeScalars {
      switch scalar.value {
      case 0x08: rendered += "\\b"
      case 0x09: rendered += "\\t"
      case 0x0a: rendered += "\\n"
      case 0x0c: rendered += "\\f"
      case 0x0d: rendered += "\\r"
      case 0x22: rendered += "\\\""
      case 0x5c: rendered += "\\\\"
      case 0x00...0x1f: rendered += String(format: "\\u%04x", scalar.value)
      default: rendered.unicodeScalars.append(scalar)
      }
    }
    return rendered + "\""
  }
  /// Formats finite doubles without locale effects or noncanonical exponential zeroes.
  private static func number(_ value: Double) -> String {
    precondition(value.isFinite)
    if value == 0 { return "0" }
    let absolute = abs(value)
    var rendered = String(value)
    if absolute >= 1e-6 && absolute < 1e21, rendered.lowercased().contains("e") {
      rendered = expandScientificNotation(rendered)
    }
    if rendered.hasSuffix(".0") { rendered.removeLast(2) }
    guard let exponentMarker = rendered.firstIndex(where: { $0 == "e" || $0 == "E" }) else {
      return rendered
    }
    let mantissa = String(rendered[..<exponentMarker])
    let exponent = Int(rendered[rendered.index(after: exponentMarker)...])!
    return "\(mantissa)e\(exponent >= 0 ? "+" : "")\(exponent)"
  }

  /// Expands scientific notation to preserve a stable decimal canonical representation.
  private static func expandScientificNotation(_ value: String) -> String {
    guard let marker = value.firstIndex(where: { $0 == "e" || $0 == "E" }),
      let exponent = Int(value[value.index(after: marker)...])
    else { return value }
    let mantissa = String(value[..<marker])
    let isNegative = mantissa.hasPrefix("-")
    let unsigned = isNegative ? String(mantissa.dropFirst()) : mantissa
    let pieces = unsigned.split(separator: ".", omittingEmptySubsequences: false)
    let integerDigits = pieces[0].count
    let digits = pieces.joined()
    let decimalPosition = integerDigits + exponent
    let magnitude: String
    if decimalPosition <= 0 {
      magnitude = "0." + String(repeating: "0", count: -decimalPosition) + digits
    } else if decimalPosition >= digits.count {
      magnitude = digits + String(repeating: "0", count: decimalPosition - digits.count)
    } else {
      let split = digits.index(digits.startIndex, offsetBy: decimalPosition)
      magnitude = String(digits[..<split]) + "." + String(digits[split...])
    }
    return (isNegative ? "-" : "") + magnitude
  }
}

/// Implements SHA-256 locally so canonical fingerprints have no runtime dependency variance.
private enum SHA256 {
  /// Converts UTF-8 text to a lowercase hexadecimal SHA-256 digest.
  static func hexDigest(_ bytes: String.UTF8View) -> String {
    hexDigest(Array(bytes))
  }
  /// Converts raw bytes to a lowercase hexadecimal SHA-256 digest.
  static func hexDigest(_ bytes: [UInt8]) -> String {
    digest(bytes).map { String(format: "%02x", $0) }.joined()
  }
  /// Performs SHA-256 block processing for canonical request and artifact fingerprints.
  static func digest(_ input: [UInt8]) -> [UInt8] {
    var message = input
    let bitLength = UInt64(message.count) * 8
    message.append(0x80)
    while message.count % 64 != 56 { message.append(0) }
    message += withUnsafeBytes(of: bitLength.bigEndian, Array.init)
    var state: [UInt32] = [
      0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a, 0x510e_527f, 0x9b05_688c, 0x1f83_d9ab,
      0x5be0_cd19,
    ]
    for offset in stride(from: 0, to: message.count, by: 64) {
      var words = [UInt32](repeating: 0, count: 64)
      for index in 0..<16 {
        words[index] = (0..<4).reduce(0) { ($0 << 8) | UInt32(message[offset + index * 4 + $1]) }
      }
      for index in 16..<64 {
        words[index] =
          sigma1(words[index - 2]) &+ words[index - 7] &+ sigma0(words[index - 15])
          &+ words[index - 16]
      }
      var a = state[0]
      var b = state[1]
      var c = state[2]
      var d = state[3]
      var e = state[4]
      var f = state[5]
      var g = state[6]
      var h = state[7]
      for index in 0..<64 {
        let t1 = h &+ big1(e) &+ choose(e, f, g) &+ constants[index] &+ words[index]
        let t2 = big0(a) &+ majority(a, b, c)
        h = g
        g = f
        f = e
        e = d &+ t1
        d = c
        c = b
        b = a
        a = t1 &+ t2
      }
      state[0] &+= a
      state[1] &+= b
      state[2] &+= c
      state[3] &+= d
      state[4] &+= e
      state[5] &+= f
      state[6] &+= g
      state[7] &+= h
    }
    return state.flatMap { withUnsafeBytes(of: $0.bigEndian, Array.init) }
  }
  /// Rotates a SHA-256 working word right by the specified number of bits.
  private static func rotate(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
  /// Selects SHA-256 bits based on the current working word.
  private static func choose(_ x: UInt32, _ y: UInt32, _ z: UInt32) -> UInt32 { (x & y) ^ (~x & z) }
  /// Computes SHA-256's majority function for three working words.
  private static func majority(_ x: UInt32, _ y: UInt32, _ z: UInt32) -> UInt32 {
    (x & y) ^ (x & z) ^ (y & z)
  }
  /// Computes SHA-256's upper-case sigma zero transform.
  private static func big0(_ x: UInt32) -> UInt32 { rotate(x, 2) ^ rotate(x, 13) ^ rotate(x, 22) }
  /// Computes SHA-256's upper-case sigma one transform.
  private static func big1(_ x: UInt32) -> UInt32 { rotate(x, 6) ^ rotate(x, 11) ^ rotate(x, 25) }
  /// Computes SHA-256's lower-case sigma zero message-schedule transform.
  private static func sigma0(_ x: UInt32) -> UInt32 { rotate(x, 7) ^ rotate(x, 18) ^ (x >> 3) }
  /// Computes SHA-256's lower-case sigma one message-schedule transform.
  private static func sigma1(_ x: UInt32) -> UInt32 { rotate(x, 17) ^ rotate(x, 19) ^ (x >> 10) }
  private static let constants: [UInt32] = [
    0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4,
    0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe,
    0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f,
    0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da, 0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7,
    0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc,
    0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
    0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070, 0x19a4_c116,
    0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
    0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7,
    0xc671_78f2,
  ]
}
