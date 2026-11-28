import UIKit
import UniformTypeIdentifiers

/// "Share › Everydaypane" from Photos, Safari, Notes and the like (Melvin, 2026-11-27). Pictures are shrunk to the
/// photo frame's 2048 px and kept with any text or link in the App Group's inbox; then the app opens on its Share
/// page, which sends them to the photo frame, the shopping list or the meal plan. If iOS won't open the app from
/// here, the items wait and the Share page picks them up the next time the app opens.
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private let maxImages = 20

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let label = UILabel()
        label.text = "Sending to Everydaypane…"
        label.font = .preferredFont(forTextStyle: .headline)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await collect() }
    }

    private func collect() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        var items = AppGroup.readInbox()
        var images = items.filter { $0.kind == "image" }.count
        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.image.identifier), images < maxImages {
                if let shrunk = await loadImage(p), let inbox = AppGroup.inbox {
                    let name = "\(UUID().uuidString).jpg"
                    if (try? shrunk.data.write(to: inbox.appendingPathComponent(name), options: .atomic)) != nil {
                        items.append(.init(kind: "image", file: name, width: shrunk.width, height: shrunk.height, text: nil))
                        images += 1
                    }
                }
            } else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !url.isFileURL {
                    items.append(.init(kind: "url", file: nil, width: nil, height: nil, text: url.absoluteString))
                }
            } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let text = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String, !text.isEmpty {
                    items.append(.init(kind: "text", file: nil, width: nil, height: nil, text: String(text.prefix(4000))))
                }
            }
        }
        AppGroup.writeInbox(items)
        await MainActor.run {
            openApp()
            extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private func loadImage(_ p: NSItemProvider) async -> (data: Data, width: Int, height: Int)? {
        // A file URL keeps memory low; some apps only hand over the bytes or a UIImage.
        if let url = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) as? URL, let r = ImageShrink.jpeg(from: url) { return r }
        if let data = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) as? Data, let r = ImageShrink.jpeg(from: data) { return r }
        if let image = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) as? UIImage,
           let data = image.jpegData(compressionQuality: 0.9) {
            return ImageShrink.jpeg(from: data)
        }
        return nil
    }

    /// Extensions may not call UIApplication's open; find the app object on the responder chain and send it the
    /// same message by selector. If that ever stops working, the items still wait in the inbox for the next launch.
    private func openApp() {
        guard let url = URL(string: "everydaypane://share") else { return }
        let sel = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let r = responder {
            if r.responds(to: sel), let imp = r.method(for: sel), NSStringFromClass(type(of: r)).contains("Application") {
                typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, ((Bool) -> Void)?) -> Void
                unsafeBitCast(imp, to: Open.self)(r, sel, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = r.next
        }
    }
}
