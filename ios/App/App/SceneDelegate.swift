import UIKit
import Capacitor

// UIScene lifecycle entry point. Apps linked against the iOS 27 SDK must adopt
// UIScene or UIKit stops them at launch. The window and its CAPBridgeViewController
// come from Main.storyboard (UISceneStoryboardFile in Info.plist).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    private let nativeConfirmedPreviewParam = "nativeConfirmedPreview"
    private let previewBundlePath = "/preview/bundle"
    private let previewChannelPath = "/preview/channel"
    private var previewConfirmationVisible = false
    private var pendingPreviewConfirmation: (url: URL, proceed: (URL) -> Void)?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }

        enableWebViewInspection()

        NotificationCenter.default.post(name: .capacitorSceneWillConnect, object: scene)

        // On a cold start plugins are not registered yet, so URLs and universal links
        // from the connection options are delivered once the bridge view appears,
        // like Capacitor's SceneDelegateProxy does. They go through the same preview
        // confirmation as warm-start links.
        let urlContexts = connectionOptions.urlContexts
        let userActivities = connectionOptions.userActivities
        guard !urlContexts.isEmpty || !userActivities.isEmpty else { return }

        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { [weak self] _ in
            if let token {
                NotificationCenter.default.removeObserver(token)
            }
            guard let self else { return }
            if !urlContexts.isEmpty {
                self.scene(scene, openURLContexts: urlContexts)
            }
            for userActivity in userActivities {
                self.scene(scene, continue: userActivity)
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        var passthrough = Set<UIOpenURLContext>()
        for context in URLContexts {
            let options = openURLOptions(from: context.options)
            let isPreview = handlePreviewURLIfNeeded(context.url) { confirmedUrl in
                _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: confirmedUrl, options: options)
                NotificationCenter.default.post(name: .capacitorSceneOpenURL, object: scene, userInfo: [
                    "url": confirmedUrl,
                    "options": options,
                ])
            }
            if !isPreview {
                passthrough.insert(context)
            }
        }

        if !passthrough.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: passthrough)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL, handlePreviewURLIfNeeded(url, proceed: { confirmedUrl in
            userActivity.webpageURL = confirmedUrl
            SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        }) {
            return
        }

        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func enableWebViewInspection() {
        if #available(iOS 16.4, *) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
                if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                    vc.bridge?.webView?.isInspectable = true
                }
            }
        }
    }

    private func openURLOptions(from sceneOptions: UIScene.OpenURLOptions) -> [UIApplication.OpenURLOptionsKey: Any] {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let sourceApplication = sceneOptions.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = sceneOptions.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = sceneOptions.openInPlace
        return options
    }

    private func handlePreviewURLIfNeeded(_ url: URL, proceed: @escaping (URL) -> Void) -> Bool {
        guard isPreviewDeepLink(url) else {
            return false
        }

        if previewConfirmationVisible {
            pendingPreviewConfirmation = (url, proceed)
            return true
        }

        previewConfirmationVisible = true
        DispatchQueue.main.async {
            self.presentPreviewConfirmation(for: url, proceed: proceed)
        }
        return true
    }

    private func presentPreviewConfirmation(for url: URL, proceed: @escaping (URL) -> Void) {
        guard let presenter = topViewController() else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self.presentPreviewConfirmation(for: url, proceed: proceed)
            }
            return
        }

        let alert = UIAlertController(title: "Load preview?", message: previewConfirmationMessage(for: url), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "No", style: .cancel) { _ in
            self.completePreviewConfirmation(proceedWith: nil)
        })
        alert.addAction(UIAlertAction(title: "Load preview", style: .default) { _ in
            self.completePreviewConfirmation(proceedWith: (url, proceed))
        })
        presenter.present(alert, animated: true)
    }

    private func topViewController(from viewController: UIViewController? = nil) -> UIViewController? {
        let source = viewController ?? window?.rootViewController
        if let presented = source?.presentedViewController {
            return topViewController(from: presented)
        }
        if let navigationController = source as? UINavigationController {
            return topViewController(from: navigationController.visibleViewController)
        }
        if let tabController = source as? UITabBarController {
            return topViewController(from: tabController.selectedViewController)
        }
        return source
    }

    private func completePreviewConfirmation(proceedWith: (url: URL, proceed: (URL) -> Void)?) {
        previewConfirmationVisible = false
        if let proceedWith {
            proceedWith.proceed(self.withNativeConfirmedPreview(proceedWith.url))
        }

        guard let pending = pendingPreviewConfirmation else {
            return
        }
        pendingPreviewConfirmation = nil
        previewConfirmationVisible = true
        presentPreviewConfirmation(for: pending.url, proceed: pending.proceed)
    }

    private func withNativeConfirmedPreview(_ url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }

        var queryItems = (components.queryItems ?? []).filter { $0.name != nativeConfirmedPreviewParam }
        queryItems.append(URLQueryItem(name: nativeConfirmedPreviewParam, value: "1"))
        components.queryItems = queryItems
        return components.url ?? url
    }

    private func isPreviewDeepLink(_ url: URL) -> Bool {
        let path = previewPath(from: url)
        return path == previewBundlePath || path == previewChannelPath
    }

    private func previewPath(from url: URL) -> String {
        if url.scheme == "capgo" {
            let path = "/\(url.host ?? "")\(url.path)"
            return path.replacingOccurrences(of: "/+", with: "/", options: .regularExpression)
        }

        return url.path
    }

    private func previewConfirmationMessage(for url: URL) -> String {
        let appLabel = firstQueryValue(url, names: ["appId", "app"]) ?? "Unknown app"
        return "A preview link wants to load:\n\nApp: \(appLabel)\nTarget: \(previewTargetLabel(for: url))"
    }

    private func previewTargetLabel(for url: URL) -> String {
        if previewPath(from: url) == previewChannelPath {
            if let channel = firstQueryValue(url, names: ["channel", "channelName"]) {
                return "Channel \(channel)"
            }
            return "Channel preview"
        }

        if let version = firstQueryValue(url, names: ["versionId", "bundleId"]) {
            return "Bundle \(version)"
        }
        return "Bundle preview"
    }

    private func firstQueryValue(_ url: URL, names: [String]) -> String? {
        guard let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            return nil
        }

        for name in names {
            if let value = queryItems.first(where: { $0.name == name })?.value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value
            }
        }
        return nil
    }
}
