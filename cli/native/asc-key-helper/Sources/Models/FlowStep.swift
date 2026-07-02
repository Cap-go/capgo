import Foundation

/// Steps for obtaining a TEAM App Store Connect API key.
/// Adapted from AppStoreConnectKit (https://github.com/MortenGregersen/AppStoreConnectKit),
/// MIT License, © Morten Bjerg Gregersen. See THIRD-PARTY-LICENSES.md.
enum FlowStep: Int, CaseIterable, Comparable, Hashable {
    case login
    case selectTeam
    case verifyAccess
    case captureIssuerId
    case createKey
    case nameKey
    case selectRole
    case generateKey
    case captureKeyId
    case downloadKey
    /// Existing-key path only: the P8 cannot be re-downloaded, the user must
    /// provide the file they saved when the key was created.
    case locateP8File

    static func < (lhs: FlowStep, rhs: FlowStep) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var instruction: String {
        switch self {
        case .login: "Sign in to App Store Connect"
        case .selectTeam: "Confirm your team"
        case .verifyAccess: "Check API access"
        case .captureIssuerId: "Issuer ID is captured"
        case .createKey: "Open the Generate dialog"
        case .nameKey: "Name the key"
        case .selectRole: "Set the role to Admin"
        case .generateKey: "Click “Generate”"
        case .captureKeyId: "Key ID is captured"
        case .downloadKey: "Download the API key"
        case .locateP8File: "Locate your existing .p8 file"
        }
    }

    var detail: String? {
        switch self {
        case .login:
            "Passkey sign-in isn’t supported here — use your Apple ID password and a verification code."
        case .selectTeam:
            "API keys belong to a team — pick the right one in the dialog. A key can’t be moved to another team later."
        case .verifyAccess:
            "Confirming this team has the App Store Connect API enabled and that your role can create a key."
        case .captureIssuerId:
            "We take you straight to the API keys page and read it automatically. You can also paste it below."
        case .createKey:
            "Click the highlighted “+” to open the Generate API Key dialog."
        case .nameKey:
            "Give the key a name (the field is outlined). Use the button to fill in “Capgo Builder”, or type your own."
        case .selectRole:
            "Set Access to Admin (the field is outlined). Use the button to pick it automatically."
        case .generateKey:
            "Click the highlighted “Generate” to create the key."
        case .captureKeyId:
            "Your new key’s ID is read automatically from its row — nothing to do."
        case .downloadKey:
            "Click the highlighted “Download API Key”. Apple allows this only once — we capture the key directly, so just click Download."
        case .locateP8File:
            "Apple doesn’t allow re-downloading a key. Select the AuthKey file you saved when this key was created."
        }
    }
}
