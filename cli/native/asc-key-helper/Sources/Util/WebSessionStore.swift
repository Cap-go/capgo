import Foundation
import WebKit

/// Persists the embedded browser's Apple sign-in across helper launches so the
/// user doesn't sign in to App Store Connect on every run.
///
/// Uses a single, stable `WKWebsiteDataStore(forIdentifier:)` (macOS 14+), which
/// persists the FULL session — every cookie (incl. the HttpOnly auth cookies) and
/// localStorage — keyed by a UUID we keep on disk. WebKit owns the save/load; we
/// never touch cookies by hand.
///
/// `forIdentifier` needs a real app container: when the helper runs as an `.app`
/// (it has a bundle identifier) WebKit persists to `~/Library/WebKit/<bundle-id>/`
/// and everything works. A bundle-LESS raw executable has no container, so macOS
/// force-terminates the process (SIGKILL) the moment the store is created — so we
/// persist ONLY when a bundle identifier is present, and create the persistent
/// store LAZILY (a raw dev binary never calls `forIdentifier`, falling back to a
/// throwaway session). No flags needed: ship/sign the helper as an `.app` and
/// persistence is automatic (see scripts/sign-asc-key-helper-dev.sh for local
/// dev). To start fresh, delete `~/Library/WebKit/<bundle-id>/`.
@MainActor
enum WebSessionStore {
    private static let dir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".capgo/asc-key-helper", isDirectory: true)
    private static let identifierFile = dir.appendingPathComponent("webstore.uuid")

    /// We persist only when running as a real `.app` (a bundle id is present);
    /// `forIdentifier` would SIGKILL a bundle-less raw binary.
    static let isPersistent: Bool = Bundle.main.bundleIdentifier != nil

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

    /// The persistent store — created LAZILY so `forIdentifier` is only ever
    /// invoked when we have a bundle id (a raw binary would SIGKILL here).
    private static let persistent: WKWebsiteDataStore = WKWebsiteDataStore(forIdentifier: stableIdentifier())

    /// The store to hand the web view: the persistent one when running as an
    /// `.app`, else a throwaway non-persistent store (never touches `forIdentifier`).
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
