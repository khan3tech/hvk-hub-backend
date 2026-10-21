// OpenID Connect authorization-code flow (with PKCE) for Google and Microsoft (013 FR-001/002),
// behind a small interface so tests can substitute a fake provider. Client IDs/secrets come from
// the environment only — never stored in the database or returned by the API.
import { createHash, createPublicKey, randomBytes, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Provider } from "./schema.js";

export interface VerifiedIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export interface OidcProvider {
  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string; nonce: string }): Promise<VerifiedIdentity>;
}

interface Endpoints {
  clientId: string;
  clientSecret: string;
  authorize: string;
  token: string;
  jwks: string;
  issuer: (claims: Record<string, unknown>) => boolean;
  email: (claims: Record<string, unknown>) => { email?: string; verified: boolean };
}

function endpoints(provider: Provider): Endpoints | null {
  if (provider === "GOOGLE") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      jwks: "https://www.googleapis.com/oauth2/v3/certs",
      issuer: (c) => c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com",
      email: (c) => ({ email: c.email as string | undefined, verified: c.email_verified === true }),
    };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  // A specific tenant id is strongly recommended; "organizations" accepts any work account.
  const tenant = process.env.MICROSOFT_TENANT_ID ?? "organizations";
  const base = `https://login.microsoftonline.com/${tenant}`;
  return {
    clientId,
    clientSecret,
    authorize: `${base}/oauth2/v2.0/authorize`,
    token: `${base}/oauth2/v2.0/token`,
    jwks: `${base}/discovery/v2.0/keys`,
    issuer: (c) =>
      typeof c.iss === "string" &&
      typeof c.tid === "string" &&
      c.iss === `https://login.microsoftonline.com/${c.tid}/v2.0` &&
      (tenant === "organizations" || tenant === "common" || c.tid === tenant),
    // Work accounts' UPN/email is managed by the tenant admin, so treated as verified.
    email: (c) => ({ email: (c.email ?? c.preferred_username) as string | undefined, verified: true }),
  };
}

export function providerConfigured(provider: Provider): boolean {
  return endpoints(provider) !== null;
}

const jwksCache = new Map<string, { at: number; keys: Map<string, KeyObject> }>();

async function signingKey(jwksUrl: string, kid: string): Promise<KeyObject> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000 && cached.keys.has(kid)) return cached.keys.get(kid)!;
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Array<{ kid: string } & Record<string, unknown>> };
  const map = new Map(keys.map((k) => [k.kid, createPublicKey({ key: k as never, format: "jwk" })]));
  jwksCache.set(jwksUrl, { at: Date.now(), keys: map });
  const key = map.get(kid);
  if (!key) throw new Error("unknown signing key");
  return key;
}

class HttpOidcProvider implements OidcProvider {
  constructor(private readonly ep: Endpoints, private readonly scope: string) {}

  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string; redirectUri: string }): string {
    const q = new URLSearchParams({
      client_id: this.ep.clientId,
      response_type: "code",
      scope: this.scope,
      redirect_uri: p.redirectUri,
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `${this.ep.authorize}?${q.toString()}`;
  }

  async exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string; nonce: string }): Promise<VerifiedIdentity> {
    const res = await fetch(this.ep.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: p.code,
        redirect_uri: p.redirectUri,
        client_id: this.ep.clientId,
        client_secret: this.ep.clientSecret,
        code_verifier: p.codeVerifier,
      }),
    });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    if (!idToken) throw new Error("no id_token returned");
    const header = jwt.decode(idToken, { complete: true })?.header;
    if (!header?.kid) throw new Error("id_token has no key id");
    const claims = jwt.verify(idToken, await signingKey(this.ep.jwks, header.kid), {
      algorithms: ["RS256"],
      audience: this.ep.clientId,
    }) as Record<string, unknown>;
    if (!this.ep.issuer(claims)) throw new Error("unexpected issuer");
    if (claims.nonce !== p.nonce) throw new Error("nonce mismatch");
    const { email, verified } = this.ep.email(claims);
    if (typeof claims.sub !== "string" || !email) throw new Error("id_token lacks subject or email");
    return { sub: claims.sub, email: email.toLowerCase(), emailVerified: verified };
  }
}

let factory: (provider: Provider) => OidcProvider | null = (provider) => {
  const ep = endpoints(provider);
  return ep ? new HttpOidcProvider(ep, "openid email profile") : null;
};

export function setOidcProviderFactory(next: (provider: Provider) => OidcProvider | null): void {
  factory = next;
}

export function getOidcProvider(provider: Provider): OidcProvider | null {
  return factory(provider);
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
