import AppKit
import Foundation
import Observation
import WebKit

/// Someone on the team who can act on an access request.
struct TeamContact: Decodable, Equatable {
    let name: String
    let email: String
    let isAccountHolder: Bool
    let isAdmin: Bool
}

/// A team API key that already exists in the user's account.
struct ExistingKey: Identifiable, Equatable, Decodable {
    let name: String
    let keyId: String
    var id: String { keyId }
}

enum FlowMode: Equatable {
    case createNew
    case useExisting(ExistingKey)
}

enum StepState {
    case done, current, upcoming
}

/// Why the user can't create a key on the current team.
enum AccessDeniedReason {
    case notEnabled       // team never did "Request Access"
    case insufficientRole // API on, but the user isn't Admin/Account Holder
}

/// Drives the guided team-API-key flow: watches the page, advances steps,
/// scrapes values, and hands off to validation + emission.
/// Step-resolution structure adapted from AppStoreConnectKit
/// (https://github.com/MortenGregersen/AppStoreConnectKit),
/// MIT License, © Morten Bjerg Gregersen. See THIRD-PARTY-LICENSES.md.
@MainActor @Observable
final class GuidedFlowModel {
    static let apiKeysURLString = "https://appstoreconnect.apple.com/access/integrations/api"
    static let apiKeysURL = URL(string: apiKeysURLString)!
    /// The root app — navigating here forces a fresh provider-context read,
    /// which is how the frontend lands a team switch.
    static let appsURL = URL(string: "https://appstoreconnect.apple.com/apps")!

    // Wiring, set by WebViewContainer.Coordinator.
    var callJavaScript: @MainActor (String) async throws -> Any? = { _ in nil }
    weak var webView: WKWebView?

    // Flow state.
    private(set) var currentStep: FlowStep = .login
    private(set) var mode: FlowMode = .createNew
    var issuerId: String = ""
    var keyId: String = ""
    private(set) var privateKey: String = ""
    private(set) var existingKeys: [ExistingKey] = []
    private(set) var session: ASCSession?
    private(set) var teamConfirmed = false
    private(set) var currentURL: String = GuidedFlowModel.apiKeysURLString
    private(set) var scrapeTroubleWarning = false
    private(set) var statusMessage: String?
    private(set) var autoLocateMessage: String?
    private(set) var isValidating = false
    private(set) var validationError: String?
    /// The current team has no App Store Connect API access (Apple shows a
    /// "Request Access" page instead of the keys UI).
    private(set) var apiAccessDenied = false
    private(set) var accessDeniedReason: AccessDeniedReason?
    /// Admins / Account Holder the user can email about access (fetched lazily).
    private(set) var eligibleContacts: [TeamContact] = []
    /// Generate-dialog state, for the name/role guided sub-steps.
    private(set) var dialogNameFilled = false
    private(set) var selectedRoles: [String] = []
    /// Snapshot of the web view, blurred behind the team-confirmation dialog.
    private(set) var webSnapshot: NSImage?

    private var apiAccessWarningDismissed = false
    private var apiEnabledChecked = false
    private var apiEnabledResult: Bool?
    private var everLoggedIn = false
    private var recoverAttempted = false
    private var expectedTeamId: String?
    private var awaitingSwitchApply = false
    private var currentURLValue: URL?
    private var pollTask: Task<Void, Never>?
    private var didAttemptValidation = false
    private var didAutoNavigate = false
    private var isResolving = false
    private var pageSettled = false
    private var steeredToKeys = false
    private var issuerScrapeFailures = 0
    private let validator = ASCKeyValidator()
    // Stats-protocol bookkeeping (see StatsProtocol). One-shot guards keep the
    // polled resolve loop from re-emitting the same milestone every tick.
    private var stepEnteredAt = Date()
    private var didEmitSignedIn = false
    private var didEmitCapability = false
    private var didEmitAccessDenied = false

    // MARK: - Steps

