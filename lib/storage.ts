import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

/**
 * Photo storage. Private Vercel Blob in deployed environments; a local
 * folder (.data/photos) when no Blob token is set (dev without Vercel, CI).
 * Objects are never publicly addressable: they are served through
 * /api/photos, which checks the item may be shown.
 */
export interface PhotoStorage {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  del(paths: string[]): Promise<void>;
}

const LOCAL_ROOT = join(process.cwd(), ".data", "photos");

function safeLocalPath(path: string): string {
  const full = normalize(join(LOCAL_ROOT, path));
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("invalid storage path");
  return full;
}

const localStorage: PhotoStorage = {
  async put(path, data) {
    const full = safeLocalPath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async get(path) {
    try {
      return await readFile(safeLocalPath(path));
    } catch {
      return null;
    }
  },
  async del(paths) {
    await Promise.all(paths.map((p) => rm(safeLocalPath(p), { force: true })));
  },
};

const blobStorage: PhotoStorage = {
  async put(path, data, contentType) {
    const { put } = await import("@vercel/blob");
    await put(path, data, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  },
  async get(path) {
    const { get } = await import("@vercel/blob");
    const result = await get(path, { access: "private" });
    if (!result?.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async del(paths) {
    if (paths.length === 0) return;
    const { del } = await import("@vercel/blob");
    await del(paths);
  },
};

export function photoStorage(): PhotoStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? blobStorage : localStorage;
}
