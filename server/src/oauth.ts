import type { Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { getAuthToken } from "./firestore.js";

// In-memory stores — suitable for single-instance Cloud Run; for multi-instance use Firestore with TTL
type Client = {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  createdAt: number;
};

type AuthCode = {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  expiresAt: number;
  // we validate collection key at authorize step, so code is only issued if user proved knowledge of it
};

type AccessToken = {
  token: string;
  client_id: string;
  scope?: string;
  expiresAt: number;
  refreshToken?: string;
};

const clients = new Map<string, Client>();
const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, AccessToken>(); // refresh -> access mapping; actually map refreshToken string -> AccessToken

function randId(prefix = ""): string {
  return prefix + randomBytes(16).toString("hex");
}

function randToken(): string {
  // 32 bytes base64url ~ 43 chars
  return randomBytes(32).toString("base64url");
}

function base64URLEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function verifyPKCE(verifier: string, challenge: string, method: string | undefined): boolean {
  if (!challenge) return true; // no challenge → no verification
  const m = (method || "plain").toLowerCase();
  if (m === "plain") return verifier === challenge;
  if (m === "s256") {
    const hash = createHash("sha256").update(verifier).digest();
    return base64URLEncode(hash) === challenge;
  }
  return false;
}

export function getIssuer(req: Request): string {
  // Prefer explicit env override for Cloud Run custom domain
  if (process.env.OAUTH_ISSUER) return process.env.OAUTH_ISSUER.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "localhost:8080";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function issuerFor(req: Request): string {
  return getIssuer(req);
}

// Cleanup expired entries periodically — only authCodes expire (10 min); tokens are indefinite
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
}, 60_000).unref();

export function isValidOAuthToken(token: string): boolean {
  if (!token) return false;
  if (accessTokens.has(token)) return true;
  if (refreshTokens.has(token)) return true;
  // Stateless fallback: MCP_TOKEN itself (survives restarts)
  const expected = getAuthToken();
  if (expected && token === expected) return true;
  return false;
}

// ── Discovery ────────────────────────────────────────────────────────────

export function handleProtectedResourceMetadata(req: Request, res: Response): void {
  const issuer = issuerFor(req);
  // Resource is the MCP endpoint. Also advertise root as resource for broader compatibility.
  res.json({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    // Provide alternative resource forms some clients probe
    // resource_documentation: `${issuer}/health`,
  });
}

export function handleAuthorizationServerMetadata(req: Request, res: Response): void {
  const issuer = issuerFor(req);
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    scopes_supported: ["mcp", "openid", "profile"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256", "plain"],
    revocation_endpoint: `${issuer}/revoke`,
    // CIMD related — Claude supports Client ID Metadata Document
    // We advertise we support it by handling client_id URLs
    // https://datatracker.ietf.org/doc/draft-parecki-oauth-client-id-metadata-document/
  });
}

// ── Dynamic Client Registration ─────────────────────────────────────────

export function handleRegister(req: Request, res: Response): void {
  // Accept both JSON and urlencoded? Claude sends JSON
  const body = req.body || {};
  let redirectUris: string[] = [];
  if (Array.isArray(body.redirect_uris)) redirectUris = body.redirect_uris;
  else if (typeof body.redirect_uris === "string") redirectUris = [body.redirect_uris];
  else if (Array.isArray(body.redirectUris)) redirectUris = body.redirectUris;

  // If no redirect_uris provided but this is a CIMD pre-registration, still allow
  // For Claude CIMD mode, DCR may not be called at all — client_id is a URL. So we keep this permissive.
  if (redirectUris.length === 0 && body.client_name) {
    // Allow empty for testing; otherwise require at least one
    // If still empty, create with empty list and authorize will validate dynamically
  }

  const clientId = `cl_${randomBytes(12).toString("hex")}`;
  // Only issue secret if client explicitly requests confidential method
  const authMethod = body.token_endpoint_auth_method || body.token_endpoint_auth_methods_supported;
  let clientSecret: string | undefined;
  if (authMethod && authMethod !== "none" && authMethod !== "client_secret_none") {
    clientSecret = randomBytes(24).toString("base64url");
  }

  const client: Client = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    client_name: body.client_name || body.clientName,
    createdAt: Date.now(),
  };
  clients.set(clientId, client);

  const nowSec = Math.floor(Date.now() / 1000);
  res.status(201).json({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    client_id_issued_at: nowSec,
    client_secret_expires_at: 0, // never expires
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: body.scope || "mcp",
    token_endpoint_auth_method: clientSecret ? "client_secret_post" : "none",
    client_name: client.client_name,
  });
}

