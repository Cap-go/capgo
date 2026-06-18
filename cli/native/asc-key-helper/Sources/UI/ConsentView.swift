import SwiftUI

/// Intro/consent screen shown BEFORE the embedded browser loads. It explains the
/// safety model (you sign in to Apple directly; Capgo never sees your password,
/// Apple ID, or 2FA codes) and lets the user choose between the guided flow and
/// creating the .p8 by hand. The WKWebView isn't created until "Continue", so
/// Apple is not contacted until the user accepts.
struct ConsentView: View {
    @Bindable var model: GuidedFlowModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    reassurances
                    Divider()
                    Text("You can also create the key yourself at App Store Connect and paste it into the terminal — pick whichever you prefer.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, 40)
            }
            Spacer(minLength: 16)
            actions
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 40)
            Spacer(minLength: 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 40))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 6) {
                Text("Create your App Store Connect API key")
                    .font(.title2).bold()
                Text("Capgo will guide you through Apple's website to create the key your builds need. It's safe — here's exactly what happens.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var reassurances: some View {
        VStack(alignment: .leading, spacing: 14) {
            point(
                icon: "checkmark.seal.fill",
                title: "You sign in to Apple directly",
                detail: "The window shows Apple's real website (appstoreconnect.apple.com). You log in to Apple, not to Capgo."
            )
            point(
                icon: "key.fill",
                title: "Capgo never sees your password",
                detail: "Your Apple ID, password, and 2FA codes go straight to Apple. Capgo can't read them."
            )
            point(
                icon: "doc.badge.gearshape.fill",
                title: "We only receive the key you generate",
                detail: "Capgo captures just the new API key (Key ID, Issuer ID, and the .p8) so Capgo Builder can upload your app."
            )
        }
    }

    private func point(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(.tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            Button {
                model.giveConsent()
            } label: {
                Text("Continue — guide me  →")
                    .frame(minWidth: 200)
            }
            .keyboardShortcut(.defaultAction)
            .controlSize(.large)
            .buttonStyle(.borderedProminent)

            Button {
                model.chooseManualCreation()
            } label: {
                Text("I'll create it manually")
            }
            .controlSize(.large)
        }
    }
}
