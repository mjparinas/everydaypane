import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Shrinks a picture to at most `maxSide` pixels as JPEG without decoding it whole (share extensions get very little
/// memory). The same 2048 px the web uploader uses, so the photo frame gets what it always gets.
enum ImageShrink {
    static func jpeg(from source: CGImageSource, maxSide: Int = 2048) -> (data: Data, width: Int, height: Int)? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, opts as CFDictionary) else { return nil }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return (out as Data, image.width, image.height)
    }

    static func jpeg(from url: URL) -> (data: Data, width: Int, height: Int)? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return jpeg(from: src)
    }

    static func jpeg(from data: Data) -> (data: Data, width: Int, height: Int)? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return jpeg(from: src)
    }
}
