// swift-tools-version: 6.3
// Defines portable simulation, education, visualization, contract, benchmark, and test products.
import PackageDescription

let package = Package(
  name: "OtherlightCore",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [
    .library(name: "TransitCore", targets: ["TransitCore"]),
    .library(name: "TransitEducation", targets: ["TransitEducation"]),
    .library(name: "TransitVisualization", targets: ["TransitVisualization"]),
    .library(name: "TransitScienceContracts", targets: ["TransitScienceContracts"]),
    .library(name: "TransitScienceAuthoring", targets: ["TransitScienceAuthoring"]),
    .executable(name: "OtherlightBenchmark", targets: ["OtherlightBenchmark"]),
  ],
  targets: [
    .target(name: "TransitCore"),
    .target(name: "TransitEducation", dependencies: ["TransitCore"]),
    .target(name: "TransitVisualization", dependencies: ["TransitCore"]),
    .target(name: "TransitScienceContracts"),
    .target(
      name: "TransitScienceAuthoring",
      dependencies: ["TransitCore", "TransitEducation", "TransitScienceContracts"]),
    .executableTarget(
      name: "OtherlightBenchmark", dependencies: ["TransitCore", "TransitEducation"]),
    .testTarget(
      name: "OtherlightCoreTests",
      dependencies: [
        "TransitCore", "TransitEducation", "TransitVisualization", "TransitScienceContracts",
        "TransitScienceAuthoring",
      ]),
  ],
  swiftLanguageModes: [.v6]
)
