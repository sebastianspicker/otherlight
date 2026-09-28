// Defines the bounded Browser V4 serialized envelope without interpreting it.
import Foundation

/// The bounded browser V4 input shape used by the active education fixtures.
/// Unknown browser fields are intentionally ignored; incompatible versions fail closed.
public struct BrowserV4ScenarioDTO: Codable, Sendable, Hashable {
  /// Mirrors the browser V4 orbit field names without changing their serialized contract.
  public struct OrbitDTO: Codable, Sendable, Hashable {
    public let a: Double
    public let e: Double
    public let inc: Double
    public let longitudeOfAscendingNode: Double
    public let omega: Double
    public let period: Double
    public let t0: Double
    /// Maps Swift property names to the browser V4 wire-field names.
    enum CodingKeys: String, CodingKey {
      case a, e, inc, omega, period, t0
      case longitudeOfAscendingNode = "Omega"
    }
  }
  /// Mirrors a browser V4 star record.
  public struct StarDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let luminosityScale: Double?
  }
  /// Mirrors a browser V4 planet record and its parent references.
  public struct PlanetDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let orbit: OrbitDTO
    public let parentStarId: String?
    public let parentSystem: String?
  }
  /// Mirrors a browser V4 moon record and its planet reference.
  public struct MoonDTO: Codable, Sendable, Hashable {
    public let id: String
    public let r: Double
    public let m: Double
    public let orbit: OrbitDTO
    public let parentPlanetId: String?
  }
  /// Groups browser V4 body arrays by physical kind.
  public struct BodiesDTO: Codable, Sendable, Hashable {
    public let stars: [StarDTO]
    public let planets: [PlanetDTO]
    public let moons: [MoonDTO]
  }
  /// Carries the two browser V4 quadratic limb-darkening coefficients.
  public struct LimbDarkeningDTO: Codable, Sendable, Hashable {
    public let u1: Double
    public let u2: Double
  }
  /// Retains the browser V4 default limb-darkening envelope.
  public struct LimbDarkeningModelDTO: Codable, Sendable, Hashable {
    public let `default`: LimbDarkeningDTO
  }
  /// Mirrors browser V4 phase-curve names for compatibility.
  public struct PhaseCurveDTO: Codable, Sendable, Hashable {
    public let enabled: Bool?
    public let reflAmp: Double?
    public let thermAmp: Double?
    public let reflOffset: Double?
    public let thermOffset: Double?
    public let constant: Double?
    public let reflModel: String?
    public let thermalModel: String?
    public let lambertian: Bool?
    public let clamp: Bool?
    public let physicalScaling: Bool?
  }
  /// Collects optional browser V4 photometry settings.
  public struct PhotometryDTO: Codable, Sendable, Hashable {
    public let gridRes: Int?
    public let limbDarkeningModel: LimbDarkeningModelDTO?
    public let phaseCurve: PhaseCurveDTO?
    public let moonPhaseCurve: PhaseCurveDTO?
  }
  /// Carries the browser V4 active-lesson selection.
  public struct DidacticsDTO: Codable, Sendable, Hashable { public let activeLessonId: String? }
  /// Mirrors the V4 detached-binary learner gates without adding native-only fields.
  public struct BinaryLabDTO: Codable, Sendable, Hashable {
    public let enabled: Bool
    public let hideSkyUntilReveal: Bool
    public let requireHypothesis: Bool
    public let lockParamsUntilHypothesis: Bool
    /// Creates a V4 binary-lab envelope from its learner-gate settings.
    public init(
      enabled: Bool, hideSkyUntilReveal: Bool, requireHypothesis: Bool,
      lockParamsUntilHypothesis: Bool
    ) {
      self.enabled = enabled
      self.hideSkyUntilReveal = hideSkyUntilReveal
      self.requireHypothesis = requireHypothesis
      self.lockParamsUntilHypothesis = lockParamsUntilHypothesis
    }
  }
  /// Mirrors browser V4 runtime metadata without interpreting it as native behavior.
  public struct RuntimeDTO: Codable, Sendable, Hashable {
    public let mode: String
    public let executionMode: String
    public let referenceSubsteps: Int?
  }
  /// Carries the browser V4 observer direction.
  public struct ObserverDTO: Codable, Sendable, Hashable { public let dir: Vector3 }
  /// Represents one browser V4 parent-child body relationship.
  public struct HierarchyDTO: Codable, Sendable, Hashable {
    public let childId: String
    public let parentId: String
    public let relation: String
  }
  /// Groups browser V4 binary and hierarchy orbit metadata.
  public struct OrbitsDTO: Codable, Sendable, Hashable {
    public let binary: OrbitDTO
    public let hierarchy: [HierarchyDTO]
  }
  public let version: String
  public let mode: String
  public let runtime: RuntimeDTO?
  public let observer: ObserverDTO?
  public let bodies: BodiesDTO
  public let orbits: OrbitsDTO?
  public let photometry: PhotometryDTO?
  public let didactics: DidacticsDTO?
  public let binaryLab: BinaryLabDTO?
}
