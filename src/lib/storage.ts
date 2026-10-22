import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

// File storage behind one small interface (008-document-esignature research.md R1). The default
// keeps files on local disk under STORAGE_DIR; swap in an S3-backed implementation with
// setStorage() once one is configured. Keys are opaque and generated server-side (never a client
// filename), so a key can't escape the storage root.
export interface FileStorage {
  put(data: Buffer, opts: { contentType: string; prefix: string }): Promise<string>;
  open(key: string): Promise<Readable>;
  // Deletes a stored file; a missing file is not an error (020 FR-010 data removal).
  remove(key: string): Promise<void>;
}

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const root = path.resolve(this.root);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("invalid storage key");
    return full;
  }

  async put(data: Buffer, opts: { contentType: string; prefix: string }): Promise<string> {
    const key = `${opts.prefix.replace(/[^a-z0-9/_-]/gi, "")}/${randomUUID()}`;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: "wx" });
    return key;
  }

  async open(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await stat(full); // throws ENOENT before streaming starts
    return createReadStream(full);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

let storage: FileStorage = new LocalDiskStorage(process.env.STORAGE_DIR ?? path.resolve("storage"));

export function setStorage(next: FileStorage): void {
  storage = next;
}

export function getStorage(): FileStorage {
  return storage;
}