// ── Authorization ────────────────────────────────────────────────────────

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function handleAuthorizeGet(req: Request, res: Response): void {
  const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, resource } = req.query as Record<string, string>;

  // Basic validation — we are permissive for client_id (support CIMD URLs)
  if (!client_id) {
    res.status(400).send(htmlPage("Missing client_id", `<p>Missing <code>client_id</code> query param. Claude should provide it.</p>`));
    return;
  }
  // If response_type is present, enforce code
  if (response_type && response_type !== "code") {
    res.status(400).send(htmlPage("Unsupported response_type", `<p>Only <code>response_type=code</code> is supported.</p>`));
    return;
  }

  // Lookup client if registered; otherwise treat as CIMD/public client (allow any redirect_uri)
  const client = clients.get(client_id);
  // For CIMD, client_id is https URL — allow any redirect_uri
  const isCimd = client_id.startsWith("https://") || client_id.startsWith("http://");
  if (client && redirect_uri && client.redirect_uris.length > 0 && !client.redirect_uris.includes(redirect_uri)) {
    // Allow Claude's redirect_uri even if not pre-registered (some clients use varying localhost ports)
    // Log but don't block strictly — permissive for demo
    console.warn(`[oauth] redirect_uri mismatch for ${client_id}: got ${redirect_uri}, registered ${client.redirect_uris.join(",")} — allowing`);
  }

  // Show form asking for collection key (the shared secret)
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(authorizeFormHtml({
    clientId: client_id,
    clientName: client?.client_name,
    scope: scope || "mcp",
    state: state || "",
    redirectUri: redirect_uri || "",
    resource: resource || "",
    codeChallenge: code_challenge || "",
    codeChallengeMethod: code_challenge_method || "",
    error: "",
    qs,
  }));
}

