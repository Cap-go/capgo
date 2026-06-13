import Foundation
import WebKit

/// Persists the embedded browser's Apple sign-in across helper launches by
/// saving and restoring the session COOKIES ourselves.
///
/// Why not `WKWebsiteDataStore(forIdentifier:)`? That persistent store requires a
/// real app identity/entitlements; in this CLI-spawned, NON-BUNDLED executable
/// macOS force-terminates the process (SIGKILL) when it's used. Manual cookie
/// persistence needs no entitlements and works anywhere.
///
/// We capture cookies via the NATIVE `WKHTTPCookieStore` — which, unlike
/// `document.cookie`, returns Apple's HttpOnly auth cookies — and re-inject them
/// on the next launch. HttpOnly only restricts JavaScript access; a re-injected
/// cookie is still sent to appstoreconnect.apple.com, so the session is restored.
/// (An earlier attempt failed because it read cookies via JS and so missed the
/// HttpOnly session cookies — only "part of" the session survived.)
///
/// The saved cookies are Apple session credentials, so the file is written 0600
/// under ~/.capgo. Set `CAPGO_ASC_KEY_FRESH_SESSION` to skip persistence for a
/// run (e.g. to sign in as a different Apple ID).
@MainActor
enum WebSessionStore {
    private static let dir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".capgo/asc-key-helper", isDirectory: true)
    private static let cookieFile = dir.appendingPathComponent("asc-cookies.json")

    /// False when the user asked for a clean, throwaway session this run.
    static let isEnabled: Bool = ProcessInfo.processInfo.environment["CAPGO_ASC_KEY_FRESH_SESSION"] == nil

    /// The web view's store stays non-persistent — WE own persistence (and this
    /// avoids the forIdentifier entitlement SIGKILL on a non-bundled binary).
    static func makeDataStore() -> WKWebsiteDataStore { .nonPersistent() }

    // MARK: - On-disk shape

    private struct StoredCookie: Codable {
        let name: String
        let value: String
        let domain: String
        let path: String
        let secure: Bool
        /// Seconds since 1970; nil = a session cookie (no explicit expiry).
        let expires: Double?
    }

    private static func appleOnly(_ cookies: [HTTPCookie]) -> [HTTPCookie] {
        cookies.filter { $0.domain.contains("apple.com") }
    }

    // MARK: - Async cookie-store bridges (completion-handler APIs always exist)

    private static func getAll(_ store: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { cont in
            store.getAllCookies { cont.resume(returning: $0) }
        }
    }

    private static func set(_ cookie: HTTPCookie, into store: WKHTTPCookieStore) async {
        await withCheckedContinuation { cont in
            store.setCookie(cookie) { cont.resume() }
        }
    }

    private static func remove(_ cookie: HTTPCookie, from store: WKHTTPCookieStore) async {
        await withCheckedContinuation { cont in
            store.delete(cookie) { cont.resume() }
        }
    }

    // MARK: - Public API

    /// Re-inject the saved Apple cookies into the web view BEFORE its first load,
    /// so a previously signed-in user lands already authenticated.
    static func restore(into webView: WKWebView) async {
        guard isEnabled,
              let data = try? Data(contentsOf: cookieFile),
              let stored = try? JSONDecoder().decode([StoredCookie].self, from: data) else {
            return
        }
        let store = webView.configuration.websiteDataStore.httpCookieStore
        for sc in stored {
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: sc.name,
                .value: sc.value,
                .domain: sc.domain,
                .path: sc.path,
            ]
            if sc.secure { props[.secure] = "TRUE" }
            if let exp = sc.expires { props[.expires] = Date(timeIntervalSince1970: exp) }
            if let cookie = HTTPCookie(properties: props) {
                await set(cookie, into: store)
            }
        }
    }

    /// Save the current Apple cookies (incl. the HttpOnly session cookies) to
    /// disk. Best-effort; called after page loads so the session is captured
    /// during the flow, before the helper exits.
    static func persist(from webView: WKWebView) async {
        guard isEnabled else { return }
        let store = webView.configuration.websiteDataStore.httpCookieStore
        let stored = appleOnly(await getAll(store)).map { c in
            StoredCookie(
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.isSecure,
                expires: c.expiresDate?.timeIntervalSince1970
            )
        }
        guard !stored.isEmpty, let data = try? JSONEncoder().encode(stored) else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: cookieFile, options: [.atomic])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: cookieFile.path)
    }

    /// Wipe the saved session (file + the live Apple cookies) — used when a stale
    /// login keeps failing, so the reload lands on a clean Apple sign-in wall.
    static func clear(from webView: WKWebView?) async {
        try? FileManager.default.removeItem(at: cookieFile)
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else { return }
        for cookie in appleOnly(await getAll(store)) {
            await remove(cookie, from: store)
        }
    }
}
