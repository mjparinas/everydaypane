import { describe, expect, it } from "vitest";

import { exifDate } from "./photoUpload";

/** A JPEG start with an EXIF block: IFD0 holding DateTime and a pointer to the Exif IFD with DateTimeOriginal. */
function jpegWithExif(original: string | null, modified: string, little = true): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) =>
    little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // Header (8) + IFD0 with 2 entries (2 + 24 + 4 = 30) at 8, Exif IFD with 1 entry (2 + 12 + 4 = 18) at 38, strings after.
  const exifAt = 38;
  const modAt = 56;
  const origAt = 76;
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(
    ...u16(2),
    ...u16(0x0132),
    ...u16(2),
    ...u32(20),
    ...u32(modAt),
    ...u16(0x8769),
    ...u16(4),
    ...u32(1),
    ...u32(exifAt),
    ...u32(0),
  );
  tiff.push(...u16(original ? 1 : 0));
  if (original) tiff.push(...u16(0x9003), ...u16(2), ...u32(20), ...u32(origAt));
  else tiff.push(...new Array<number>(12).fill(0));
  tiff.push(...u32(0));
  tiff.push(...ascii(modified));
  if (original) tiff.push(...ascii(original));
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = body.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 0xff, ...body, 0xff, 0xd9]);
}

describe("exifDate", () => {
  it("reads the day a photo was taken", () => {
    expect(exifDate(jpegWithExif("2019:11:26 09:12:00", "2024:01:02 10:00:00"))).toBe("2019-11-26");
    expect(exifDate(jpegWithExif("2018:07:04 20:00:00", "2024:01:02 10:00:00", false))).toBe("2018-07-04");
  });

  it("falls back to the file's own date, and says nothing for other pictures", () => {
    expect(exifDate(jpegWithExif(null, "2024:01:02 10:00:00"))).toBe("2024-01-02");
    expect(exifDate(jpegWithExif(null, "0000:00:00 00:00:00"))).toBeNull();
    expect(exifDate(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(exifDate(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda]))).toBeNull();
  });
});
