// swift-tools-version: 5.10
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "MyCLI",
    platforms: [
        .macOS(.v11)
    ], dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", .upToNextMajor(from: "1.4.0")),
        .package(url: "https://github.com/ZipArchive/ZipArchive.git", .upToNextMajor(from: "2.5.5"))
    ],
    targets: [
        // Targets are the basic building blocks of a package, defining a module or a test suite.
        // Targets can depend on other targets in this package and products from dependencies.
        .executableTarget(
            name: "MyCLI", 
            dependencies: [
                .product(name: "ZipArchive", package: "ZipArchive"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources",
            swiftSettings: [
                .unsafeFlags(["-parse-as-library"])
            ]
        ),
    ]
)
