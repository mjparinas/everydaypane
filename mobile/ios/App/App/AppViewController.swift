import Capacitor
import UIKit
import WebKit

/// The app's web view (Melvin, 2026-11-27). Registers the Everydaypane plugin and switches "wall mode" on whenever
/// the page is the wall display (`/display/`): the screen never sleeps, and the status bar hides and swipes from the
/// edges need a second swipe (Capacitor's view controller keeps the home indicator's own setting), so an iPad on the wall is a kiosk with nothing added to the display's own lightweight page. For a true kiosk,
/// turn on Guided Access (Settings › Accessibility) as docs/mobile-app.md explains.
class AppViewController: CAPBridgeViewController {
    private var urlObserver: NSKeyValueObservation?
    private(set) var wallMode = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EverydaypanePlugin())
        urlObserver = webView?.observe(\.url, options: [.initial, .new]) { [weak self] view, _ in
            DispatchQueue.main.async { self?.setWallMode(Self.isWall(view.url)) }
        }
    }

    static func isWall(_ url: URL?) -> Bool {
        guard let path = url?.path else { return false }
        return path == "/display" || path.hasPrefix("/display/")
    }

    private func setWallMode(_ on: Bool) {
        guard on != wallMode else { return }
        wallMode = on
        UIApplication.shared.isIdleTimerDisabled = on
        setStatusBarVisible(!on)
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { wallMode ? .all : [] }
}