export function handleAuthorizePost(req: Request, res: Response): void {
  // Form posts as urlencoded; also handle JSON if needed
  const body = req.body || {};
  const tokenInput = (body.token || body.collection_key || body.collectionKey || body.password || "").toString().trim();
  const client_id = (body.client_id || req.query.client_id || "").toString();
  const redirect_uri = (body.redirect_uri || req.query.redirect_uri || "").toString();
  const state = (body.state || req.query.state || "").toString();
  const scope = (body.scope || req.query.scope || "mcp").toString();
  const code_challenge = (body.code_challenge || req.query.code_challenge || "").toString();
  const code_challenge_method = (body.code_challenge_method || req.query.code_challenge_method || "").toString();
  const resource = (body.resource || req.query.resource || "").toString();

  if (!client_id || !redirect_uri) {
    res.status(400).send(htmlPage("Missing params", `<p>Missing <code>client_id</code> or <code>redirect_uri</code>.</p>`));
    return;
  }

  const expected = getAuthToken();
  const isValidToken = expected && tokenInput && tokenInput === expected;

  if (!isValidToken) {
    const qs = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri,
      scope,
      state,
      ...(code_challenge ? { code_challenge, code_challenge_method } : {}),
      ...(resource ? { resource } : {}),
    }).toString();
    res.status(401);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      authorizeFormHtml({
        clientId: client_id,
        scope,
        state,
        redirectUri: redirect_uri,
        resource,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        error: "Invalid token.",
        qs,
      })
    );
    return;
  }

  // Valid — issue code and redirect
  const code = `yc_${randomBytes(16).toString("base64url")}`;
  authCodes.set(code, {
    code,
    client_id,
    redirect_uri,
    scope,
    code_challenge: code_challenge || undefined,
    code_challenge_method: code_challenge_method || undefined,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  // Some clients expect `iss` param
  // redirectUrl.searchParams.set("iss", getIssuer(req));

  res.redirect(302, redirectUrl.toString());
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#e6e6e6;background:#121212}h1{font-size:22px}a{color:#8ab4f8}code{background:#2a2a2a;padding:2px 6px;border-radius:4px;word-break:break-all}input{width:100%;max-width:100%;display:block;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #444;background:#1e1e1e;color:#fff;font-size:16px;margin:8px 0}button{padding:10px 18px;border-radius:8px;border:0;background:#8ab4f8;color:#000;font-weight:600;cursor:pointer;font-size:15px}button:hover{opacity:0.9}.card{border:1px solid #333;border-radius:12px;padding:20px;background:#1a1a1a;overflow:hidden}.muted{color:#999;font-size:13px}.error{background:#3a1a1a;border:1px solid #7a2a2a;padding:10px;border-radius:8px;margin:10px 0}</style></head><body>${body}</body></html>`;
}

function authorizeFormHtml(opts: {
  clientId: string;
  clientName?: string;
  scope: string;
  state: string;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error: string;
  qs: string;
}): string {
  const title = "Yes Chef — Authorize";
  const safeClient = htmlEscape(opts.clientName || opts.clientId.slice(0, 32));
  const body = `
    <h1>Yes Chef Cookbook — Authorize</h1>
    <div class="card">
      <p><strong>Claude</strong> wants to connect to <code>${htmlEscape(opts.redirectUri || "your redirect URI")}</code></p>
      <p class="muted">Client: <code>${htmlEscape(opts.clientId)}</code> ${opts.clientName ? `(${safeClient})` : ""} • Scope: <code>${htmlEscape(opts.scope)}</code></p>
      ${opts.error ? `<div class="error">${opts.error}</div>` : ""}
      <form method="POST" action="/authorize?${opts.qs}">
        <label for="token">Access token</label>
        <input id="token" name="token" type="password" placeholder="Enter access token" required autofocus />
        <input type="hidden" name="client_id" value="${htmlEscape(opts.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${htmlEscape(opts.redirectUri)}" />
        <input type="hidden" name="scope" value="${htmlEscape(opts.scope)}" />
        <input type="hidden" name="state" value="${htmlEscape(opts.state)}" />
        <input type="hidden" name="resource" value="${htmlEscape(opts.resource)}" />
        <input type="hidden" name="code_challenge" value="${htmlEscape(opts.codeChallenge)}" />
        <input type="hidden" name="code_challenge_method" value="${htmlEscape(opts.codeChallengeMethod)}" />
        <button type="submit">Authorize</button>
      </form>
    </div>
    <p class="muted">Enter the collection token to authorize. Access is indefinite — no expiry or refresh needed.</p>
  `;
  return htmlPage(title, body);
}

// ── Token ─────────────────────────────────────────────────────────────────

export function handleToken(req: Request, res: Response): void {
  // Body is x-www-form-urlencoded or JSON
  const body: Record<string, string> = req.body || {};
  // Also parse query fallback?
  const grantType = (body.grant_type || req.query.grant_type || "").toString();
  if (!grantType) {
    res.status(400).json({ error: "invalid_request", error_description: "grant_type required" });
    return;
  }

  if (grantType === "authorization_code") {
    const code = (body.code || "").toString();
    const redirectUri = (body.redirect_uri || "").toString();
    const clientId = (body.client_id || "").toString();
    const codeVerifier = (body.code_verifier || "").toString();

    if (!code) {
      res.status(400).json({ error: "invalid_request", error_description: "code required" });
      return;
    }
    const entry = authCodes.get(code);
    if (!entry) {
      res.status(400).json({ error: "invalid_grant", error_description: "invalid or expired code" });
      return;
    }
    if (entry.expiresAt < Date.now()) {
      authCodes.delete(code);
      res.status(400).json({ error: "invalid_grant", error_description: "code expired" });
      return;
    }
    // Validate client_id if provided (CIMD vs DCR — allow any if mismatch but log)
    if (clientId && entry.client_id !== clientId) {
      // For CIMD, client_id may be URL same as authorize step; enforce match strictly
      // But be permissive: if entry client_id is URL and provided is same URL, else allow
      console.warn(`[oauth] token client_id mismatch: expected ${entry.client_id}, got ${clientId}`);
      // Still enforce if not matching exactly and not both URLs
      // We'll not reject to keep compatibility; comment out strict check
      // res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" }); return;
    }
    if (redirectUri && entry.redirect_uri !== redirectUri) {
      // Permissive: log but allow
      console.warn(`[oauth] redirect_uri mismatch on token: expected ${entry.redirect_uri}, got ${redirectUri}`);
    }
    if (entry.code_challenge) {
      if (!codeVerifier) {
        res.status(400).json({ error: "invalid_request", error_description: "code_verifier required" });
        return;
      }
      if (!verifyPKCE(codeVerifier, entry.code_challenge, entry.code_challenge_method)) {
        console.error(`[oauth] PKCE verification failed`);
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
    }

    // Issue tokens — stateless indefinite: use RECIPES_COLLECTION as token itself
    // Survives Cloud Run restarts/scale-to-zero; validated via provided === expected in requireMcpAuth
    const statelessToken = getAuthToken();
    const expiresIn = 2147483647; // ~68 years, effectively indefinite for Claude
    const expiresAt = Number.MAX_SAFE_INTEGER;
    const atEntry: AccessToken = {
      token: statelessToken,
      client_id: entry.client_id,
      scope: entry.scope,
      expiresAt,
      refreshToken: statelessToken,
    };
    accessTokens.set(statelessToken, atEntry);
    refreshTokens.set(statelessToken, { ...atEntry, token: statelessToken, expiresAt: Number.MAX_SAFE_INTEGER });
    authCodes.delete(code);

    res.json({
      access_token: statelessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: entry.scope || "mcp",
      refresh_token: statelessToken,
    });
    return;
  }

  if (grantType === "refresh_token") {
    const refreshToken = (body.refresh_token || "").toString();
    const clientId = (body.client_id || "").toString();
    if (!refreshToken) {
      res.status(400).json({ error: "invalid_request", error_description: "refresh_token required" });
      return;
    }
     // Stateless token: any refresh with valid MCP_TOKEN succeeds, even if Map empty after restart
     const expected = getAuthToken();
     const isStatelessRefresh = expected && refreshToken === expected;
    let entry = refreshTokens.get(refreshToken);
    if (!entry && !isStatelessRefresh) {
      res.status(400).json({ error: "invalid_grant", error_description: "invalid refresh_token" });
      return;
    }
    if (clientId && entry && entry.client_id !== clientId) {
      console.warn(`[oauth] refresh client_id mismatch`);
    }
    const statelessToken = expected;
    const expiresIn = 2147483647;
    const expiresAt = Number.MAX_SAFE_INTEGER;
    const atEntry: AccessToken = {
      token: statelessToken,
      client_id: entry?.client_id || clientId || "stateless",
      scope: entry?.scope || "mcp",
      expiresAt,
      refreshToken: statelessToken,
    };
    accessTokens.set(statelessToken, atEntry);
    refreshTokens.set(statelessToken, { ...atEntry, token: statelessToken, expiresAt: Number.MAX_SAFE_INTEGER });
    res.json({
      access_token: statelessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: entry?.scope || "mcp",
      refresh_token: statelessToken,
    });
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type", error_description: `grant_type ${grantType} not supported` });
}

export function handleRevoke(req: Request, res: Response): void {
  const body = req.body || {};
  const token = (body.token || body.access_token || "").toString();
  const hint = (body.token_type_hint || "").toString();
  if (token) {
    if (hint === "refresh_token") refreshTokens.delete(token);
    else {
      accessTokens.delete(token);
      refreshTokens.delete(token);
    }
  }
  // Always return 200 per RFC 7009
  res.json({});
}
