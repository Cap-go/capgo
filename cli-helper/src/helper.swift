// helper.swift
//
// Capgo helper: export ONE iOS signing identity from the user's Keychain as a
// PKCS#12 blob. Always emits a single line of JSON on stdout describing the
// outcome — successful or otherwise — so the Node caller never has to parse
// stderr or guess from exit codes.
//
// Usage:
//   helper keychain-export --sha1 <40-hex-char-cert-sha1>
//                          --output <path-to-output.p12>
//                          --invoked-by capgo-cli
//   The PKCS#12 wrap passphrase is read as ONE line from stdin (never argv, so
//   it does not appear in `ps`). The caller writes "<passphrase>\n" then closes.
//
// JSON output (single line on stdout, ALWAYS emitted before exit):
//
//   Success:
//     {"ok":true,"p12Path":"/tmp/x.p12","p12SizeBytes":4096,"identityName":"Apple Distribution: …"}
//
//   Failure:
//     {"ok":false,"errorCode":"USER_DENIED","message":"…","osStatus":-128}
//     {"ok":false,"errorCode":"NO_IDENTITY","message":"…"}
//     {"ok":false,"errorCode":"INVALID_ARGS","message":"…"}
//     {"ok":false,"errorCode":"FORBIDDEN_CALLER","message":"…"}
//     {"ok":false,"errorCode":"EXPORT_FAILED","message":"…","osStatus":-12345}
//     {"ok":false,"errorCode":"WRITE_FAILED","message":"…"}
//     {"ok":false,"errorCode":"INTERNAL","message":"…"}
//
// Exit codes (still emitted for shell-style consumers):
//   0 — success
//   1 — generic / internal error
//   2 — argument parsing error (INVALID_ARGS)
//   3 — no identity matching the given SHA1 (NO_IDENTITY)
//   4 — user denied macOS Keychain access (USER_DENIED)
//   5 — caller not permitted (FORBIDDEN_CALLER)
// Why we use SecItemExport(.formatPKCS12) and accept the 2 prompts:
//   Xcode-imported signing keys are non-extractable (kSecKeyExtractable=false).
//   `SecKeyCopyExternalRepresentation` rejects them with
//   CSSMERR_CSP_INVALID_KEYATTR_MASK. PKCS#12 wrapped export is the only
//   non-GUI path that works on these keys. macOS asks the user twice on first
//   run — once for "access" ACL, once for "export" ACL — but caches both
//   "Always Allow" decisions, so subsequent runs are silent.
//
// Build:
//   swiftc helper.swift -framework Security -o helper
//
// Tested on macOS 11+ (Swift 5.5+, CryptoKit available).

import CryptoKit
import Foundation
import Security

// MARK: - Output (always JSON on stdout, always before exit)

/// JSON-escape a string for embedding in our hand-rolled JSON output. We
/// avoid Foundation's JSONSerialization for output to keep the line shape
/// fully predictable (one line, no spaces, ASCII only when possible).
func jsonEscape(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count)
    for scalar in s.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        case "\u{08}": out += "\\b"
        case "\u{0C}": out += "\\f"
        default:
            if scalar.value < 0x20 {
                out += String(format: "\\u%04x", scalar.value)
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
    }
    return out
}

/// Emit a JSON line to stdout and exit. NEVER call exit() any other way.
func emitSuccessAndExit(p12Path: String, p12SizeBytes: Int, identityName: String) -> Never {
    let json = "{\"ok\":true,"
        + "\"p12Path\":\"\(jsonEscape(p12Path))\","
        + "\"p12SizeBytes\":\(p12SizeBytes),"
        + "\"identityName\":\"\(jsonEscape(identityName))\""
        + "}"
    print(json)
    exit(0)
}

func emitFailureAndExit(
    code: Int32,
    errorCode: String,
    message: String,
    osStatus: OSStatus? = nil
) -> Never {
    var json = "{\"ok\":false,"
        + "\"errorCode\":\"\(jsonEscape(errorCode))\","
        + "\"message\":\"\(jsonEscape(message))\""
    if let s = osStatus {
        json += ",\"osStatus\":\(s)"
    }
    json += "}"
    print(json)
    exit(code)
}

// MARK: - Top-level fatal handler
//
// If anything in main throws, traps, or hits an uncaught issue, we want to at
// least emit a JSON line. Swift doesn't have an easy uncaught-exception hook,
// so the pattern is: wrap all real work in do/catch + use guard everywhere
// instead of force-unwrap. There are still ways to crash Swift (e.g. real
// SIGSEGV from a corrupted heap), but in practice anything reachable from our
// code is recoverable into a JSON failure line.

enum KeychainExportError: Error {
    case invalidArgs(String)
    case noIdentity(String)
    case userDenied(OSStatus, String)
    case exportFailed(OSStatus, String)
    case writeFailed(String)
    case copyFailed(OSStatus, String)
    case forbiddenCaller(String)
}

