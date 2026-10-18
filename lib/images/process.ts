import "server-only";
import { encode } from "blurhash";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 4;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);

export class ImageRejected extends Error {
  constructor(public readonly reason: "too_large" | "not_an_image" | "unreadable") {
    super(reason);
  }
}

export type ProcessedImage = {
  width: number;
  height: number;
  blurhash: string;
  variants: { width: number; data: Buffer }[];
};

/**
 * Upload pipeline (SPEC §10.1). The real type is sniffed from magic bytes,
 * never the extension or the client's MIME. The image is fully decoded and
 * re-encoded to WebP; sharp writes no metadata unless asked, so EXIF (GPS),
 * XMP, ICC comments and anything appended to the file are dropped.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageRejected("too_large");
  const type = await fileTypeFromBuffer(input);
  if (!type || !ALLOWED.has(type.mime)) throw new ImageRejected("not_an_image");

  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    // EXIF orientations 5–8 are rotated 90°, so width and height swap.
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;

    // rotate() applies the EXIF orientation before the metadata is discarded.
    const base = sharp(input, { failOn: "error", limitInputPixels: 60_000_000 }).rotate();
    const widths = [...new Set(VARIANT_WIDTHS.map((w) => Math.min(w, width)))];
    const variants = await Promise.all(
      widths.map(async (w) => ({
        width: w,
        data: await base
          .clone()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toBuffer(),
      })),
    );

    const tiny = await base
      .clone()
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const blurhash = encode(
      new Uint8ClampedArray(tiny.data),
      tiny.info.width,
      tiny.info.height,
      4,
      3,
    );
    return { width, height, blurhash, variants };
  } catch {
    throw new ImageRejected("unreadable");
  }
}
