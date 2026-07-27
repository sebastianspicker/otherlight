// swift-tools-version: 6.3
// Defines the macOS-only scientific runtime and its pinned Arrow dependency.
import PackageDescription

let package = Package(
  name: "OtherlightScience",
  platforms: [.macOS(.v14)],
  products: [
    .library(name: "TransitScience", targets: ["TransitScience"])
  ],
  dependencies: [
    .package(path: "../OtherlightCore"),
    .package(
      url: "https://github.com/apache/arrow-swift.git",
      revision: "f57187964af9d073b68c2097bf088fa87f2b9509"),
  ],
  targets: [
    .target(
      name: "TransitScience",
      dependencies: [
        .product(name: "TransitScienceContracts", package: "OtherlightCore"),
        .product(name: "Arrow", package: "arrow-swift"),
      ]),
    .testTarget(
      name: "OtherlightScienceTests",
      dependencies: [
        "TransitScience",
        .product(name: "TransitScienceContracts", package: "OtherlightCore"),
        .product(name: "Arrow", package: "arrow-swift"),
      ]),
  ],
  swiftLanguageModes: [.v6]
)
