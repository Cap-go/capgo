import SwiftUI
import WebKit

/// Hosts the WKWebView showing the real App Store Connect site and wires
/// navigation events, JavaScript execution and private-key capture into the model.
///
/// The P8 capture trick (Apple serves the key download as a `data:` URL, which
/// we intercept and decode in memory) is adapted from AppStoreConnectKit
/// (https://github.com/MortenGregersen/AppStoreConnectKit),
/// MIT License, © Morten Bjerg Gregersen. See THIRD-PARTY-LICENSES.md.
struct WebViewContainer: NSViewRepresentable {
    let model: GuidedFlowModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Persist the Apple sign-in across launches via WKWebsiteDataStore(
        // forIdentifier:) (see WebSessionStore) — WebKit saves the full session.
        // Automatic when the helper runs as an .app (has a bundle id); a
        // bundle-less raw binary falls back to a throwaway non-persistent store
        // (forIdentifier would SIGKILL it).
        configuration.websiteDataStore = WebSessionStore.dataStore
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        if #available(macOS 13.3, *) {
            #if DEBUG
            webView.isInspectable = true
            #endif
        }
        context.coordinator.attach(webView: webView)
        // Start at the keys page: a persisted session lands the user already
        // signed in; otherwise Apple's login wall uses this page as the post-login
        // redirect target.
        webView.load(URLRequest(url: GuidedFlowModel.apiKeysURL))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject {
        private let model: GuidedFlowModel
        private var urlObservation: NSKeyValueObservation?
        private var downloadDestination: URL?

        init(model: GuidedFlowModel) {
            self.model = model
        }

        func attach(webView: WKWebView) {
            model.webView = webView
            model.callJavaScript = { [weak webView] script in
                guard let webView else { return nil }
                return try await webView.callAsyncJavaScript(
                    script,
                    arguments: [:],
                    in: nil,
                    contentWorld: .defaultClient
                )
            }
            urlObservation = webView.observe(\.url, options: [.new]) { [weak self] _, change in
                guard let url = change.newValue.flatMap({ $0 }) else { return }
                Task { @MainActor in
                    self?.model.urlChanged(url)
                }
            }
        }

        static func decodePEM(fromDataURL url: URL) -> String? {
            let absolute = url.absoluteString
            guard let commaIndex = absolute.firstIndex(of: ",") else { return nil }
            let header = absolute[..<commaIndex]
            let payload = String(absolute[absolute.index(after: commaIndex)...])
            let decoded: String?
            if header.contains(";base64") {
                decoded = Data(base64Encoded: payload).flatMap { String(data: $0, encoding: .utf8) }
            } else {
                decoded = payload.removingPercentEncoding
            }
            guard let pem = decoded, pem.contains("PRIVATE KEY") else { return nil }
            return pem
        }
    }
}

// MARK: - WKNavigationDelegate

extension WebViewContainer.Coordinator: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url, url.scheme == "data" {
            if let pem = Self.decodePEM(fromDataURL: url) {
                model.privateKeyCaptured(pem)
            } else {
                // The "Download" produced a data: URL we couldn't decode into a
                // private key. Don't fail silently — the flow would otherwise stall
                // forever on downloadKey with no diagnostic.
                StatsProtocol.error("intercepted a data: download but could not decode a .p8 private key from it")
            }
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        model.pageDidFinishLoading()
    }
}

// MARK: - WKDownloadDelegate (fallback capture if the key arrives as a real download)

extension WebViewContainer.Coordinator: WKDownloadDelegate {
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString)-\(suggestedFilename)")
        downloadDestination = destination
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let destination = downloadDestination else { return }
        // Always remove the temp file — it holds a private key; never leave it on
        // disk, even on the failure path.
        defer { try? FileManager.default.removeItem(at: destination) }
        guard destination.pathExtension == "p8",
              let pem = try? String(contentsOf: destination, encoding: .utf8),
              pem.contains("PRIVATE KEY") else {
            StatsProtocol.warn("downloaded key file was not a readable .p8", [
                "ext": destination.pathExtension,
            ])
            return
        }
        model.privateKeyCaptured(pem)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        StatsProtocol.warn("key download failed", ["detail": error.localizedDescription])
        if let destination = downloadDestination {
            try? FileManager.default.removeItem(at: destination)
        }
        downloadDestination = nil
    }
}
