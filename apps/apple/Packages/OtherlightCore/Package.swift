// swift-tools-version: 6.3
// Defines portable simulation, education, visualization, and contract products.
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
  ],
  targets: [
    .target(name: "TransitCore"),
    .target(name: "TransitEducation", dependencies: ["TransitCore"]),
    .target(name: "TransitVisualization", dependencies: ["TransitCore"]),
    .target(name: "TransitScienceContracts"),
    .target(
      name: "TransitScienceAuthoring",
      dependencies: ["TransitCore", "TransitEducation", "TransitScienceContracts"]),
  ],
  swiftLanguageModes: [.v6]
)
