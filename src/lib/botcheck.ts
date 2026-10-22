import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { DomainError } from "../middleware/errorHandler.js";

// Bot mitigation for public, unauthenticated forms (020 FR-007), with no third-party CAPTCHA.
// The client fetches a signed challenge, finds a `solution` such that
//   sha256(nonce + ":" + solution) starts with `bits` zero bits   (hashcash-style proof of work)
// and submits it with the form. Also enforced: a minimum fill time, an empty honeypot field, and
// single use per challenge. ~2^16 hashes take a browser well under a second but make bulk
// submissions expensive. Swap in a hosted CAPTCHA later by replacing verifyHumanCheck().
const BITS = Number(process.env.BOT_POW_BITS ?? 16);
const MIN_FILL_MS = Number(process.env.BOT_MIN_FILL_MS ?? 3000);
const MAX_AGE_S = 2 * 60 * 60;
const used = new Map<string, number>(); // nonce -> expiry (ms); single-instance replay guard

function secret() {
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) throw new Error("JWT_ACCESS_SECRET is not configured");
  return `${base}:bot-challenge`;
}

export function issueChallenge(purpose: string) {
  const nonce = randomBytes(16).toString("hex");
  const token = jwt.sign({ nonce, purpose, bits: BITS, issuedAt: Date.now() }, secret(), { expiresIn: MAX_AGE_S });
  return { challenge: token, nonce, bits: BITS, minFillMs: MIN_FILL_MS };
}

export function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export function verifyHumanCheck(input: { challenge?: string; solution?: string; honeypot?: string }, purpose: string, now = Date.now()) {
  const fail = () => new DomainError("BOT_CHECK_FAILED", "We couldn't verify this submission. Please reload the page and try again.", 400);
  if (input.honeypot) throw fail();
  if (!input.challenge || !input.solution || input.solution.length > 64) throw fail();
  let payload: { nonce: string; purpose: string; bits: number; issuedAt: number };
  try {
    payload = jwt.verify(input.challenge, secret()) as typeof payload;
  } catch {
    throw fail();
  }
  if (payload.purpose !== purpose || now - payload.issuedAt < MIN_FILL_MS) throw fail();
  const digest = createHash("sha256").update(`${payload.nonce}:${input.solution}`).digest();
  if (leadingZeroBits(digest) < payload.bits) throw fail();

  for (const [n, exp] of used) if (exp < now) used.delete(n);
  if (used.has(payload.nonce)) throw fail();
  used.set(payload.nonce, now + MAX_AGE_S * 1000);
}
