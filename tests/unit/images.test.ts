import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageRejected, processImage } from "@/lib/images/process";
import { placeholderDataUri } from "@/lib/images/placeholder";

async function jpegWithGps(width = 2400, height = 1600) {
  let img = sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } },
  }).jpeg();
  img = img.withExif({
    IFD0: { Copyright: "finder-name" },
    IFD3: {
      GPSLatitudeRef: "N",
      GPSLatitude: "35/1 30/1 0/1",
      GPSLongitudeRef: "W",
      GPSLongitude: "80/1 50/1 0/1",
    },
  });
  return img.toBuffer();
}

describe("processImage", () => {
  it("strips all EXIF, including GPS, from every variant", async () => {
    const input = await jpegWithGps();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined();
    expect(inMeta.exif!.toString("latin1")).toContain("finder-name");

    const out = await processImage(input);
    for (const v of out.variants) {
      const meta = await sharp(v.data).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(v.data.toString("latin1")).not.toContain("finder-name");
    }
  });

  it("produces 400/800/1600 WebP variants without upscaling", async () => {
    const big = await processImage(await jpegWithGps(2400, 1600));
    expect(big.variants.map((v) => v.width)).toEqual([400, 800, 1600]);
    expect(big).toMatchObject({ width: 2400, height: 1600 });
    const small = await processImage(await jpegWithGps(600, 400));
    expect(small.variants.map((v) => v.width)).toEqual([400, 600]);
  });

  it("applies EXIF orientation before discarding it", async () => {
    const rotated = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#369" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);
    const out = await processImage(rotated);
    expect(out).toMatchObject({ width: 800, height: 1200 });
    const meta = await sharp(out.variants.at(-1)!.data).metadata();
    expect(meta.height).toBeGreaterThan(meta.width!);
  });

  it("produces a decodable blurhash and placeholder", async () => {
    const out = await processImage(await jpegWithGps(800, 600));
    expect(out.blurhash.length).toBeGreaterThan(6);
    const uri = await placeholderDataUri(out.blurhash, out.width, out.height);
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });

  it("sniffs the real type: a PNG is accepted whatever it is called", async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 4, background: "#fff" } })
      .png()
      .toBuffer();
    await expect(processImage(png)).resolves.toMatchObject({ width: 50 });
  });

  it("rejects non-images, even with an image-like name or header", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    await expect(processImage(html)).rejects.toMatchObject({ reason: "not_an_image" });
    const pdf = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj");
    await expect(processImage(pdf)).rejects.toBeInstanceOf(ImageRejected);
  });

  it("rejects truncated images", async () => {
    const jpeg = await jpegWithGps(800, 600);
    await expect(processImage(jpeg.subarray(0, 400))).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("rejects files over 10MB before decoding", async () => {
    await expect(processImage(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject({
      reason: "too_large",
    });
  });
});
