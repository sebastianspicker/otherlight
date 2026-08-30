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
