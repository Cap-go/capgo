import UIKit
import Capacitor
import CapacitorUpdater
import RobingenzCapacitorScreenOrientation

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
                print("getServerBasePath", vc.getServerBasePath())
                let serverBasePath = defaults.object(forKey:"serverBasePath") as? String ?? ""
                if (serverBasePath == "") {
                    return
                }
                DispatchQueue.main.async {
                    let alert = UIAlertController(title: title, message: message, preferredStyle: UIAlertController.Style.alert)
                    alert.addAction(UIAlertAction(title: okButtonTitle, style: UIAlertAction.Style.default, handler: { (_) -> Void in
                        updater.reset()
                        let pathPersist = updater.getLastPathPersist()
                        vc.setServerBasePath(path: pathPersist)
                        defaults.set("", forKey: "serverBasePath")
                        DispatchQueue.main.async {
                            vc.loadView()
                            vc.viewDidLoad()
                            let res = updater.delete(version: serverBasePath)
                        }
                    }))
                    alert.addAction(UIAlertAction(title: cancelButtonTitle, style: UIAlertAction.Style.default))
                    alert.addAction(UIAlertAction(title: reloadButtonTitle, style: UIAlertAction.Style.default, handler: { (_) -> Void in
                        DispatchQueue.main.async {
                            vc.bridge?.webView?.reload()
                        }
                    }))
                    vc.present(alert, animated: true, completion: nil)
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
