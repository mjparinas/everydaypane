import Foundation

/// What the app, its share extension and its home-screen widget share through the App Group
/// (Melvin, 2026-11-27). The group id must match the App Groups capability on all three targets.
enum AppGroup {
    static let id = "group.com.everydaypane.app"
    static let defaults = UserDefaults(suiteName: id) ?? .standard

    static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    // MARK: Session (written by the app after the page registers this phone)

    static var baseUrl: String? {
        get { defaults.string(forKey: "baseUrl") }
        set { defaults.set(newValue, forKey: "baseUrl") }
    }
    static var appToken: String? {
        get { defaults.string(forKey: "appToken") }
        set { defaults.set(newValue, forKey: "appToken") }
    }
    static var deviceId: String? {
        get { defaults.string(forKey: "deviceId") }
        set { defaults.set(newValue, forKey: "deviceId") }
    }

    /// The widget's last good answer, so it still shows something offline.
    static var widgetCache: Data? {
        get { defaults.data(forKey: "widgetCache") }
        set { defaults.set(newValue, forKey: "widgetCache") }
    }

    /// An authorised request to our API with the app token, or nil when the phone isn't signed in.
    static func apiRequest(_ path: String, method: String = "GET", json: [String: Any]? = nil) -> URLRequest? {
        guard let base = baseUrl, let token = appToken, let url = URL(string: path, relativeTo: URL(string: base)) else { return nil }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let json = json, let body = try? JSONSerialization.data(withJSONObject: json) {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return req
    }

    // MARK: Share inbox (written by the share extension, read by the app's Share page)

    static var inbox: URL? {
        guard let c = container else { return nil }
        let url = c.appendingPathComponent("Inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    struct InboxItem: Codable {
        var kind: String // image | text | url
        var file: String?
        var width: Int?
        var height: Int?
        var text: String?
    }

    static func readInbox() -> [InboxItem] {
        guard let url = inbox?.appendingPathComponent("items.json"), let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([InboxItem].self, from: data)) ?? []
    }

    static func writeInbox(_ items: [InboxItem]) {
        guard let url = inbox?.appendingPathComponent("items.json"), let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clearInbox() {
        guard let url = inbox else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