extension KeychainExportError {
    var errorCode: String {
        switch self {
        case .invalidArgs: return "INVALID_ARGS"
        case .noIdentity: return "NO_IDENTITY"
        case .userDenied: return "USER_DENIED"
        case .exportFailed: return "EXPORT_FAILED"
        case .writeFailed: return "WRITE_FAILED"
        case .copyFailed: return "EXPORT_FAILED"
        case .forbiddenCaller: return "FORBIDDEN_CALLER"
        }
    }
    var exitCode: Int32 {
        switch self {
        case .invalidArgs: return 2
        case .noIdentity: return 3
        case .userDenied: return 4
        case .forbiddenCaller: return 5
        default: return 1
        }
    }
    var message: String {
        switch self {
        case let .invalidArgs(m), let .noIdentity(m), let .writeFailed(m), let .forbiddenCaller(m): return m
        case let .userDenied(_, m), let .exportFailed(_, m), let .copyFailed(_, m): return m
        }
    }
    var osStatus: OSStatus? {
        switch self {
        case let .userDenied(s, _), let .exportFailed(s, _), let .copyFailed(s, _): return s
        default: return nil
        }
    }
}

func emitFailureAndExit(_ error: KeychainExportError) -> Never {
    emitFailureAndExit(
        code: error.exitCode,
        errorCode: error.errorCode,
        message: error.message,
        osStatus: error.osStatus
    )
}

func describeStatus(_ status: OSStatus) -> String {
    let secMessage = SecCopyErrorMessageString(status, nil) as String? ?? "(no description)"
    return "\(secMessage) [OSStatus \(status)]"
}

// MARK: - Args

struct Args {
    var sha1Hex: String = ""
    var outputPath: String = ""
    var invokedBy: String = ""
    // The PKCS#12 wrap passphrase is NOT an argv flag — it is read from stdin
    // (see readPassphraseFromStdin) so it never appears in `ps`/argv.
}

func parseArgs(_ cli: [String]) throws -> Args {
    var args = Args()
    var i = 0
    while i < cli.count {
        let flag = cli[i]
        i += 1
        guard i < cli.count else {
            throw KeychainExportError.invalidArgs("Missing value for \(flag)")
        }
        let value = cli[i]
        i += 1
        switch flag {
        case "--sha1": args.sha1Hex = value.lowercased()
        case "--output": args.outputPath = value
        case "--invoked-by": args.invokedBy = value
        default: throw KeychainExportError.invalidArgs("Unknown argument: \(flag)")
        }
    }
    if args.sha1Hex.isEmpty {
        throw KeychainExportError.invalidArgs("Required: --sha1 <40-hex-char-cert-sha1>")
    }
    if args.outputPath.isEmpty {
        throw KeychainExportError.invalidArgs("Required: --output <path>")
    }
    if args.sha1Hex.count != 40 || args.sha1Hex.range(of: "^[0-9a-f]{40}$", options: .regularExpression) == nil {
        throw KeychainExportError.invalidArgs("--sha1 must be 40 lowercase hex chars (got \"\(args.sha1Hex)\")")
    }
    return args
}

/// Read the PKCS#12 wrap passphrase as a single line from stdin. Kept off argv
/// so it never shows up in `ps`/argv. The Node caller writes "<passphrase>\n"
/// then closes stdin.
func readPassphraseFromStdin() throws -> String {
    guard let line = readLine(strippingNewline: true), !line.isEmpty else {
        throw KeychainExportError.invalidArgs("Required: PKCS#12 wrap passphrase on stdin (one line).")
    }
    return line
}

// MARK: - SHA1 of cert DER (matches `security find-identity` output)

func sha1OfCertDer(_ cert: SecCertificate) -> String {
    let derData = SecCertificateCopyData(cert) as Data
    let hash = Insecure.SHA1.hash(data: derData)
    return hash.map { String(format: "%02x", $0) }.joined()
}

func subjectName(of cert: SecCertificate) -> String {
    var commonName: CFString?
    let status = SecCertificateCopyCommonName(cert, &commonName)
    if status == errSecSuccess, let cn = commonName as String? { return cn }
    return SecCertificateCopySubjectSummary(cert) as String? ?? "(unknown)"
}

// MARK: - Find identity by cert SHA1

