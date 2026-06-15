import CryptoKit
import Foundation

struct ValidationFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Validates a team API key by signing an ES256 JWT and calling the official
/// App Store Connect API.
struct ASCKeyValidator {
    func validate(keyId: String, issuerId: String, privateKeyPEM: String) async throws {
        let token = try makeJWT(keyId: keyId, issuerId: issuerId, privateKeyPEM: privateKeyPEM)
        var request = URLRequest(url: URL(string: "https://api.appstoreconnect.apple.com/v1/apps?limit=1")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ValidationFailure(message: "No HTTP response from App Store Connect.")
        }
        switch http.statusCode {
        case 200...299:
            return
        case 401:
            throw ValidationFailure(message: "Apple rejected the key (401). The .p8 file may not match this Key ID / Issuer ID, or the key was revoked.")
        case 403:
            // The key authenticates; the role just limits some resources.
            return
        default:
            throw ValidationFailure(message: "Unexpected response from Apple (HTTP \(http.statusCode)).")
        }
    }

    private func makeJWT(keyId: String, issuerId: String, privateKeyPEM: String) throws -> String {
        let header: [String: String] = ["alg": "ES256", "kid": keyId, "typ": "JWT"]
        let now = Int(Date().timeIntervalSince1970)
        let payload: [String: Any] = [
            "iss": issuerId,
            "iat": now,
            "exp": now + 600,
            "aud": "appstoreconnect-v1",
        ]
        let headerPart = base64URL(try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys]))
        let payloadPart = base64URL(try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]))
        let signingInput = "\(headerPart).\(payloadPart)"

        let key: P256.Signing.PrivateKey
        do {
            key = try P256.Signing.PrivateKey(
                pemRepresentation: privateKeyPEM.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        } catch {
            throw ValidationFailure(message: "Could not parse the .p8 private key: \(error.localizedDescription)")
        }
        let signature = try key.signature(for: Data(signingInput.utf8))
        return "\(signingInput).\(base64URL(signature.rawRepresentation))"
    }

    private func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
