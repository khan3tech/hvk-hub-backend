import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for small secrets at rest (e.g. 013 TOTP seeds), so a database read alone can't
// mint second-factor codes. Key: SECRETS_ENCRYPTION_KEY (any string, hashed to 32 bytes); falls
// back to a key derived from JWT_ACCESS_SECRET so dev/test needs no extra config.
function key(): Buffer {
  const material = process.env.SECRETS_ENCRYPTION_KEY ?? `${process.env.JWT_ACCESS_SECRET ?? ""}:secretbox`;
  if (material === ":secretbox") throw new Error("SECRETS_ENCRYPTION_KEY (or JWT_ACCESS_SECRET) is not configured");
  return createHash("sha256").update(material).digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("unrecognised sealed value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
