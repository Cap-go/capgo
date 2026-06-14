import SwiftUI

/// Shown once the key is created + validated and delivered to the CLI. Its job
/// is to tell the user the work here is done and to return to the terminal,
/// where Capgo continues. The window auto-closes after a short beat (see
/// GuidedFlowModel.validateAndFinish); the button closes it immediately.
struct SuccessView: View {
    @Bindable var model: GuidedFlowModel

    var body: some View {
        VStack(spacing: 22) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)

            VStack(spacing: 8) {
                Text("API key created 🎉")
                    .font(.title).bold()
                Text("Your App Store Connect API key was created and validated.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if !model.keyId.isEmpty {
                Text("Key ID: \(model.keyId)")
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            // The point of this screen: send the user back to the terminal.
            Text("Switch back to the terminal — Capgo is finishing your setup there.")
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.top, 4)

            Button {
                model.finishToTerminal()
            } label: {
                Text("Close this window  →")
                    .frame(minWidth: 220)
            }
            .keyboardShortcut(.defaultAction)
            .controlSize(.large)
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)

            Text("This window closes on its own once setup continues.")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Spacer()
        }
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}