func findIdentityBySha1(_ targetSha1: String) throws -> (SecIdentity, String) {
    let query: [String: Any] = [
        kSecClass as String: kSecClassIdentity,
        kSecReturnRef as String: true,
        kSecMatchLimit as String: kSecMatchLimitAll,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound {
        throw KeychainExportError.noIdentity(
            "No identity with cert SHA1 \(targetSha1) found (keychain has no identities at all)."
        )
    }
    if status != errSecSuccess {
        throw KeychainExportError.copyFailed(status, "SecItemCopyMatching(identities) failed: \(describeStatus(status))")
    }
    guard let identities = result as? [SecIdentity] else {
        throw KeychainExportError.copyFailed(0, "SecItemCopyMatching returned an unexpected type")
    }

    for identity in identities {
        var maybeCert: SecCertificate?
        let copyStatus = SecIdentityCopyCertificate(identity, &maybeCert)
        if copyStatus != errSecSuccess { continue }
        guard let cert = maybeCert else { continue }
        if sha1OfCertDer(cert) == targetSha1 {
            return (identity, subjectName(of: cert))
        }
    }
    throw KeychainExportError.noIdentity(
        "No identity with cert SHA1 \(targetSha1) found in any keychain in your default search list."
    )
}

// MARK: - Export to PKCS#12

func exportIdentityAsPkcs12(_ identity: SecIdentity, passphrase: String) throws -> Data {
    let cfPass: CFString = passphrase as CFString
    var keyParams = SecItemImportExportKeyParameters()
    keyParams.version = UInt32(SEC_KEY_IMPORT_EXPORT_PARAMS_VERSION)
    keyParams.passphrase = Unmanaged.passUnretained(cfPass)

    var exportedData: CFData?
    // Unmanaged.passUnretained does NOT bump cfPass's retain count — the Security
    // framework borrows the string for the duration of the call. Hold it alive
    // explicitly with withExtendedLifetime so the optimizer can't release it
    // before SecItemExport returns (a use-after-free otherwise).
    let status = withExtendedLifetime(cfPass) {
        withUnsafePointer(to: &keyParams) { paramsPtr in
            SecItemExport(
                identity,
                .formatPKCS12,
                SecItemImportExportFlags(rawValue: 0),
                paramsPtr,
                &exportedData
            )
        }
    }

    // Treat user-denied / canceled distinctly so the caller can offer retry
    // vs. fall back to a different path. -128 is errSecUserCanceled (raw
    // value not always present in Swift's enum on older SDKs, hence direct
    // comparison).
    if status == errSecAuthFailed || status == errSecUserCanceled || status == -128 {
        throw KeychainExportError.userDenied(
            status,
            "macOS Keychain access was denied by the user. \(describeStatus(status))"
        )
    }
    if status != errSecSuccess {
        throw KeychainExportError.exportFailed(
            status,
            "SecItemExport failed: \(describeStatus(status))"
        )
    }
    guard let data = exportedData else {
        throw KeychainExportError.exportFailed(0, "SecItemExport returned nil data with success status")
    }

    return data as Data
}

// MARK: - Disk write

func writeP12(_ data: Data, to path: String) throws {
    do {
        try data.write(to: URL(fileURLWithPath: path), options: .atomic)
    } catch {
        throw KeychainExportError.writeFailed(
            "Failed to write P12 to \(path): \(error.localizedDescription)"
        )
    }
    // The file holds a signing private key. Restrict it to 0600; if that fails,
    // delete it and fail loudly — never leave a world/group-readable key behind
    // while reporting success (the Node caller only reads our JSON, not stderr).
    do {
        try FileManager.default.setAttributes(
            [.posixPermissions: NSNumber(value: Int16(0o600))],
            ofItemAtPath: path
        )
    } catch {
        try? FileManager.default.removeItem(atPath: path)
        throw KeychainExportError.writeFailed(
            "Wrote P12 to \(path) but could not restrict it to 0600 "
                + "(\(error.localizedDescription)); removed it to avoid leaving a readable private key."
        )
    }
}

// MARK: - Caller gate (anti-footgun; NOT a security boundary — see SECURITY.md)
//
// Stops casual / accidental / naive-script invocation of the sensitive
// export path. It does NOT stop a determined local attacker, who can read the
// handshake straight out of the open-source CLI (or call Apple's keychain APIs
// directly). The macOS Keychain ACL is the real boundary.
func enforceCallerGate(_ args: Args) throws {
    guard args.invokedBy == "capgo-cli" else {
        throw KeychainExportError.forbiddenCaller(
            "Refusing to run: missing or invalid --invoked-by handshake."
        )
    }
    guard isatty(STDOUT_FILENO) == 0 else {
        throw KeychainExportError.forbiddenCaller(
            "Refusing to run with an interactive (TTY) stdout."
        )
    }
}

// MARK: - Main

do {
    let argv = CommandLine.arguments
    guard argv.count >= 2 else {
        throw KeychainExportError.invalidArgs("Missing subcommand. Usage: helper <subcommand> …")
    }
    switch argv[1] {
    case "keychain-export":
        let args = try parseArgs(Array(argv.dropFirst(2)))
        try enforceCallerGate(args)
        let passphrase = try readPassphraseFromStdin()
        let (identity, identityName) = try findIdentityBySha1(args.sha1Hex)
        let p12 = try exportIdentityAsPkcs12(identity, passphrase: passphrase)
        try writeP12(p12, to: args.outputPath)
        emitSuccessAndExit(p12Path: args.outputPath, p12SizeBytes: p12.count, identityName: identityName)
    default:
        throw KeychainExportError.invalidArgs("Unknown subcommand: \(argv[1])")
    }
} catch let error as KeychainExportError {
    emitFailureAndExit(error)
} catch {
    emitFailureAndExit(
        code: 1,
        errorCode: "INTERNAL",
        message: "Unhandled error: \(error.localizedDescription)"
    )
}
