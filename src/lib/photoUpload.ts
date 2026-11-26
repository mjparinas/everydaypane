// Getting a phone photo ready to send (Settings › Photos and the family's phones): shrunk in the browser to at most
// 2048 px JPEG, so a 12 MB photo goes up as a few hundred KB under Vercel's request limit, and the day it was taken,
// read from its EXIF, so "On this day" on the photo frame knows it (photo frame polish, 2026-11-26).

export const UPLOAD_MAX_SIDE = 2048;

/** The EXIF DateTimeOriginal (else DateTime) of a JPEG as YYYY-MM-DD, or null. Reads only the file's first 128 KB. */
export function exifDate(bytes: Uint8Array): string | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    const size = view.getUint16(at + 2);
    // APP1 with "Exif\0\0".
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") return tiffDate(view, at + 10);
    if (marker === 0xda) return null;
    at += 2 + size;
  }
  return null;
}

function tiffDate(view: DataView, base: number): string | null {
  if (base + 8 > view.byteLength) return null;
  const little = view.getUint16(base) === 0x4949;
  const u16 = (o: number) => view.getUint16(base + o, little);
  const u32 = (o: number) => view.getUint32(base + o, little);
  const read = (ifd: number, want: number): number | null => {
    if (base + ifd + 2 > view.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (base + e + 12 > view.byteLength) return null;
      if (u16(e) === want) return u32(e + 8);
    }
    return null;
  };
  const text = (offset: number | null) => {
    if (offset === null || base + offset + 10 > view.byteLength) return null;
    let s = "";
    for (let i = 0; i < 10; i++) s += String.fromCharCode(view.getUint8(base + offset + i));
    const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(s);
    return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
  };
  try {
    const ifd0 = u32(4);
    const exif = read(ifd0, 0x8769);
    return (exif !== null ? text(read(exif, 0x9003)) : null) ?? text(read(ifd0, 0x0132));
  } catch {
    return null;
  }
}

export async function prepareUpload(file: File): Promise<{ blob: Blob; w: number; h: number; taken: string | null }> {
  const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
  const taken = exifDate(head);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that picture");
  return { blob, w, h, taken };
}

export const isPicture = (f: File) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
