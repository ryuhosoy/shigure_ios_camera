import ExpoModulesCore
import UIKit

/// センサー生バッファ（横向き）を、表示と同じ向きにするため反時計回りに 90° 回転する。
private func rotateCgImage90CounterClockwise(_ image: CGImage) -> CGImage? {
  let w = image.width
  let h = image.height
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let alphaInfo = CGImageAlphaInfo.premultipliedFirst.rawValue
  let byteOrder = CGBitmapInfo.byteOrder32Little.rawValue
  let bitmapInfo = CGBitmapInfo(rawValue: alphaInfo | byteOrder)

  guard let context = CGContext(
    data: nil,
    width: h,
    height: w,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: bitmapInfo.rawValue
  ) else {
    return nil
  }

  context.translateBy(x: 0, y: CGFloat(w))
  context.rotate(by: -.pi / 2)
  context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  return context.makeImage()
}

public class MyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyModule")

    /// BGRA プレビューフレーム（rgb-bgra-8-bit）を JPEG にエンコード。写真 API は使わないためシャッター音なし。
    AsyncFunction("encodeBgraToJpegAsync") { (data: Data, width: Int, height: Int, quality: Double) -> Data in
      let bytesPerRow = width * 4
      let expected = bytesPerRow * height
      guard data.count >= expected else {
        throw Exception(name: "InvalidBuffer", description: "Buffer too small for \(width)x\(height) BGRA")
      }

      guard let provider = CGDataProvider(data: data as CFData) else {
        throw Exception(name: "EncodeError", description: "Failed to create data provider")
      }

      let alphaInfo = CGImageAlphaInfo.premultipliedFirst.rawValue
      let byteOrder = CGBitmapInfo.byteOrder32Little.rawValue
      let bitmapInfo = CGBitmapInfo(rawValue: alphaInfo | byteOrder)

      guard let cgImage = CGImage(
        width: width,
        height: height,
        bitsPerComponent: 8,
        bitsPerPixel: 32,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo,
        provider: provider,
        decode: nil,
        shouldInterpolate: false,
        intent: .defaultIntent
      ) else {
        throw Exception(name: "EncodeError", description: "Failed to create CGImage")
      }

      guard let oriented = rotateCgImage90CounterClockwise(cgImage) else {
        throw Exception(name: "EncodeError", description: "Failed to rotate image")
      }

      let q = CGFloat(min(max(quality, 0), 1))
      guard let jpeg = UIImage(cgImage: oriented).jpegData(compressionQuality: q) else {
        throw Exception(name: "EncodeError", description: "JPEG compression failed")
      }
      return jpeg
    }
  }
}