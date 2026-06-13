import SwiftUI
import WebKit

struct ContentView: View {
    @Bindable var model: GuidedFlowModel

    var body: some View {
        // Gate the embedded browser behind the intro/consent screen — the
        // WKWebView (and any contact with Apple) isn't created until the user
        // accepts the guided flow. Once the key is created + validated, replace
        // it with the success screen that sends the user back to the terminal.
        if model.flowSucceeded {
            SuccessView(model: model)
        } else if model.hasConsented {
            guidedView
        } else {
            ConsentView(model: model)
        }
    }

    private var guidedView: some View {
        HSplitView {
            StepsPanel(model: model)
                .frame(minWidth: 300, idealWidth: 340, maxWidth: 440)
            VStack(spacing: 0) {
                browserBar
                Divider()
                ZStack {
                    WebViewContainer(model: model)
                    if model.needsTeamConfirmation {
                        DialogOverlay(snapshot: model.webSnapshot) {
                            TeamConfirmDialog(model: model)
                        }
                    } else if model.apiAccessDenied {
                        DialogOverlay(snapshot: model.webSnapshot) {
                            ApiAccessDialog(model: model)
                        }
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: model.needsTeamConfirmation)
                .animation(.easeInOut(duration: 0.2), value: model.apiAccessDenied)
            }
            .frame(minWidth: 620, maxWidth: .infinity)
        }
    }

    private var browserBar: some View {
        HStack(spacing: 8) {
            Button {
                model.webView?.goBack()
            } label: {
                Image(systemName: "chevron.left")
            }
            Button {
                model.webView?.goForward()
            } label: {
                Image(systemName: "chevron.right")
            }
            Button {
                model.webView?.reload()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            // Read-only URL display: lets the user verify they're on the real Apple site.
            Text(model.currentURL)
                .lineLimit(1)
                .truncationMode(.middle)
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }
}
