// Converts the bundled Browser-owned real-system snapshot into native SI scenarios.
import Foundation

/// Mirrors a compact real-system catalogue snapshot before its values are converted to SI units.
public struct RealSystemSnapshotDTO: Codable, Sendable, Hashable {
  /// Mirrors one real-system catalogue entry and its source units.
  public struct SystemDTO: Codable, Sendable, Hashable {
    public let id: String
    public let label: String
    public let starRadiusSolar: Double
    public let semiMajorAxisAu: Double
    public let periodDays: Double
    public let planetRadiusJupiter: Double
    public let starMassSolar: Double?
    public let eccentricity: Double?
    public let inclinationDeg: Double?
  }
  public let systems: [SystemDTO]
}

/// Converts real-system catalogue units into a native education scenario.
public enum RealSystemSnapshotImport {
  /// Converts catalog-scale solar, AU, day, and Jupiter-radius values to the engine's SI scenario.
  public static func scenario(from system: RealSystemSnapshotDTO.SystemDTO) throws
    -> EducationScenarioV4
  {
    let solarRadius = 6.957e8
    let solarMass = 1.98847e30
    let au = 1.495978707e11
    let jupiterRadius = 7.1492e7
    return EducationScenarioV4(
      identifier: system.id,
      star: .init(
        radiusMetres: system.starRadiusSolar * solarRadius,
        massKilograms: (system.starMassSolar ?? 1) * solarMass),
      planet: .init(
        radiusMetres: system.planetRadiusJupiter * jupiterRadius,
        orbit: .init(
          semiMajorAxisMetres: system.semiMajorAxisAu * au,
          periodSeconds: system.periodDays * 86_400, eccentricity: system.eccentricity ?? 0,
          inclinationRadians: (system.inclinationDeg ?? 90) * .pi / 180)))
  }
}
