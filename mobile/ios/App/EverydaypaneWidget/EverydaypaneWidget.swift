import SwiftUI
import WidgetKit

/// The home-screen widget (Melvin, 2026-11-27: "native add to homepage for Android, iOS"): tonight's dinner, the
/// shopping list and chores left today, read from /api/mobile/widget/ with the app token the app keeps in the App
/// Group. Small shows dinner and counts; medium adds shopping items; large adds who has chores left.

struct Summary: Codable {
    struct Dinner: Codable { let label: String; let text: String }
    struct Shopping: Codable { let open: Int; let low: Int; let items: [String] }
    struct Person: Codable { let name: String; let emoji: String; let left: Int }
    struct Chores: Codable { let left: Int; let total: Int; let people: [Person] }
    let today: String
    let dinner: Dinner?
    let shopping: Shopping
    let chores: Chores
    let updatedAt: Double
}

struct PaneEntry: TimelineEntry {
    let date: Date
    let summary: Summary?
    let signedIn: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PaneEntry {
        PaneEntry(date: Date(), summary: Self.sample, signedIn: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (PaneEntry) -> Void) {
        if context.isPreview { return completion(placeholder(in: context)) }
        completion(PaneEntry(date: Date(), summary: Self.cached, signedIn: AppGroup.appToken != nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PaneEntry>) -> Void) {
        let next = Date().addingTimeInterval(30 * 60)
        guard let req = AppGroup.apiRequest("/api/mobile/widget/") else {
            return completion(Timeline(entries: [PaneEntry(date: Date(), summary: nil, signedIn: false)], policy: .after(next)))
        }
        URLSession.shared.dataTask(with: req) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 200, let data = data, let s = try? JSONDecoder().decode(Summary.self, from: data) {
                AppGroup.widgetCache = data
                completion(Timeline(entries: [PaneEntry(date: Date(), summary: s, signedIn: true)], policy: .after(next)))
            } else {
                // Signed out on the server (401), or offline: say so, or keep the last good answer.
                let signedIn = status != 401
                completion(Timeline(entries: [PaneEntry(date: Date(), summary: signedIn ? Self.cached : nil, signedIn: signedIn)], policy: .after(next)))
            }
        }.resume()
    }

    static var cached: Summary? {
        AppGroup.widgetCache.flatMap { try? JSONDecoder().decode(Summary.self, from: $0) }
    }

    static let sample = Summary(
        today: "",
        dinner: .init(label: "Tonight", text: "Tacos"),
        shopping: .init(open: 4, low: 1, items: ["Milk", "Bananas", "Bread", "Eggs"]),
        chores: .init(left: 3, total: 7, people: [.init(name: "Sam", emoji: "🦊", left: 2), .init(name: "Ava", emoji: "🐢", left: 1)]),
        updatedAt: 0)
}

private let brand = Color(red: 59 / 255, green: 91 / 255, blue: 219 / 255)

struct PaneWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: PaneEntry

    var body: some View {
        Group {
            if let s = entry.summary {
                content(s)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Everydaypane").font(.headline).foregroundStyle(brand)
                    Text(entry.signedIn ? "Open the app to load your day." : "Open the app and sign in.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetURL(URL(string: "everydaypane://open"))
        .containerBackground(.fill.tertiary, for: .widget)
    }

    @ViewBuilder
    private func content(_ s: Summary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.dinner?.label ?? "Dinner").font(.caption).foregroundStyle(.secondary)
                Text(s.dinner?.text ?? "Nothing planned").font(.headline).lineLimit(2)
            }
            if family == .systemSmall {
                Spacer(minLength: 0)
                Label("\(s.shopping.open) to buy", systemImage: "cart").font(.caption)
                Label(s.chores.total == 0 ? "No chores" : "\(s.chores.left) chores left", systemImage: "checkmark.circle").font(.caption)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Shopping · \(s.shopping.open)").font(.caption.bold()).foregroundStyle(brand)
                        ForEach(Array(s.shopping.items.prefix(family == .systemLarge ? 6 : 3).enumerated()), id: \.offset) { _, item in
                            Text(item).font(.caption).lineLimit(1)
                        }
                        if s.shopping.open == 0 { Text("All bought").font(.caption).foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Chores · \(s.chores.left) left").font(.caption.bold()).foregroundStyle(brand)
                        ForEach(Array(s.chores.people.prefix(family == .systemLarge ? 6 : 3).enumerated()), id: \.offset) { _, p in
                            Text("\(p.emoji) \(p.name): \(p.left == 0 ? "done" : "\(p.left) left")").font(.caption).lineLimit(1)
                        }
                        if s.chores.total == 0 { Text("None today").font(.caption).foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

@main
struct EverydaypaneWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "EverydaypaneToday", provider: Provider()) { entry in
            PaneWidgetView(entry: entry)
        }
        .configurationDisplayName("Today at Home")
        .description("Dinner, the shopping list and chores left today.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
