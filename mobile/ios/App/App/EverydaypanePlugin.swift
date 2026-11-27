import Capacitor
import CoreLocation
import Foundation
import UIKit
import WidgetKit

/// The Everydaypane app's own native bridge (`window.Capacitor` › "Everydaypane", called from src/lib/nativeApp.ts):
/// the app token for widgets and the geofence, the share inbox, widget refreshes and the home geofence.
@objc(EverydaypanePlugin)
public class EverydaypanePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EverydaypanePlugin"
    public let jsName = "Everydaypane"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshWidgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSharedItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSharedItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "locationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startHomeGeofence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHomeGeofence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    static let shareNotification = Notification.Name("EverydaypaneShareReceived")

    private var pendingLocationCalls: [CAPPluginCall] = []

    override public func load() {
        NotificationCenter.default.addObserver(forName: Self.shareNotification, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("shareReceived", data: [:])
        }
        HomeGeofence.shared.onAuthorizationChange = { [weak self] in self?.flushLocationCalls() }
    }

    // MARK: Info and session

    @objc func info(_ call: CAPPluginCall) {
        #if DEBUG
        let pushEnv = "sandbox"
        #else
        let pushEnv = "production"
        #endif
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        DispatchQueue.main.async {
            call.resolve(["platform": "ios", "pushEnv": pushEnv, "version": version, "deviceName": UIDevice.current.model])
        }
    }

    @objc func getSession(_ call: CAPPluginCall) {
        call.resolve(["deviceId": AppGroup.deviceId as Any, "appToken": AppGroup.appToken as Any])
    }

    @objc func setSession(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"), let baseUrl = call.getString("baseUrl") else {
            return call.reject("deviceId and baseUrl are needed")
        }
        AppGroup.deviceId = deviceId
        AppGroup.baseUrl = baseUrl
        if let token = call.getString("appToken") { AppGroup.appToken = token }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        AppGroup.deviceId = nil
        AppGroup.appToken = nil
        AppGroup.widgetCache = nil
        HomeGeofence.shared.stop()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func refreshWidgets(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // MARK: Share inbox

    @objc func getSharedItems(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let inbox = AppGroup.inbox
            let items: [[String: Any]] = AppGroup.readInbox().compactMap { item in
                switch item.kind {
                case "image":
                    guard let file = item.file, let url = inbox?.appendingPathComponent(file), let data = try? Data(contentsOf: url) else { return nil }
                    return ["kind": "image", "data": "data:image/jpeg;base64,\(data.base64EncodedString())", "width": item.width ?? 0, "height": item.height ?? 0, "name": file]
                default:
                    return ["kind": item.kind, "text": item.text ?? ""]
                }
            }
            call.resolve(["items": items])
        }
    }

    @objc func clearSharedItems(_ call: CAPPluginCall) {
        AppGroup.clearInbox()
        call.resolve()
    }

    // MARK: Home geofence

    private func state() -> [String: Any] {
        ["permission": HomeGeofence.shared.permission, "active": HomeGeofence.shared.active]
    }

    @objc func locationState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state()) }
    }

    /// Asks for "While Using", then "Always" (iOS shows the second only after the first is granted).
    @objc func requestLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let geo = HomeGeofence.shared
            switch geo.permission {
            case "always", "denied":
                call.resolve(self.state())
            default:
                self.pendingLocationCalls.append(call)
                geo.requestAuthorization()
            }
        }
    }

    private func flushLocationCalls() {
        let geo = HomeGeofence.shared
        // After "While Using" is granted, go on to ask for "Always" once.
        if geo.permission == "whenInUse" && !geo.askedAlways {
            geo.requestAuthorization()
            return
        }
        let calls = pendingLocationCalls
        pendingLocationCalls = []
        for c in calls { c.resolve(state()) }
    }

    @objc func startHomeGeofence(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("latitude"), let lon = call.getDouble("longitude") else { return call.reject("latitude and longitude are needed") }
        let radius = call.getDouble("radius") ?? 150
        DispatchQueue.main.async {
            HomeGeofence.shared.start(latitude: lat, longitude: lon, radius: radius)
            call.resolve(self.state())
        }
    }

    @objc func stopHomeGeofence(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            HomeGeofence.shared.stop()
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }
}

/// One circular region around home. iOS wakes the app briefly on crossing it, even when the app isn't running, and
/// we tell the server "home" or "away" with the app token. No continuous tracking: region monitoring uses cell and
/// Wi-Fi changes, so it costs next to no battery, and the coordinates never leave the phone.
final class HomeGeofence: NSObject, CLLocationManagerDelegate {
    static let shared = HomeGeofence()
    static let regionId = "everydaypane.home"

    private let manager = CLLocationManager()
    var onAuthorizationChange: (() -> Void)?
    private(set) var askedAlways = false

    override init() {
        super.init()
        manager.delegate = self
    }

    var permission: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    var active: Bool { manager.monitoredRegions.contains { $0.identifier == Self.regionId } }

    func requestAuthorization() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if manager.authorizationStatus == .authorizedWhenInUse {
            askedAlways = true
            manager.requestAlwaysAuthorization()
        } else {
            onAuthorizationChange?()
        }
    }

    func start(latitude: Double, longitude: Double, radius: Double) {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self), manager.authorizationStatus == .authorizedAlways else { return }
        stop()
        let r = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            radius: min(max(radius, 100), manager.maximumRegionMonitoringDistance),
            identifier: Self.regionId)
        r.notifyOnEntry = true
        r.notifyOnExit = true
        manager.startMonitoring(for: r)
    }

    func stop() {
        for r in manager.monitoredRegions where r.identifier == Self.regionId { manager.stopMonitoring(for: r) }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onAuthorizationChange?()
    }

    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        manager.requestState(for: region)
    }

    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        guard region.identifier == Self.regionId, state != .unknown else { return }
        Self.report(state == .inside ? "home" : "away")
    }

    static func report(_ state: String) {
        guard let req = AppGroup.apiRequest("/api/mobile/presence/", method: "POST", json: ["state": state]) else { return }
        // iOS gives a region wake-up about ten seconds; ask for a little more so the request finishes.
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        URLSession.shared.dataTask(with: req) { _, _, _ in
            DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
        }.resume()
    }
}
