import Foundation
import WebKit

/// Persists the embedded browser's Apple sign-in across helper launches so the
/// user doesn't sign in to App Store Connect on every run.
///
/// Uses a single, stable `WKWebsiteDataStore(forIdentifier:)` (macOS 14+), which
/// persists the FULL session — every cookie (incl. the HttpOnly auth cookies) and
/// localStorage. WebKit owns the save/load; we never touch cookies by hand.
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
///
/// The store identifier is a FIXED constant — it only has to be stable across
/// launches so WebKit reuses the same store. It is deliberately NOT read from a
/// file: an earlier file-backed UUID lived under `~/.capgo/...`, which on some
/// machines is a plain file (the CLI's config), so the write failed and a fresh
/// random UUID was generated every launch → a new store each run → nothing ever
/// persisted. A constant has no such dependency.
@MainActor
enum WebSessionStore {
    /// Stable identifier for our persistent data store. Any fixed non-zero UUID
    /// works; it's namespaced under the app's bundle-id WebKit container.
    private static let storeIdentifier = UUID(uuidString: "C40A6F1E-1B3C-4E2A-9D5B-0A1F2E3C4D55")!

    /// We persist only when running as a real `.app` (a bundle id is present);
    /// `forIdentifier` would SIGKILL a bundle-less raw binary.
    static let isPersistent: Bool = Bundle.main.bundleIdentifier != nil

    /// The persistent store — created LAZILY so `forIdentifier` is only ever
    /// invoked when we have a bundle id (a raw binary would SIGKILL here).
    private static let persistent: WKWebsiteDataStore = WKWebsiteDataStore(forIdentifier: storeIdentifier)

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
