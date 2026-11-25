import { requireNativeModule } from 'expo';

type FrameJpegNative = {
  encodeBgraToJpegAsync(
    data: Uint8Array,
    width: number,
    height: number,
    quality: number,
  ): Promise<Uint8Array>;
};

const native = requireNativeModule<FrameJpegNative>('MyModule');

/** プレビュー BGRA バッファを JPEG バイナリに変換（iOS ネイティブ） */
export async function encodeBgraToJpeg(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  quality = 0.45,
): Promise<ArrayBuffer> {
  const jpeg = await native.encodeBgraToJpegAsync(new Uint8Array(pixels), width, height, quality);
  const ab = new ArrayBuffer(jpeg.byteLength);
  new Uint8Array(ab).set(jpeg);
  return ab;
}