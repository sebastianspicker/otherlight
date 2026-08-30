// Produces and validates standards-compliant Arrow IPC radial-velocity artifacts.
import Arrow
import Foundation
import TransitScienceContracts

/// Writes the radial-velocity artifact contract as an Arrow IPC file.
public struct ArrowSwiftIPCWriter: ArrowIPCArtifactWriting {
  /// Creates the concrete Arrow-backed writer used only after its API is compiled.
  public init() {}

  /// Serializes validated radial-velocity samples into the fixed Arrow IPC file contract.
  public func writeRadialVelocity(timesSeconds: [Double], velocitiesMps: [Double]) throws -> Data {
    try validate(timesSeconds: timesSeconds, velocitiesMps: velocitiesMps)

    let timeBuilder: NumberArrayBuilder<Double> = try ArrowArrayBuilders.loadNumberArrayBuilder()
    let velocityBuilder: NumberArrayBuilder<Double> =
      try ArrowArrayBuilders.loadNumberArrayBuilder()
    for (time, velocity) in zip(timesSeconds, velocitiesMps) {
      timeBuilder.append(time)
      velocityBuilder.append(velocity)
    }

    let timeArray = ArrowArrayHolderImpl(try timeBuilder.finish())
    let velocityArray = ArrowArrayHolderImpl(try velocityBuilder.finish())
    let recordBatch = try RecordBatch.Builder()
      .addColumn("time_offset_s", arrowArray: timeArray)
      .addColumn("radial_velocity_m_s", arrowArray: velocityArray)
      .finish()
      .get()
    let info = ArrowWriter.Info(.recordbatch, schema: recordBatch.schema, batches: [recordBatch])
    return try writeStandardsCompliantFile(
      info, expectedTimes: timesSeconds, expectedVelocities: velocitiesMps)
  }

  /// Uses Arrow's file writer and rejects output that lacks required IPC markers or round-trip fidelity.
  private func writeStandardsCompliantFile(
    _ info: ArrowWriter.Info, expectedTimes: [Double], expectedVelocities: [Double]
  ) throws -> Data {
    let fileManager = FileManager.default
    let directory = fileManager.temporaryDirectory.appendingPathComponent(
      "transit-science-arrow-\(UUID().uuidString)", isDirectory: true)
    let file = directory.appendingPathComponent("radial-velocity.arrow", isDirectory: false)
    do {
      try fileManager.createDirectory(at: directory, withIntermediateDirectories: false)
      defer { try? fileManager.removeItem(at: directory) }
      _ = try ArrowWriter().toFile(file, info: info).get()
      let data = try Data(contentsOf: file, options: [.mappedIfSafe])
      let marker = Data("ARROW1".utf8)
      guard data.starts(with: marker), data.suffix(marker.count) == marker else {
        throw ScienceContractError.unsupportedExecution(
          "Arrow Swift produced bytes without the required Arrow IPC file markers")
      }
      try validateWrittenFile(
        file, expectedTimes: expectedTimes, expectedVelocities: expectedVelocities)
      return data
    } catch let error as ScienceContractError {
      throw error
    } catch {
      throw ScienceContractError.unsupportedExecution(
        "Arrow IPC file writing failed: \(error.localizedDescription)")
    }
  }

  /// Reopens the temporary IPC file to prove its schema and values match the requested artifact.
  private func validateWrittenFile(
    _ file: URL, expectedTimes: [Double], expectedVelocities: [Double]
  ) throws {
    let batches = try ArrowReader().fromFile(file).get().batches
    guard batches.count == 1, let batch = batches.first,
      batch.length == expectedTimes.count, batch.columns.count == 2,
      batch.schema.fields.map(\.name) == ["time_offset_s", "radial_velocity_m_s"],
      batch.schema.fields.allSatisfy({ $0.type.info == ArrowType.ArrowDouble }),
      batch.columns.allSatisfy({ $0.nullCount == 0 })
    else {
      throw ScienceContractError.unsupportedExecution(
        "Arrow Swift produced a file that does not match radial-velocity-v1")
    }
    for index in expectedTimes.indices {
      let arrowIndex = UInt(index)
      guard let time = batch.columns[0].array.asAny(arrowIndex) as? Double,
        let velocity = batch.columns[1].array.asAny(arrowIndex) as? Double,
        time == expectedTimes[index], velocity == expectedVelocities[index]
      else {
        throw ScienceContractError.unsupportedExecution(
          "Arrow Swift changed radial-velocity-v1 values during file round-trip")
      }
    }
  }

  /// Rejects malformed sample series before handing values to the Arrow implementation.
  private func validate(timesSeconds: [Double], velocitiesMps: [Double]) throws {
    guard timesSeconds.count == velocitiesMps.count else {
      throw ScienceContractError.invalid("arrow.radialVelocity", "equal time and velocity counts")
    }
    guard !timesSeconds.isEmpty else {
      throw ScienceContractError.invalid("arrow.radialVelocity", "at least one sample")
    }
    guard timesSeconds.count <= ScienceLimits.maximumSamples else {
      throw ScienceContractError.invalid(
        "arrow.radialVelocity", "at most \(ScienceLimits.maximumSamples) samples")
    }
    guard timesSeconds.allSatisfy(\.isFinite), velocitiesMps.allSatisfy(\.isFinite) else {
      throw ScienceContractError.invalid("arrow.radialVelocity", "finite time and velocity samples")
    }
    guard zip(timesSeconds, timesSeconds.dropFirst()).allSatisfy({ $0.0 < $0.1 }) else {
      throw ScienceContractError.invalid(
        "arrow.radialVelocity.timesSeconds", "strictly increasing representable sample times")
    }
  }
}
