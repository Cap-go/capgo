import AppKit
import SwiftUI

/// Pane-local modal: a real gaussian blur of the web view's own pixels
/// (snapshot-based — no AppKit material tinting), a light dim, and a centered
/// card. Swallows clicks so the page can't be used until resolved.
struct DialogOverlay<Content: View>: View {
    let snapshot: NSImage?
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            if let snapshot {
                GeometryReader { proxy in
                    Image(nsImage: snapshot)
                        .resizable()
                        .scaledToFill()
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .blur(radius: 22, opaque: true)
                        .clipped()
                }
            }
            Color.black.opacity(0.22)
            content
                .padding(20)
                .frame(maxWidth: 420)
                .background(
                    Color(nsColor: .windowBackgroundColor),
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color(nsColor: .separatorColor), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.35), radius: 30, y: 10)
                .padding(24)
        }
        .contentShape(Rectangle())
        .transition(.opacity)
    }
}

/// Shown over the blurred web view when the current team won't let the user
/// create an API key (no API access, or insufficient role).
struct ApiAccessDialog: View {
    @Bindable var model: GuidedFlowModel

    private var teamName: String { model.session?.currentTeam.name ?? "This team" }
    /// Only offer a switch when there is a team other than the current one.
    private var hasOtherTeams: Bool { !(model.session?.otherTeams.isEmpty ?? true) }
    /// Owner can enable; admins can create — label the email button to match.
    private var emailButtonLabel: String {
        model.accessDeniedReason == .notEnabled ? "Email the owner" : "Email an admin"
    }

    /// State the actual reason, decided by the model's authoritative check.
    private var reasonLines: [String] {
        if model.accessDeniedReason == .notEnabled {
            return [
                "“\(teamName)” hasn’t turned on the App Store Connect API yet. It’s a one-time switch the Account Holder (the org owner) has to flip.",
                "Ask the owner to open Users and Access → Integrations → App Store Connect API and click “Request Access”. After that, an Admin can create the key.",
            ]
        }
        // API is on; the blocker is the user's role.
        let role = model.session?.role ?? "your role"
        return [
            "Only Admins and the Account Holder can create a team API key. On “\(teamName)” you’re \(role), which can’t.",
            "Ask an Admin or the Account Holder to create the key for you, or to upgrade your role under Users and Access.",
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "lock.trianglebadge.exclamationmark.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.orange)
                Text("You can’t create a key for this team")
                    .font(.headline)
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(reasonLines, id: \.self) { line in
                    Text(line)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Button("Close") {
                    model.dismissApiAccessWarning()
                }
                Spacer()
                if !model.eligibleContacts.isEmpty {
                    Button(emailButtonLabel) {
                        model.composeAccessEmail()
                    }
                }
                if hasOtherTeams {
                    Button("Choose another team") {
                        model.reopenTeamChoice()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}

/// Step 2 for multi-team accounts, shown over the blurred web view.
/// No team is preselected — the user must actively pick one, and Confirm
/// stays disabled until they do.
struct TeamConfirmDialog: View {
    @Bindable var model: GuidedFlowModel
    @State private var selectedTeamId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Confirm your team")
                    .font(.headline)
                Text("API keys belong to a team, and a key can’t be moved later. Pick the team your app ships under.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            VStack(spacing: 5) {
                ForEach(model.session?.teams ?? []) { team in
                    teamRow(team)
                }
            }
            HStack {
                Spacer()
                Button("Confirm") {
                    if let team = model.session?.teams.first(where: { $0.id == selectedTeamId }) {
                        model.confirmTeamSelection(team)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedTeamId == nil)
            }
        }
    }

    private func teamRow(_ team: ASCTeam) -> some View {
        let isSelected = team.id == selectedTeamId
        return Button {
            selectedTeamId = team.id
        } label: {
            HStack(spacing: 8) {
                TeamMonogram(name: team.name, size: 24)
                Text(team.name)
                    .font(.system(size: 13))
                Spacer()
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(
                isSelected ? Color.accentColor.opacity(0.12) : Color.primary.opacity(0.04),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(isSelected ? Color.accentColor.opacity(0.5) : .clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
