import Foundation
import WebKit

/// Persists the embedded browser's Apple sign-in across helper launches, so the
/// user doesn't have to sign in to App Store Connect on every run.
///
/// Backed by a single, stable `WKWebsiteDataStore(forIdentifier:)` (macOS 14+),
/// which persists ALL website data — every cookie (including the HttpOnly auth
/// cookies Apple's sign-in relies on), localStorage, etc. — keyed by a UUID we
/// keep on disk. WebKit handles the save/load; we never touch the cookies by
/// hand. This is what avoids the partial-session problem an earlier cookie-only
/// attempt hit (only some cookies survived, so ASC rejected the session and the
/// flow oscillated). The store is independent of the app bundle, so it works for
/// the CLI-spawned, non-bundled executable.
///
/// Set `CAPGO_ASC_KEY_FRESH_SESSION` (any value) to force a clean, throwaway
/// session for this run — e.g. to sign in as a different Apple ID.
@MainActor
enum WebSessionStore {
    private static let dir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".capgo/asc-key-helper", isDirectory: true)
    private static let identifierFile = dir.appendingPathComponent("webstore.uuid")

    /// A UUID stable across launches — read from disk, or created + saved once.
    private static func stableIdentifier() -> UUID {
        if let raw = try? String(contentsOf: identifierFile, encoding: .utf8),
           let uuid = UUID(uuidString: raw.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return uuid
        }
        let uuid = UUID()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? Data(uuid.uuidString.utf8).write(to: identifierFile)
        return uuid
    }

    /// The shared persistent store. WebKit saves/loads the session under this
    /// identifier across runs, so a prior sign-in is restored automatically.
    private static let persistent: WKWebsiteDataStore = WKWebsiteDataStore(forIdentifier: stableIdentifier())

    /// True when this run reuses the persisted session (the normal case).
    static let isPersistent: Bool = ProcessInfo.processInfo.environment["CAPGO_ASC_KEY_FRESH_SESSION"] == nil

    /// The data store to hand the web view: the persistent one, or a throwaway
    /// non-persistent store when a fresh session was requested.
    static var dataStore: WKWebsiteDataStore {
        isPersistent ? persistent : .nonPersistent()
    }

    /// Wipe the saved session — used when a stale persisted login keeps failing,
    /// so the next load lands on a clean Apple sign-in wall instead of looping.
    static func clear() async {
        guard isPersistent else { return }
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        await persistent.removeData(ofTypes: types, modifiedSince: .distantPast)
    }
}
