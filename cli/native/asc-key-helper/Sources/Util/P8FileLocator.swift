import AppKit
import Foundation
import UniformTypeIdentifiers

/// Finds AuthKey .p8 files in the places people (and fastlane) conventionally keep them.
enum P8FileLocator {
    static func conventionalDirectories() -> [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        return [
            cwd.appendingPathComponent("private_keys"),
            home.appendingPathComponent("private_keys"),
            home.appendingPathComponent(".private_keys"),
            home.appendingPathComponent(".appstoreconnect/private_keys"),
            home.appendingPathComponent("Downloads"),
        ]
    }

    static func locate(keyId: String) -> URL? {
        let fileName = "AuthKey_\(keyId).p8"
        return conventionalDirectories()
            .map { $0.appendingPathComponent(fileName) }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    static func presentOpenPanel(completion: @escaping (URL?) -> Void) {
        let panel = NSOpenPanel()
        panel.title = "Select your AuthKey .p8 file"
        panel.allowedContentTypes = [UTType(filenameExtension: "p8") ?? .item]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads")
        panel.begin { response in
            completion(response == .OK ? panel.url : nil)
        }
    }
}
