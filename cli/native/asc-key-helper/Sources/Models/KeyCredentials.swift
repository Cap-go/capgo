import Foundation

/// The final product of the guided flow. Printed as JSON on stdout.
struct KeyCredentials: Codable {
    let keyId: String
    let issuerId: String
    let privateKey: String
}

/// Emits the captured credentials exactly once and terminates the process.
/// Exit code 0 = credentials on stdout; nonzero = cancelled/failed.
enum CredentialsEmitter {
    private(set) static var didEmit = false

    static func emit(_ credentials: KeyCredentials) {
        savePrivateKeyCopy(credentials)
        didEmit = true
        // The terminal `result` line of the stdout stats protocol IS the
        // credential delivery — the CLI reads keyId/issuerId/privateKey from it.
        StatsProtocol.result(credentials)
        StatsProtocol.event("helper_finished", [
            "ok": true,
            "outcome": "created",
            "total_ms": StatsProtocol.elapsedMs(),
        ])
        exit(0)
    }

    static func exitCancelled() {
        StatsProtocol.resultFailure(code: "USER_CANCELLED", message: "Window closed before a key was delivered.")
        StatsProtocol.event("helper_finished", [
            "ok": false,
            "outcome": "cancelled",
            "total_ms": StatsProtocol.elapsedMs(),
        ])
        exit(1)
    }

    /// Keep a copy in the fastlane/ASC conventional location, since Apple
    /// never allows the key to be downloaded again.
    private static func savePrivateKeyCopy(_ credentials: KeyCredentials) {
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".appstoreconnect/private_keys", isDirectory: true)
        let file = directory.appendingPathComponent("AuthKey_\(credentials.keyId).p8")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            guard !FileManager.default.fileExists(atPath: file.path) else { return }
            try Data(credentials.privateKey.utf8).write(to: file)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch {
            FileHandle.standardError.write(Data("warning: could not save key copy: \(error)\n".utf8))
        }
    }
}
