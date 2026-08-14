// Defines deterministic JSON and SHA-256 representations for science provenance.
import Foundation

/// Produces canonical request and artifact fingerprints for scientific results.
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
