import AppKit
import SwiftUI

/// The native left-hand panel: progress header, step checklist, captured
/// values, existing-key reuse, and a pinned status bar — on real sidebar material.
struct StepsPanel: View {
    @Bindable var model: GuidedFlowModel

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    if model.isOffCourse {
                        offCourseBanner
                    }
                    teamCard
                    stepsCard
                    generateDialogCard
                    valuesCard
                    existingKeysCard
                    locateFileCard
                }
                .padding(14)
            }
            Divider()
            statusBar
        }
        .background(SidebarMaterial().ignoresSafeArea())
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "key.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(
                    LinearGradient(colors: [.blue, .indigo], startPoint: .top, endPoint: .bottom),
                    in: RoundedRectangle(cornerRadius: 8)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text("App Store Connect API Key")
                    .font(.headline)
                Text("Step \(model.currentStepNumber) of \(model.steps.count)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Off-course banner

    private var offCourseBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("You’ve left the key setup page", systemImage: "location.slash.fill")
                .font(.system(size: 13, weight: .semibold))
            Text("No problem — we’ll take you straight back to where you need to be.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Take me back") {
                model.goToKeyPage()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.orange.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(.orange.opacity(0.45), lineWidth: 1)
        )
    }

    // MARK: - Team

    @ViewBuilder
    private var teamCard: some View {
        // Don't show a team as "yours" while the choice is still pending.
        if let session = model.session, !model.needsTeamConfirmation {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    TeamMonogram(name: session.currentTeam.name, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(session.currentTeam.name)
                            .font(.system(size: 13, weight: .semibold))
                        Text(signedInCaption(session))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if !model.needsTeamConfirmation, !session.otherTeams.isEmpty {
                        Menu("Switch") {
                            ForEach(session.otherTeams) { team in
                                Button(team.name) {
                                    model.switchTeam(to: team)
                                }
                            }
                        }
                        .font(.caption)
                        .fixedSize()
                    }
                }
            }
            .padding(12)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func signedInCaption(_ session: ASCSession) -> String {
        var caption = session.email.isEmpty ? "Signed in" : "Signed in as \(session.email)"
        if let role = session.role {
            caption += " · \(role)"
        }
        return caption
    }

    // MARK: - Steps

    private var stepsCard: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(model.steps.enumerated()), id: \.element) { index, step in
                stepRow(index: index, step: step)
            }
        }
        .padding(6)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
    }

    private func stepRow(index: Int, step: FlowStep) -> some View {
        let state = model.state(of: step)
        return HStack(alignment: .top, spacing: 10) {
            stepBadge(index: index, state: state)
            VStack(alignment: .leading, spacing: 3) {
                Text(step.instruction)
                    .font(.system(size: 13, weight: state == .current ? .semibold : .regular))
                    .foregroundStyle(state == .upcoming ? .secondary : .primary)
                if state == .current, let detail = step.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 8)
        .background(
            state == .current ? Color.accentColor.opacity(0.13) : .clear,
            in: RoundedRectangle(cornerRadius: 7)
        )
        .animation(.easeInOut(duration: 0.2), value: state == .current)
    }

    @ViewBuilder
    private func stepBadge(index: Int, state: StepState) -> some View {
        ZStack {
            switch state {
            case .done:
                Circle().fill(.green)
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
            case .current:
                Circle().fill(Color.accentColor)
                Text("\(index + 1)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
            case .upcoming:
                Circle().strokeBorder(Color.secondary.opacity(0.45), lineWidth: 1.2)
                Text("\(index + 1)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 20, height: 20)
        .padding(.top, 1)
    }

    // MARK: - Generate dialog helpers

    @ViewBuilder
    private var generateDialogCard: some View {
        if model.canAutofillName {
            helperCard {
                Text("Fill the name for me")
                    .font(.system(size: 13, weight: .semibold))
                Button {
                    model.autofillKeyName()
                } label: {
                    Label("Autofill “Capgo Builder”", systemImage: "wand.and.stars")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Text("Or type your own name — this button goes away once you do.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } else if model.currentStep == .selectRole {
            VStack(alignment: .leading, spacing: 10) {
                if model.wrongRoleSelected {
                    wrongRoleWarning
                }
                helperCard {
                    Text("Pick the role for me")
                        .font(.system(size: 13, weight: .semibold))
                    Button {
                        model.autofillKeyRole()
                    } label: {
                        Label("Set role to Admin", systemImage: "wand.and.stars")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            }
        }
    }

    /// Loud, can't-miss warning when a non-Admin role is selected.
    private var wrongRoleWarning: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Wrong role — this key won’t work", systemImage: "exclamationmark.octagon.fill")
                .font(.system(size: 13, weight: .bold))
            Text("You selected \(model.selectedRoles.joined(separator: ", ")). Capgo Builder needs the Admin role. Remove those chips (the × next to each) and pick Admin — or just use the button below.")
                .font(.caption)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.red, in: RoundedRectangle(cornerRadius: 10))
    }

    private func helperCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.accentColor.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(Color.accentColor.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Captured values

    @ViewBuilder
    private var valuesCard: some View {
        // Issuer ID is shown once captured, or as a manual-entry fallback only
        // if auto-capture has actually failed. Key ID is shown once captured.
        let issuerReached = model.state(of: .captureIssuerId) != .upcoming
        let showIssuerManual = model.issuerId.isEmpty && issuerReached && model.scrapeTroubleWarning
        let showIssuer = !model.issuerId.isEmpty || showIssuerManual
        let showKey = !model.keyId.isEmpty
        if showIssuer || showKey {
            VStack(alignment: .leading, spacing: 12) {
                if showIssuer {
                    if model.issuerId.isEmpty {
                        manualValueRow(
                            "Issuer ID",
                            text: $model.issuerId,
                            warning: "We couldn’t read the Issuer ID automatically. Copy it from the page (next to “Issuer ID”) and paste it here."
                        )
                    } else {
                        capturedValueRow("Issuer ID", value: model.issuerId)
                    }
                }
                if showKey {
                    capturedValueRow("Key ID", value: model.keyId)
                }
            }
            .padding(12)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    /// A value we captured automatically — read-only and clearly labelled so it
    /// can't be corrupted by an accidental edit.
    private func capturedValueRow(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Label("Captured", systemImage: "checkmark.seal.fill")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
            Text(value)
                .font(.callout.monospaced())
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 5)
                .padding(.horizontal, 8)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
            Text("Read automatically from App Store Connect — no need to edit it.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    /// Editable fallback, shown only when auto-capture failed — with a warning.
    private func manualValueRow(_ label: String, text: Binding<String>, warning: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: "exclamationmark.triangle.fill")
                .font(.caption.weight(.medium))
                .foregroundStyle(.orange)
            TextField("Paste the \(label) here", text: text)
                .textFieldStyle(.roundedBorder)
                .font(.callout.monospaced())
            Text(warning)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Existing keys

    @ViewBuilder
    private var existingKeysCard: some View {
        if model.showExistingKeysSection {
            VStack(alignment: .leading, spacing: 8) {
                Label("Already have a team key?", systemImage: "key.viewfinder")
                    .font(.system(size: 13, weight: .semibold))
                Text("Reuse one if you still have its .p8 file — Apple doesn’t allow re-downloading.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                VStack(spacing: 4) {
                    ForEach(model.existingKeys) { key in
                        Button {
                            model.selectExistingKey(key)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(key.name)
                                        .font(.system(size: 12))
                                    Text(key.keyId)
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("Use")
                                    .font(.caption.weight(.medium))
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            }
            .padding(12)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Existing-key file

    @ViewBuilder
    private var locateFileCard: some View {
        if case .useExisting(let key) = model.mode {
            VStack(alignment: .leading, spacing: 8) {
                Label("Reusing key \(key.keyId)", systemImage: "doc.badge.ellipsis")
                    .font(.system(size: 13, weight: .semibold))
                if model.privateKey.isEmpty {
                    Text(model.autoLocateMessage ?? "Select the AuthKey_\(key.keyId).p8 file you saved when this key was created. We already checked the usual folders.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Choose .p8 file…") {
                        model.chooseP8File()
                    }
                    .controlSize(.small)
                } else if let found = model.autoLocateMessage {
                    Text(found)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button("Back to creating a new key") {
                    model.switchToCreateNew()
                }
                .buttonStyle(.link)
                .controlSize(.small)
            }
            .padding(12)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Status bar

    private var statusBar: some View {
        HStack(spacing: 7) {
            if model.isValidating {
                ProgressView()
                    .controlSize(.small)
                Text("Validating key with Apple…")
            } else if let error = model.validationError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.yellow)
                Text(error)
                    .lineLimit(3)
                Spacer(minLength: 4)
                Button("Retry") {
                    model.retryValidation()
                }
                .controlSize(.small)
            } else if model.showsApiAccessNote {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text("This team has no App Store Connect API access — ask the Account Holder to enable it under Users and Access → Integrations.")
                    .lineLimit(3)
            } else if model.scrapeTroubleWarning {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text("Can’t find the Issuer ID — your account may lack team-key access (ask your Account Holder), or paste the values manually.")
                    .lineLimit(3)
            } else if let status = model.statusMessage {
                Image(systemName: "info.circle")
                    .foregroundStyle(.secondary)
                Text(status)
            } else {
                Text("Follow the highlighted step on the page.")
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
        }
        .font(.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }
}

/// Sidebar background. Uses the window-background material with within-window
/// blending so it stays a consistent neutral tone instead of bleeding the
/// desktop wallpaper's colors through.
private struct SidebarMaterial: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .windowBackground
        view.blendingMode = .withinWindow
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}
