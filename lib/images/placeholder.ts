import "server-only";
import { decode } from "blurhash";
import sharp from "sharp";

const cache = new Map<string, string>();

/**
 * Blurhash → tiny PNG data URI, rendered server-side so placeholders show
 * without JavaScript and without inline styles (which the CSP forbids).
 */
export async function placeholderDataUri(blurhash: string, width: number, height: number) {
  const key = `${blurhash}:${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 16;
  const h = Math.max(1, Math.round((16 * height) / width));
  const pixels = decode(blurhash, w, h);
  const png = await sharp(Buffer.from(pixels), { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  const uri = `data:image/png;base64,${png.toString("base64")}`;
  if (cache.size > 2000) cache.clear();
  cache.set(key, uri);
  return uri;
}
