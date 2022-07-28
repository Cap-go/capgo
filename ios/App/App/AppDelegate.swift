import UIKit
import Capacitor
import CapgoCapacitorUpdater
import RobingenzCapacitorScreenOrientation

extension UIApplication {


public class func topViewController(_ base: UIViewController? = UIApplication.shared.windows.first?.rootViewController) -> UIViewController? {
    if let nav = base as? UINavigationController {
        return topViewController(nav.visibleViewController)
    }
    if let tab = base as? UITabBarController {
        if let selected = tab.selectedViewController {
            return topViewController(selected)
        }
    }
    if let presented = base?.presentedViewController {
        return topViewController(presented)
    }
    return base
}}

extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        let defaults = UserDefaults.standard
        if motion == .motionShake {
            let appName = "app"
            let title = "Preview \(appName) Menu"
            let message = "What would you like to do ?"
            let okButtonTitle = "Go Home"
            let reloadButtonTitle = "Reload app"
            let cancelButtonTitle = "Close menu"
            let updater = CapacitorUpdater()
            if let vc = (rootViewController as? CAPBridgeViewController) {
                if UIApplication.topViewController()!.isKind(of: UIAlertController.self) { 
                    print("UIAlertController is already presented")
                    return
                }
                func resetBuiltin () {
                    updater.reset()
                    vc.setServerBasePath(path: "")
                    DispatchQueue.main.async {
                        vc.loadView()
                        vc.viewDidLoad()
                        _ = updater.delete(id: bundleId)
                        print("✨  Capgo: Reset to builtin version")
                    }
                }
                let bundleId = updater.getCurrentBundleId()
                print("getServerBasePath", vc.getServerBasePath())
                print("bundleId", bundleId)
                let alertShake = UIAlertController(title: title, message: message, preferredStyle: UIAlertController.Style.alert)
                alertShake.addAction(UIAlertAction(title: okButtonTitle, style: UIAlertAction.Style.default, handler: { (_) -> Void in
                    guard let next = updater.getNextBundle() else {
                        resetBuiltin()
                        return
                    }
                    if (!next.isBuiltin()) {
                        print("✨  Capgo: Resetting to: \(next.toString())")
                        _ = updater.set(bundle: next)
                        let destHot = updater.getPathHot(id: next.getId())
                        print("✨  Capgo: Reloading \(next.toString())")
                        vc.setServerBasePath(path: destHot.path)
                    } else {
                        resetBuiltin()
                    }
                    print("✨  Capgo: Reload app done")
                }))
                alertShake.addAction(UIAlertAction(title: cancelButtonTitle, style: UIAlertAction.Style.default))
                alertShake.addAction(UIAlertAction(title: reloadButtonTitle, style: UIAlertAction.Style.default, handler: { (_) -> Void in
                    DispatchQueue.main.async {
                        vc.bridge?.webView?.reload()
                    }
                }))
                DispatchQueue.main.async {
                    vc.present(alertShake, animated: true, completion: { () -> Void in
//                        alertShake = nil
                    })
                }
            }
        }
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return ScreenOrientation.getSupportedInterfaceOrientations()
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
    
    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)

        let statusBarRect = UIApplication.shared.statusBarFrame
        guard let touchPoint = event?.allTouches?.first?.location(in: self.window) else { return }

        if statusBarRect.contains(touchPoint) {
            NotificationCenter.default.post(name: .capacitorStatusBarTapped, object: nil)
        }
    }
}
