import Capacitor
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        if connectionOptions.urlContexts.contains(where: { Self.isShare($0.url) }) {
            NotificationCenter.default.post(name: EverydaypanePlugin.shareNotification, object: nil)
        }
    }

    /// `everydaypane://share` is how the share extension hands over to the app.
    static func isShare(_ url: URL) -> Bool { url.scheme == "everydaypane" && url.host == "share" }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if URLContexts.contains(where: { Self.isShare($0.url) }) {
            NotificationCenter.default.post(name: EverydaypanePlugin.shareNotification, object: nil)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
