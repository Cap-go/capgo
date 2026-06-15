import Foundation

/// A team (provider) the signed-in user belongs to.
struct ASCTeam: Identifiable, Equatable {
    /// Numeric providerId — stable identity, used to compare/verify.
    let id: String
    /// publicProviderId (UUID) — required by the providerSwitchRequests API.
    let publicId: String?
    let name: String
}

/// The signed-in App Store Connect session, as reported by the same
/// `/olympus/v1/session` endpoint the ASC web app uses.
struct ASCSession: Equatable {
    let currentTeam: ASCTeam
    let teams: [ASCTeam]
    let email: String
    let role: String?
    /// Raw role strings for the current team (e.g. ["DEVELOPER", "ADMIN"]).
    let roles: [String]
    /// Per-team feature flags (e.g. contains "apiKeys" when the team has the
    /// App Store Connect API feature enabled).
    let featureFlags: [String]

    var otherTeams: [ASCTeam] {
        teams.filter { $0.id != currentTeam.id }
    }

    /// The team has turned on the App Store Connect API (the Account Holder
    /// did the one-time "Request Access" under Integrations).
    var teamHasApiEnabled: Bool { featureFlags.contains("apiKeys") }

    /// The user holds a role allowed to generate team keys.
    var userCanGenerateKeys: Bool {
        roles.contains { $0 == "ADMIN" || $0 == "ACCOUNT_HOLDER" }
    }

    /// Both gates must pass to create a team API key here.
    var canCreateKeys: Bool { teamHasApiEnabled && userCanGenerateKeys }

    /// Defensive parse — Apple doesn't document this payload, so missing
    /// fields degrade to a smaller session instead of a failure.
    static func parse(jsonText: String) -> ASCSession? {
        guard let data = jsonText.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let provider = root["provider"] as? [String: Any],
              let current = team(from: provider) else {
            return nil
        }
        let available = (root["availableProviders"] as? [[String: Any]] ?? [])
            .compactMap { team(from: $0) }
        let user = root["user"] as? [String: Any]
        let email = (user?["emailAddress"] as? String) ?? ""
        // Roles live at the root of the session payload (e.g. ["DEVELOPER",
        // "CIPS", "ADMIN"]) and mix real roles with plumbing flags.
        let roles = (root["roles"] as? [String]) ?? (user?["roles"] as? [String]) ?? []
        let featureFlags = (root["featureFlags"] as? [String]) ?? []
        return ASCSession(
            currentTeam: current,
            teams: available.isEmpty ? [current] : available,
            email: email,
            role: primaryRole(from: roles),
            roles: roles,
            featureFlags: featureFlags
        )
    }

    /// Pick the most privileged human-meaningful role; ignore plumbing
    /// entries like CIPS or CLOUD_MANAGED_APP_DISTRIBUTION.
    private static func primaryRole(from roles: [String]) -> String? {
        let ranking = [
            "ACCOUNT_HOLDER", "ADMIN", "APP_MANAGER", "DEVELOPER",
            "MARKETING", "FINANCE", "SALES", "CUSTOMER_SUPPORT",
        ]
        return ranking.first(where: roles.contains).map(prettyRole)
    }

    private static func team(from object: [String: Any]) -> ASCTeam? {
        guard let name = object["name"] as? String else { return nil }
        let numericId = (object["providerId"] as? Int).map(String.init)
            ?? (object["providerId"] as? String)
        let publicId = object["publicProviderId"] as? String
        guard let id = numericId ?? publicId else { return nil }
        return ASCTeam(id: id, publicId: publicId, name: name)
    }

    private static func prettyRole(_ raw: String) -> String {
        raw.split(separator: "_")
            .map { $0.capitalized }
            .joined(separator: " ")
    }
}
