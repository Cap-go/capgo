// swift-tools-version: 5.9
import PackageDescription

// Capgo App Store Connect API-key helper — a native macOS app that guides the
// user through creating an App Store Connect *team* API key in an embedded
// browser and emits the result + a stats protocol on stdout (see
// Sources/Models/StatsProtocol.swift). The Capgo CLI spawns the precompiled
// binary; build it with cli/scripts/build-asc-key-helper.sh.
let package = Package(
    name: "P8Extract",
    platforms: [
        .macOS(.v14),
    ],
    targets: [
        .executableTarget(
            name: "P8Extract",
            path: "Sources"
        ),
    ]
)
