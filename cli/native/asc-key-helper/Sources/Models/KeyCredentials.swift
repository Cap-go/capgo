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
        deliver(credentials)
        exit(0)
    }

    /// Deliver the captured credentials to the CLI WITHOUT exiting, so the helper
    /// can show a success screen before the window closes. The terminal `result`
    /// line of the stdout stats protocol IS the credential delivery — the CLI
    /// reads keyId/issuerId/privateKey from it. NOTE: the CLI only acts on the
    /// result once the helper process exits (it resolves on `close`), so a caller
    /// that uses `deliver` MUST arrange to exit shortly after (see
    /// GuidedFlowModel's success screen + auto-close).
    static func deliver(_ credentials: KeyCredentials) {
        guard !didEmit else { return }
        savePrivateKeyCopy(credentials)
        didEmit = true
        StatsProtocol.result(credentials)
        StatsProtocol.event("helper_finished", [
            "ok": true,
            "outcome": "created",
            "total_ms": StatsProtocol.elapsedMs(),
        ])
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

    /// The user chose, on the intro/consent screen, to create the .p8 by hand
    /// instead of using the guided flow. A deliberate, non-error outcome: the CLI
    /// reads `USER_CHOSE_MANUAL` off the result line and shows the manual key
    /// instructions. Mark `didEmit` so the window-close handler doesn't also fire
    /// a contradictory USER_CANCELLED line on the way out.
    static func exitManual() {
        didEmit = true
        StatsProtocol.resultFailure(code: "USER_CHOSE_MANUAL", message: "User chose to create the .p8 manually.")
        StatsProtocol.event("helper_finished", [
            "ok": false,
            "outcome": "manual",
            "total_ms": StatsProtocol.elapsedMs(),
        ])
        exit(0)
    }

    /// Keep a copy in the fastlane/ASC conventional location, since Apple never
    /// allows the key to be downloaded again. The key is ALSO delivered on stdout
    /// (the result line) — so a copy failure doesn't lose the key for a one-shot
    /// run — but it is recorded (not silently swallowed) so a missing .p8 on
    /// resume is diagnosable.
    private static func savePrivateKeyCopy(_ credentials: KeyCredentials) {
        // Apple key IDs are alphanumeric; strip anything else so a crafted keyId
        // can't escape the directory (path traversal) via the filename.
        let safeKeyId = credentials.keyId.filter { $0.isLetter || $0.isNumber }
        guard !safeKeyId.isEmpty else {
            StatsProtocol.error("refusing to save .p8 — empty/invalid keyId after sanitization")
            return
        }
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".appstoreconnect/private_keys", isDirectory: true)
        let file = directory.appendingPathComponent("AuthKey_\(safeKeyId).p8")
        if FileManager.default.fileExists(atPath: file.path) { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // Create with 0600 from the start — no group/world-readable window
            // between writing the private key and chmod'ing it.
            let created = FileManager.default.createFile(
                atPath: file.path,
                contents: Data(credentials.privateKey.utf8),
                attributes: [.posixPermissions: 0o600]
            )
            if !created {
                throw CocoaError(.fileWriteUnknown)
            }
        } catch {
            StatsProtocol.error("could not save .p8 copy to ~/.appstoreconnect/private_keys", [
                "detail": String(describing: error),
            ])
            FileHandle.standardError.write(Data("warning: could not save key copy: \(error)\n".utf8))
        }
    }
}
