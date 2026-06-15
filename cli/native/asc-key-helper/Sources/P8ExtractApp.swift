import AppKit
import SwiftUI

@main
struct P8ExtractApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = GuidedFlowModel()

    var body: some Scene {
        WindowGroup("App Store Connect API Key Setup") {
            ContentView(model: model)
                .frame(minWidth: 1100, minHeight: 700)
                .onAppear {
                    StatsProtocol.started()
                    NSApp.setActivationPolicy(.regular)
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .defaultSize(width: 1280, height: 800)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Window closed without delivering credentials = user cancelled.
        if !CredentialsEmitter.didEmit {
            CredentialsEmitter.exitCancelled()
        }
    }
}
