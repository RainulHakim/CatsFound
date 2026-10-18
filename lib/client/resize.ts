/**
 * Shrinks a photo in the browser before upload: faster on campus wifi and
 * keeps four photos under the request size limit. Re-encoding through a
 * canvas also drops EXIF (incl. GPS) before the file leaves the phone. The
 * server re-encodes again regardless; this is an optimisation, not the guard.
 */
export const MAX_EDGE = 1600;

export async function resizePhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    // Old browser or an unsupported format (e.g. HEIC on desktop): send as-is.
    return file;
  }
}
