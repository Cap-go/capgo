import Foundation

/// Newline-delimited JSON ("NDJSON") status protocol emitted on **stdout** for
/// a parent process (the Capgo CLI) to forward as analytics into PostHog.
///
/// Every line is one self-describing envelope, tagged with `capgoAscKey` (the
/// protocol version) so the reader can ignore incidental stdout chatter:
///
///   {"capgoAscKey":1,"kind":"event","ts":<ms>,"runId":"…","name":"step_changed","props":{…}}
///   {"capgoAscKey":1,"kind":"result","ts":<ms>,"runId":"…","ok":true,"keyId":"…","issuerId":"…","privateKey":"…"}
///   {"capgoAscKey":1,"kind":"result","ts":<ms>,"runId":"…","ok":false,"errorCode":"USER_CANCELLED","message":"…"}
///
///   {"capgoAscKey":1,"kind":"log","ts":<ms>,"runId":"…","level":"warn","message":"…","props":{…}}
///
/// Contract:
///  - `event` lines carry only non-sensitive `props` — NEVER the private key —
///    and are forwarded to PostHog analytics.
///  - `log` lines are verbose diagnostics routed to the CLI's internal support
///    log (the bundle a user emails to support), NOT analytics. They also never
///    carry the private key.
///  - the terminal `result` line carries the credentials on success; it is the
///    only place the private key ever appears, and the CLI must not forward it
///    to analytics.
///  - free-form stderr is still tolerated but is not part of this protocol;
///    prefer a structured `log` line so it reaches the support bundle.
enum StatsProtocol {
    static let version = 1
    /// Correlates every line emitted by a single helper run.
    static let runId = UUID().uuidString
    private static let startedAt = Date()
    private static let stdout = FileHandle.standardOutput
    /// Serialises writes so lines emitted from different tasks never interleave.
    private static let queue = DispatchQueue(label: "app.capgo.asc-key.stats")
    private static var didStart = false

    /// Milliseconds since the helper started — a simple run clock.
    static func elapsedMs() -> Int {
        Int(Date().timeIntervalSince(startedAt) * 1000)
    }

    private static func writeLine(_ object: [String: Any]) {
        var line = object
        line["capgoAscKey"] = version
        line["runId"] = runId
        line["ts"] = elapsedMs()
        guard JSONSerialization.isValidJSONObject(line),
              let data = try? JSONSerialization.data(withJSONObject: line, options: [.sortedKeys]) else {
            return
        }
        queue.sync {
            stdout.write(data)
            stdout.write(Data("\n".utf8))
        }
    }

    /// Emit `helper_started` exactly once, at launch.
    static func started() {
        if didStart { return }
        didStart = true
        writeLine([
            "kind": "event",
            "name": "helper_started",
            "props": [
                "protocol_version": version,
                "os_version": ProcessInfo.processInfo.operatingSystemVersionString,
            ],
        ])
    }

    /// Emit a non-sensitive analytics event. `props` must never contain secrets.
    static func event(_ name: String, _ props: [String: Any] = [:]) {
        writeLine(["kind": "event", "name": name, "props": props])
    }

    /// Emit a verbose diagnostic line routed to the CLI's **internal support
    /// log** (NOT analytics). Use it generously for anything that helps a human
    /// diagnose a stuck/failed run after the fact — a finder that matched
    /// nothing, an unexpected navigation, the detail of a validation error.
    /// `props` must never contain the private key. `level` is one of
    /// `debug`/`info`/`warn`/`error` (the CLI defaults anything else to `info`).
    static func log(_ level: String, _ message: String, _ props: [String: Any] = [:]) {
        writeLine(["kind": "log", "level": level, "message": message, "props": props])
    }

    static func debug(_ message: String, _ props: [String: Any] = [:]) { log("debug", message, props) }
    static func info(_ message: String, _ props: [String: Any] = [:]) { log("info", message, props) }
    static func warn(_ message: String, _ props: [String: Any] = [:]) { log("warn", message, props) }
    static func error(_ message: String, _ props: [String: Any] = [:]) { log("error", message, props) }

    /// Terminal success line carrying the captured credentials.
    static func result(_ credentials: KeyCredentials) {
        writeLine([
            "kind": "result",
            "ok": true,
            "keyId": credentials.keyId,
            "issuerId": credentials.issuerId,
            "privateKey": credentials.privateKey,
        ])
    }

    /// Terminal failure line (cancellation or internal error).
    static func resultFailure(code: String, message: String) {
        writeLine(["kind": "result", "ok": false, "errorCode": code, "message": message])
    }
}