    var steps: [FlowStep] {
        // Single-team accounts (and pre-login, when most users will turn out
        // to be single-team) skip the confirmation step entirely.
        let confirmStep: [FlowStep] = (session?.teams.count ?? 1) > 1 ? [.selectTeam] : []
        switch mode {
        case .createNew:
            return [.login] + confirmStep + [.verifyAccess, .captureIssuerId, .createKey, .nameKey, .selectRole, .generateKey, .captureKeyId, .downloadKey]
        case .useExisting:
            return [.login] + confirmStep + [.verifyAccess, .captureIssuerId, .locateP8File]
        }
    }

    func state(of step: FlowStep) -> StepState {
        guard let currentIndex = steps.firstIndex(of: currentStep),
              let stepIndex = steps.firstIndex(of: step) else {
            return .upcoming
        }
        if stepIndex < currentIndex { return .done }
        if stepIndex == currentIndex { return .current }
        return .upcoming
    }

    var currentStepNumber: Int {
        (steps.firstIndex(of: currentStep) ?? 0) + 1
    }

    /// Multi-team accounts must explicitly confirm which team gets the key —
    /// the Issuer ID and all keys are per-team.
    var needsTeamConfirmation: Bool {
        guard let session else { return false }
        return session.teams.count > 1 && !teamConfirmed
    }

    var showIssuerField: Bool {
        !issuerId.isEmpty || state(of: .captureIssuerId) != .upcoming
    }

    var showKeyIdField: Bool {
        if case .useExisting = mode { return true }
        return !keyId.isEmpty || state(of: .captureKeyId) != .upcoming
    }

    var showExistingKeysSection: Bool {
        guard case .createNew = mode else { return false }
        return !existingKeys.isEmpty && privateKey.isEmpty && currentStep <= .createKey
    }

    // MARK: - Generate dialog (name + role) guidance

    /// A role other than the recommended one is currently selected.
    var wrongRoleSelected: Bool {
        !selectedRoles.isEmpty && !selectedRoles.contains(FlowScripts.recommendedRole)
    }

    var canAutofillName: Bool { currentStep == .nameKey && !dialogNameFilled }
    var canAutofillRole: Bool { currentStep == .selectRole && selectedRoles.isEmpty }

    func autofillKeyName() {
        Task { _ = try? await callJavaScript(FlowScripts.autofillName) }
    }

    func autofillKeyRole() {
        Task { _ = try? await callJavaScript(FlowScripts.autofillRoleScript(role: FlowScripts.recommendedRole)) }
    }

    /// True when the user navigated somewhere that isn't part of the flow
    /// (another site, or an unrelated App Store Connect page).
    var isOffCourse: Bool {
        guard let url = currentURLValue, let host = url.host else { return false }
        let authHosts = ["idmsa.apple.com", "appleid.apple.com", "account.apple.com"]
        if authHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") }) {
            return false
        }
        guard host == "appstoreconnect.apple.com" else { return true }
        // Wrong ASC page only counts once auto-navigation had its chance —
        // right after login we redirect to the keys page ourselves.
        guard didAutoNavigate else { return false }
        let path = url.path
        let onCourse = path.isEmpty || path == "/" || path.hasPrefix("/login") || path.hasPrefix("/access")
        return !onCourse
    }

    /// "Take me back" — jump straight to the API keys page.
    func goToKeyPage() {
        statusMessage = nil
        webView?.load(URLRequest(url: Self.apiKeysURL))
    }

    // MARK: - Teams

    /// Explicit choice from the confirmation dialog. Confirmation is applied
    /// optimistically; if the switch lands on a different team than chosen,
    /// the session refetch reopens the dialog.
    func confirmTeamSelection(_ team: ASCTeam) {
        teamConfirmed = true
        statusMessage = nil
        webSnapshot = nil
        let isSwitch = team.id != session?.currentTeam.id
        FileHandle.standardError.write(Data("[confirmTeam] \(team.name) isSwitch=\(isSwitch) current=\(session?.currentTeam.id ?? "nil")\n".utf8))
        StatsProtocol.event("team_confirmed", [
            "is_switch": isSwitch,
            "team_count": session?.teams.count ?? 1,
        ])
        guard isSwitch else { return }
        switchTeam(to: team)
    }

    /// From the no-API-access dialog: pick a different team.
    func reopenTeamChoice() {
        apiAccessDenied = false
        teamConfirmed = false
        // Reopening happens off the keys page (e.g. /access/users), where
        // resolveOnApiPage won't run to capture the blur — grab it here.
        webSnapshot = nil
        captureWebSnapshotIfNeeded()
        setStep(.selectTeam)
    }

    private func captureWebSnapshotIfNeeded() {
        guard webSnapshot == nil, let webView else { return }
        webView.takeSnapshot(with: nil) { [weak self] image, _ in
            Task { @MainActor in
                self?.webSnapshot = image
            }
        }
    }

    func dismissApiAccessWarning() {
        apiAccessDenied = false
        apiAccessWarningDismissed = true
        webSnapshot = nil
    }

    /// Keeps a persistent note in the status bar after the warning is dismissed.
    var showsApiAccessNote: Bool {
        apiAccessWarningDismissed && issuerId.isEmpty
    }

    func switchTeam(to team: ASCTeam) {
        // The raw switch API never commits — drive Apple's real account-menu
        // switcher and let its own code do the switch + navigation. We watch
        // the session to confirm, and inform the user if it doesn't land.
        expectedTeamId = team.id
        statusMessage = "Switching to \(team.name)…"
        resetCapturedState()
        teamConfirmed = true
        session = nil
        awaitingSwitchApply = true
        steeredToKeys = false
        Task {
            let script = FlowScripts.switchTeamViaMenuScript(teamName: team.name)
            let diagnostics = (try? await callJavaScript(script)) as? String
            FileHandle.standardError.write(Data("[switch] \(team.name) -> \(diagnostics ?? "<no result>")\n".utf8))
            StatsProtocol.debug("team switch attempt", [
                "team": team.name,
                "diagnostics": diagnostics ?? "<no result>",
            ])
            guard parseClicked(diagnostics) else {
                switchFailed(team)
                return
            }
            // Apple's click triggers the real switch + navigation; resolve()
            // routes the resulting /apps load to the keys page, and the
            // post-reload session confirms the team (via expectedTeamId).
            // Safety net: if nothing lands in time, inform the user.
            try? await Task.sleep(for: .seconds(12))
            if expectedTeamId == team.id {
                switchFailed(team)
            }
        }
    }

    private func parseClicked(_ diagnostics: String?) -> Bool {
        guard let data = diagnostics?.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return false
        }
        return root["clicked"] as? Bool == true
    }

    /// The auto-switch didn't land — keep the user moving and tell them to do
    /// it themselves; a manual menu switch (which navigates) is detected too.
    private func switchFailed(_ team: ASCTeam) {
        expectedTeamId = nil
        awaitingSwitchApply = false
        teamConfirmed = true
        session = nil
        didAutoNavigate = false // re-detect a manual switch's navigation
        statusMessage = "Couldn’t switch to \(team.name) automatically — open the account menu (top-right) and pick the team yourself; we’ll continue once you do."
        StatsProtocol.warn("automatic team switch did not land — asking the user to switch manually", [
            "team": team.name,
        ])
    }

    /// Everything scraped so far belongs to the previous team.
    private func resetCapturedState() {
        issuerId = ""
        keyId = ""
        privateKey = ""
        existingKeys = []
        didAttemptValidation = false
        validationError = nil
        autoLocateMessage = nil
        scrapeTroubleWarning = false
        issuerScrapeFailures = 0
        apiAccessDenied = false
        apiAccessWarningDismissed = false
        accessDeniedReason = nil
        apiEnabledChecked = false
        apiEnabledResult = nil
        eligibleContacts = []
        dialogNameFilled = false
        selectedRoles = []
        if case .useExisting = mode {
            mode = .createNew
        }
    }

    /// Authoritative team-enablement check via /iris/v1/apiAccesses.
    /// Returns nil if the endpoint couldn't be read (caller falls back).
    private func checkApiEnabled() async -> Bool? {
        guard let result = (try? await callJavaScript(FlowScripts.readApiAccessEnabled)) as? String else {
            return nil
        }
        switch result {
        case "enabled": return true
        case "disabled": return false
        default: return nil
        }
    }

    private func fetchSessionIfNeeded() async {
        guard session == nil else { return }
        guard let jsonText = (try? await callJavaScript(FlowScripts.readSession)) as? String,
              let parsed = ASCSession.parse(jsonText: jsonText) else {
            return
        }
        session = parsed
    }

    /// After the menu switch, the session flips server-side but Apple often
    /// navigates somewhere other than the keys page (e.g. /access/users). Read
    /// the session to confirm the new team, then make sure we end on the keys
    /// page — only there does the permission check + scrape run.
    private func applySwitch(urlString: String) async {
        guard let target = expectedTeamId else { awaitingSwitchApply = false; return }
        guard let json = (try? await callJavaScript(FlowScripts.readSession)) as? String,
              let parsed = ASCSession.parse(jsonText: json),
              parsed.currentTeam.id == target else {
            return // switch hasn't landed yet — keep waiting
        }
        session = parsed
        teamConfirmed = true
        statusMessage = "Switched to \(parsed.currentTeam.name)."
        if urlString.hasPrefix(Self.apiKeysURLString) {
            // We're on the keys page under the new team — done; normal flow
            // (permission check + scrape) resumes on the next pass.
            expectedTeamId = nil
            awaitingSwitchApply = false
            steeredToKeys = false
            FileHandle.standardError.write(Data("[applySwitch] landed on keys page, team=\(parsed.currentTeam.id)\n".utf8))
        } else if !steeredToKeys {
            // Apple parked us elsewhere (e.g. /access/users, often via SPA
            // routing with no didFinish, so we can't wait on pageSettled).
            // The switch already committed server-side, so navigating now is
            // safe; steeredToKeys (reset on each urlChanged) prevents spamming.
            steeredToKeys = true
            FileHandle.standardError.write(Data("[applySwitch] team=\(parsed.currentTeam.id) on \(urlString) — steering to keys\n".utf8))
            webView?.load(URLRequest(url: Self.apiKeysURL))
        }
    }

    // MARK: - Page events (from Coordinator)

    func urlChanged(_ url: URL) {
        currentURLValue = url
        currentURL = url.absoluteString
        pageSettled = false
        steeredToKeys = false
        ensurePolling()
        // React immediately instead of waiting for the next poll tick.
        Task { await resolveNow() }
    }

    func pageDidFinishLoading() {
        pageSettled = true
        Task {
            await highlightCurrentStep()
            await resolveNow()
        }
    }

    /// Run a resolve pass now, guarded against overlap with the poll loop.
    private func resolveNow() async {
        guard !isResolving, !isValidating, let url = currentURLValue else { return }
        isResolving = true
        await resolve(url: url)
        isResolving = false
    }

    func privateKeyCaptured(_ pem: String, replace: Bool = false) {
        guard replace || privateKey.isEmpty else { return }
        privateKey = pem
        didAttemptValidation = false
        statusMessage = keyId.isEmpty
            ? "Private key captured — waiting for the Key ID…"
            : "Private key captured."
    }

    // MARK: - Polling loop

    private func ensurePolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                try? await Task.sleep(for: .milliseconds(350))
            }
        }
    }

    private func tick() async {
        if canAttemptValidation {
            didAttemptValidation = true
            validateAndFinish()
            return
        }
        await resolveNow()
    }

    private var canAttemptValidation: Bool {
        !privateKey.isEmpty && !keyId.isEmpty && !issuerId.isEmpty
            && !isValidating && !didAttemptValidation && validationError == nil
    }

    // MARK: - Step resolution

    private func resolve(url: URL) async {
        let urlString = url.absoluteString
        let host = url.host ?? ""
        // Apple's sign-in pages (its own auth domains + ASC's /login). DO NOT
        // touch these — running JS or navigating mid-flow breaks Apple's
        // multi-step auth and produces authResult=FAILED. Just reflect the
        // sign-in step (until we've ever been in) and otherwise stand back.
        let isAppleAuth = host.contains("idmsa.apple.com")
            || host.contains("appleid.apple.com")
            || host.contains("account.apple.com")
        let isAscLogin = urlString.hasPrefix("https://appstoreconnect.apple.com/login")
        if isAppleAuth || isAscLogin {
            if !everLoggedIn {
                setStep(.login)
            }
            // A failed silent/passkey attempt leaves a blank page. Recover the
            // sign-in form exactly once by reloading the keys URL (which
            // redirects to a clean /login).
            if isAscLogin, !everLoggedIn, !recoverAttempted,
               urlString.contains("authResult=FAILED") || urlString.contains("authResult=ERROR") {
                recoverAttempted = true
                webView?.load(URLRequest(url: Self.apiKeysURL))
            }
            return
        }
        guard host == "appstoreconnect.apple.com" else { return }
        if awaitingSwitchApply {
            await applySwitch(urlString: urlString)
            return
        }
        if urlString.hasPrefix(Self.apiKeysURLString) {
            await resolveOnApiPage()
        } else if !didAutoNavigate {
            // A non-keys ASC page (e.g. /apps). Only steer to the keys page once
            // a real session exists — navigating mid-login would break auth.
            if let json = (try? await callJavaScript(FlowScripts.readSession)) as? String,
               ASCSession.parse(jsonText: json) != nil {
                didAutoNavigate = true
                StatsProtocol.debug("steering to the API keys page from an off-flow ASC page", [
                    "from": urlString,
                ])
                webView?.load(URLRequest(url: Self.apiKeysURL))
            }
        }
    }

    private func resolveOnApiPage() async {
        didAutoNavigate = true
        await fetchSessionIfNeeded()
        // No session on the keys URL means we're NOT signed in (the page is
        // about to redirect to /login). Do NOT advance — that false advance,
        // followed by the redirect, is the oscillation. Stay on sign-in.
        guard let session else {
            FileHandle.standardError.write(Data("[resolveOnApiPage] keys URL but session=nil — staying on sign-in (everLoggedIn=\(everLoggedIn))\n".utf8))
            if !everLoggedIn { setStep(.login) }
            return
        }
        everLoggedIn = true
        recoverAttempted = false
        if !didEmitSignedIn {
            didEmitSignedIn = true
            StatsProtocol.event("signed_in", ["team_count": session.teams.count])
        }
        // Confirmation comes before any scraping: values captured under the
        // wrong team would be worthless, and scrape failures during the
        // dialog would fire bogus access warnings.
        if needsTeamConfirmation {
            captureWebSnapshotIfNeeded()
            setStep(.selectTeam)
            return
        }
        if !apiEnabledChecked {
            setStep(.verifyAccess)
            // Authoritative: did the team do "Request Access"? Fall back to the
            // session feature flag only if the endpoint can't be read.
            apiEnabledResult = await checkApiEnabled() ?? session.teamHasApiEnabled
            apiEnabledChecked = true
        }
        let isEnabled = apiEnabledResult ?? true
        let roleOk = session.userCanGenerateKeys
        FileHandle.standardError.write(Data(
            "[capability] team=\(session.currentTeam.name) roles=\(session.roles) apiEnabled=\(isEnabled) roleOk=\(roleOk)\n".utf8
        ))
        if !didEmitCapability {
            didEmitCapability = true
            StatsProtocol.event("api_access_checked", ["enabled": isEnabled, "role_ok": roleOk])
        }
        if !isEnabled || !roleOk {
            accessDeniedReason = !isEnabled ? .notEnabled : .insufficientRole
            if !didEmitAccessDenied {
                didEmitAccessDenied = true
                StatsProtocol.event("api_access_denied", [
                    "reason": (!isEnabled) ? "not_enabled" : "insufficient_role",
                ])
                // Support needs the team + raw roles to advise the user on who to
                // ask (Account Holder for enablement, an Admin for a key).
                StatsProtocol.warn("API access denied for this team", [
                    "reason": (!isEnabled) ? "not_enabled" : "insufficient_role",
                    "team": session.currentTeam.name,
                    "roles": session.roles.joined(separator: ", "),
                ])
            }
            setStep(.verifyAccess)
            if !apiAccessWarningDismissed { flagApiAccessDenied() }
            return
        }
        // Verified: this team has the API enabled and the role can create a key.
        if issuerId.isEmpty {
            await scrapeIssuerId()
        }
        // The keys URL also matches the brief moment before an unauthenticated
        // visitor is redirected to /login. Until the session or the Issuer ID
        // proves the page actually rendered, don't advance.
        guard session != nil || !issuerId.isEmpty else { return }
        guard !issuerId.isEmpty else {
            setStep(.captureIssuerId)
            return
        }
        if case .useExisting = mode {
            setStep(.locateP8File)
            return
        }
        await scrapeExistingKeys()
        guard privateKey.isEmpty else { return }
        // Key already created? (its row has a Download button)
        if (try? await callJavaScript(FlowScripts.hasDownloadButton)) as? Bool == true {
            if keyId.isEmpty {
                await scrapeNewKeyId()
            }
            setStep(keyId.isEmpty ? .captureKeyId : .downloadKey)
            return
        }
        // Generate dialog open? Guide name → role → Generate.
        if (try? await callJavaScript(FlowScripts.isGenerateDialogOpen)) as? Bool == true {
            await resolveGenerateDialog()
            return
        }
        // Dialog closed; the “+” is on the page.
        dialogNameFilled = false
        selectedRoles = []
        if (try? await callJavaScript(FlowScripts.hasGenerateButton)) as? Bool == true {
            setStep(.createKey)
        } else {
            setStep(.captureIssuerId)
        }
    }

    /// Inside the Generate API Key dialog: name first, then role, then Generate.
    private func resolveGenerateDialog() async {
        let nameFilled = (try? await callJavaScript(FlowScripts.readNameFilled)) as? Bool == true
        dialogNameFilled = nameFilled
        guard nameFilled else {
            selectedRoles = []
            setStep(.nameKey)
            return
        }
        let genEnabled = (try? await callJavaScript(FlowScripts.isGenerateEnabled)) as? Bool == true
        guard genEnabled else {
            // Name set, no role chosen yet. The selectRole highlight floats a
            // native overlay over the Access field (never touching ASC's DOM).
            selectedRoles = []
            setStep(.selectRole)
            return
        }
        // A role is selected — read it so we can flag a non-Admin choice.
        if let json = (try? await callJavaScript(FlowScripts.readSelectedRoles)) as? String,
           let data = json.data(using: .utf8),
           let roles = try? JSONDecoder().decode([String].self, from: data) {
            selectedRoles = roles
        }
        if wrongRoleSelected {
            // The user picked a role other than the recommended one — Capgo
            // Builder keys want Admin. Surface exactly what they chose.
            StatsProtocol.warn("non-recommended role selected for the key", [
                "selected": selectedRoles.joined(separator: ", "),
                "recommended": FlowScripts.recommendedRole,
            ])
        }
        // Wrong role → keep them on the role step (the panel shows a warning).
        setStep(wrongRoleSelected ? .selectRole : .generateKey)
    }

    private func setStep(_ step: FlowStep) {
        guard step != currentStep else { return }
        FileHandle.standardError.write(Data(
            "[step] \(currentStep) -> \(step) | url=\(currentURL) | session=\(session?.currentTeam.name ?? "nil") everLoggedIn=\(everLoggedIn)\n".utf8
        ))
        let previous = currentStep
        currentStep = step
        let elapsedOnPrev = Int(Date().timeIntervalSince(stepEnteredAt) * 1000)
        stepEnteredAt = Date()
        StatsProtocol.event("step_changed", [
            "from": String(describing: previous),
            "to": String(describing: step),
            "elapsed_ms_on_prev": elapsedOnPrev,
        ])
        // Richer breadcrumb for the support log: the analytics event omits the
        // page/team context that's decisive when reconstructing a stuck run.
        StatsProtocol.debug("step \(previous) → \(step)", [
            "from": String(describing: previous),
            "to": String(describing: step),
            "url": currentURL,
            "team": session?.currentTeam.name ?? "nil",
            "ever_logged_in": everLoggedIn,
        ])
        Task {
            if let unhighlight = FlowScripts.unhighlightScript(for: previous) {
                _ = try? await callJavaScript(unhighlight)
            }
            await highlightCurrentStep()
        }
    }

    private func highlightCurrentStep() async {
        if let script = FlowScripts.highlightScript(for: currentStep) {
            _ = try? await callJavaScript(script)
        }
    }

    // MARK: - Scraping

    private func scrapeIssuerId() async {
        guard issuerId.isEmpty else { return }
        if let value = (try? await callJavaScript(FlowScripts.readIssuerId)) as? String,
           value.count >= 36 {
            issuerId = value
            statusMessage = "Issuer ID captured."
            issuerScrapeFailures = 0
            scrapeTroubleWarning = false
        } else {
            // Permission is already gated by the session check upstream; a
            // failure here means an accessible team's page didn't yield the
            // Issuer ID (slow load or an Apple DOM change) — let the user paste.
            issuerScrapeFailures += 1
            StatsProtocol.warn("issuer_id scrape returned no value (DOM element not found yet)", [
                "attempt": issuerScrapeFailures,
                "url": currentURL,
            ])
            if issuerScrapeFailures >= 8, !apiAccessWarningDismissed {
                scrapeTroubleWarning = true
                // Persistent miss → almost always an Apple DOM change; this is
                // the single most useful line for support to see in the bundle.
                StatsProtocol.error("issuer_id scrape persistently failing — Apple DOM may have changed", [
                    "attempts": issuerScrapeFailures,
                ])
            }
        }
    }

    private func flagApiAccessDenied() {
        guard !apiAccessDenied else { return }
        apiAccessDenied = true
        webSnapshot = nil
        captureWebSnapshotIfNeeded()
        Task { await fetchEligibleContacts() }
    }

    private func fetchEligibleContacts() async {
        guard eligibleContacts.isEmpty,
              let json = (try? await callJavaScript(FlowScripts.readEligibleContacts)) as? String,
              let data = json.data(using: .utf8),
              let contacts = try? JSONDecoder().decode([TeamContact].self, from: data) else {
            return
        }
        eligibleContacts = contacts
    }

    /// Open the user's mail client with a prepared message to the right people,
    /// based on why access is blocked.
    func composeAccessEmail() {
        let team = session?.currentTeam.name ?? "this team"
        let accountHolders = eligibleContacts.filter(\.isAccountHolder)
        let admins = eligibleContacts.filter { $0.isAdmin && !$0.isAccountHolder }
        let recipients: [TeamContact]
        let subject: String
        let body: String
        if accessDeniedReason == .notEnabled {
            // Only the Account Holder can Request Access.
            recipients = accountHolders.isEmpty ? admins : accountHolders
            subject = "Enable the App Store Connect API for \(team)"
            body = """
            Hi,

            I'm setting up Capgo Builder for \(team) and it needs an App Store Connect API key, but the API isn't enabled for the team yet.

            Could you turn it on? In App Store Connect: Users and Access → Integrations → App Store Connect API → Request Access (only the Account Holder can do this). Once it's enabled, an Admin can create a Team API key.

            Thanks!
            """
        } else {
            // API is on; any Admin or the Account Holder can create the key.
            recipients = accountHolders + admins
            subject = "App Store Connect API key for \(team)"
            body = """
            Hi,

            I'm setting up Capgo Builder for \(team) and it needs an App Store Connect API Team Key — but only Admins or the Account Holder can create one.

            Could you either create a Team API key and send me the .p8 file plus its Key ID and Issuer ID, or grant me the Admin role (Users and Access) so I can create it myself?

            Thanks!
            """
        }
        openMailto(to: recipients.map(\.email), subject: subject, body: body)
    }

    private func openMailto(to recipients: [String], subject: String, body: String) {
        guard !recipients.isEmpty else { return }
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = recipients.joined(separator: ",")
        components.queryItems = [
            URLQueryItem(name: "subject", value: subject),
            URLQueryItem(name: "body", value: body),
        ]
        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }

    private func scrapeNewKeyId() async {
        guard keyId.isEmpty else { return }
        guard let value = (try? await callJavaScript(FlowScripts.readNewKeyId)) as? String else { return }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if (8...14).contains(trimmed.count), !trimmed.contains(" ") {
            keyId = trimmed
            statusMessage = "Key ID captured."
        }
    }

    private func scrapeExistingKeys() async {
        guard let json = (try? await callJavaScript(FlowScripts.readExistingKeys)) as? String,
              let data = json.data(using: .utf8),
              let keys = try? JSONDecoder().decode([ExistingKey].self, from: data) else {
            return
        }
        var seen = Set<String>()
        let unique = keys.filter { seen.insert($0.keyId).inserted }
        if unique != existingKeys {
            existingKeys = unique
        }
    }

    // MARK: - Existing-key path

    func selectExistingKey(_ key: ExistingKey) {
        mode = .useExisting(key)
        keyId = key.keyId
        privateKey = ""
        didAttemptValidation = false
        validationError = nil
        autoLocateMessage = nil
        setStep(.locateP8File)
        if let fileURL = P8FileLocator.locate(keyId: key.keyId),
           let pem = try? String(contentsOf: fileURL, encoding: .utf8),
           pem.contains("PRIVATE KEY") {
            autoLocateMessage = "Found \(fileURL.path) — validating…"
            privateKeyCaptured(pem)
        }
    }

    func switchToCreateNew() {
        mode = .createNew
        keyId = ""
        privateKey = ""
        didAttemptValidation = false
        validationError = nil
        autoLocateMessage = nil
    }

    func chooseP8File() {
        P8FileLocator.presentOpenPanel { [weak self] fileURL in
            guard let self else { return }
            Task { @MainActor in
                guard let fileURL else { return }
                guard let pem = try? String(contentsOf: fileURL, encoding: .utf8),
                      pem.contains("PRIVATE KEY") else {
                    self.validationError = "That file doesn’t look like a .p8 private key."
                    // Common user mistake (picked the .cer/.mobileprovision, or a
                    // truncated file). Log the path — not the contents — so support
                    // can see what they chose. redactSecrets backstops the line.
                    StatsProtocol.warn("selected file is not a .p8 private key", [
                        "path": fileURL.path,
                    ])
                    return
                }
                self.validationError = nil
                self.privateKeyCaptured(pem, replace: true)
            }
        }
    }

    // MARK: - Validation & finish

    func retryValidation() {
        validationError = nil
        didAttemptValidation = false
    }

    private func validateAndFinish() {
        isValidating = true
        validationError = nil
        statusMessage = nil
        StatsProtocol.event("validation_started")
        let validationStart = Date()
        Task {
            do {
                try await validator.validate(
                    keyId: keyId.trimmingCharacters(in: .whitespacesAndNewlines),
                    issuerId: issuerId.trimmingCharacters(in: .whitespacesAndNewlines),
                    privateKeyPEM: privateKey
                )
                statusMessage = "Key validated with Apple."
                StatsProtocol.event("validation_succeeded", [
                    "duration_ms": Int(Date().timeIntervalSince(validationStart) * 1000),
                ])
                CredentialsEmitter.emit(KeyCredentials(
                    keyId: keyId.trimmingCharacters(in: .whitespacesAndNewlines),
                    issuerId: issuerId.trimmingCharacters(in: .whitespacesAndNewlines),
                    privateKey: privateKey
                ))
            } catch {
                validationError = error.localizedDescription
                StatsProtocol.event("validation_failed", [
                    "duration_ms": Int(Date().timeIntervalSince(validationStart) * 1000),
                ])
                // The analytics event omits the reason; the support log needs
                // Apple's actual error text to tell a bad key from a transient
                // network/clock-skew failure. This is never secret-bearing.
                StatsProtocol.error("Apple key validation failed", [
                    "detail": error.localizedDescription,
                    "duration_ms": Int(Date().timeIntervalSince(validationStart) * 1000),
                ])
            }
            isValidating = false
        }
    }
}
