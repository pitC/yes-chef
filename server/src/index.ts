#!/usr/bin/env node
import express from "express";
import cors from "cors";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.js";
import { getAuthToken } from "./firestore.js";
import { handleListRecipes, handleGetRecipe, handleGetMetadata } from "./api.js";
import {
  getIssuer,
  handleAuthorizationServerMetadata,
  handleProtectedResourceMetadata,
  handleRegister,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleToken,
  handleRevoke,
  resolveCollectionForToken,
} from "./oauth.js";

// Load .env if present (optional, no extra dep)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), "mcp-server/.env"),
];
for (const p of candidates) loadEnvFile(p);

const isStdio = process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";

async function runStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] Running in stdio mode");
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(
    cors({
      origin: true,
      // Claude and other MCP clients send Authorization; must be exposed for CORS preflight
      allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key", "X-Collection-Key", "Accept", "Mcp-Session-Id"],
      exposedHeaders: ["WWW-Authenticate"],
    })
  );
  // Bodies: JSON for MCP + urlencoded/json for OAuth token/register/authorize
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ── Multi-tenant token auth — each cookbook code is a bearer token ──
  // Backed by Firestore metadata existence, not a single MCP_TOKEN env var (legacy fallback kept).
  // Compatible with Claude: expects `Authorization: Bearer <token>` header.
  // Health checks are unauthenticated.
  function extractBearerToken(req: express.Request): string | undefined {
    // 1) Standard Authorization: Bearer <token> (Claude, curl, MCP clients)
    const auth = (req.headers.authorization || req.headers.Authorization) as string | undefined;
    if (auth) {
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) return m[1].trim();
      // Also accept raw token without "Bearer" prefix for convenience
      if (!auth.includes(" ") && auth.trim()) return auth.trim();
    }
    // 2) Alternative header for manual testing / proxies
    const apiKey = (req.headers["x-api-key"] || req.headers["x-collection-key"]) as string | undefined;
    if (apiKey && typeof apiKey === "string" && apiKey.trim()) return apiKey.trim();
    // 3) Query param fallback (?token= or ?key=) — useful for SSE event sources that can't set headers
    const qToken = (req.query.token || req.query.key || req.query.auth) as string | undefined;
    if (qToken && qToken.trim()) return qToken.trim();
    return undefined;
  }

  async function requireMcpAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
    // Allow CORS preflight without auth
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    // Optional env to disable auth locally (e.g. emulator): MCP_NO_AUTH=1 / MCP_AUTH_DISABLED=1
    if (process.env.MCP_NO_AUTH === "1" || process.env.MCP_NO_AUTH === "true" || process.env.MCP_AUTH_DISABLED === "1" || process.env.MCP_AUTH_DISABLED === "true") {
      next();
      return;
    }
    const provided = extractBearerToken(req);
    if (!provided) {
      const issuer = getIssuer(req);
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="yes-chef-mcp", resource_metadata="${issuer}/.well-known/oauth-protected-resource", error="invalid_token"`
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const collectionName = await resolveCollectionForToken(provided);
      if (!collectionName) {
        const issuer = getIssuer(req);
        res.setHeader(
          "WWW-Authenticate",
          `Bearer realm="yes-chef-mcp", resource_metadata="${issuer}/.well-known/oauth-protected-resource", error="invalid_token"`
        );
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as unknown as Record<string, unknown>).collectionName = collectionName;
    } catch (e) {
      console.error("[mcp] auth resolve failed:", e);
      const issuer = getIssuer(req);
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="yes-chef-mcp", resource_metadata="${issuer}/.well-known/oauth-protected-resource", error="invalid_token"`
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

  function requireApiAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    if (process.env.MCP_NO_AUTH === "1" || process.env.MCP_NO_AUTH === "true" || process.env.MCP_AUTH_DISABLED === "1" || process.env.MCP_AUTH_DISABLED === "true") {
      next();
      return;
    }
    const provided = extractBearerToken(req);
    if (!provided || provided.includes("/") || !provided.trim()) {
      res.status(401).json({ error: "Unauthorized: missing cookbook code" });
      return;
    }
    // Accept any code that is a valid collection name; handlers will check existence via metadata
    next();
  }

  // Health checks (Cloud Run requires responding to /) — unauthenticated
  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "yes-chef-mcp-server", mcpEndpoint: "/mcp", health: "/health" });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // App server API — all Firestore access goes through here (no direct client SDK)
  // All calls require cookbook code (Bearer token) — never disclose collection list
  app.get("/api/recipes", requireApiAuth, handleListRecipes);
  app.get("/api/recipes/:id", requireApiAuth, handleGetRecipe);
  app.get("/api/metadata", requireApiAuth, handleGetMetadata);

  // ── OAuth discovery (RFC 8414 + RFC 9728) — unauthenticated, required for Claude "Always required" ──
  // Claude probes these before starting OAuth flow. Must be CORS-open and not behind auth.
  app.get("/.well-known/oauth-authorization-server", handleAuthorizationServerMetadata);
  app.get("/.well-known/oauth-authorization-server/*", handleAuthorizationServerMetadata);
  app.get("/.well-known/openid-configuration", handleAuthorizationServerMetadata);
  app.get("/.well-known/oauth-protected-resource", handleProtectedResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/*", handleProtectedResourceMetadata);

  // Dynamic Client Registration (DCR) — Claude "No client ID — register one automatically"
  app.post("/register", handleRegister);
  app.post("/oauth/register", handleRegister);
  // Some servers use /oauth2/register
  app.post("/oauth2/register", handleRegister);

  // Authorization + Token — Claude "Always required" flow (authorization_code + PKCE)
  app.get("/authorize", handleAuthorizeGet);
  app.post("/authorize", (req, res, next) => {
    handleAuthorizePost(req, res).catch(next);
  });
  app.post("/token", (req, res, next) => {
    handleToken(req, res).catch(next);
  });
  app.post("/oauth/token", (req, res, next) => {
    handleToken(req, res).catch(next);
  });
  app.post("/oauth2/token", (req, res, next) => {
    handleToken(req, res).catch(next);
  });
  app.post("/revoke", handleRevoke);
  app.post("/oauth/revoke", handleRevoke);

  // Streamable HTTP endpoint — stateless per-request server instance (safe for Cloud Run scaling)
  // All MCP endpoints require Bearer auth (Claude-compatible). Health checks above remain open.
  app.post("/mcp", requireMcpAuth, async (req, res) => {
    // Create a fresh server+transport per request for stateless operation (collection per token)
    const collectionName = (req as unknown as Record<string, unknown>).collectionName as string | undefined;
    const server = createMcpServer(collectionName);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    // Ensure we clean up on close
    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Optional SSE support for older MCP clients that do GET /mcp
  app.get("/mcp", requireMcpAuth, async (req, res) => {
    const collectionName = (req as unknown as Record<string, unknown>).collectionName as string | undefined;
    const server = createMcpServer(collectionName);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    // For GET, body is undefined; StreamableHTTP transport will handle SSE negotiation
    await transport.handleRequest(req, res, undefined);
  });

  // Graceful: also support POST /sse legacy if clients expect it
  app.post("/sse", requireMcpAuth, async (req, res) => {
    const collectionName = (req as unknown as Record<string, unknown>).collectionName as string | undefined;
    const server = createMcpServer(collectionName);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get("/sse", requireMcpAuth, async (req, res) => {
    const collectionName = (req as unknown as Record<string, unknown>).collectionName as string | undefined;
    const server = createMcpServer(collectionName);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, undefined);
  });

  const port = Number(process.env.PORT || 8080);
  app.listen(port, "0.0.0.0", () => {
    const token = getAuthToken();
    const masked = token ? `${token.slice(0, 4)}***` : "(not set)";
    const legacyInfo = token ? ` legacy MCP_TOKEN="${masked}" (fallback)` : "";
    const authInfo =
      process.env.MCP_NO_AUTH === "1" || process.env.MCP_AUTH_DISABLED === "1"
        ? "disabled (MCP_NO_AUTH)"
        : `multi-tenant (cookbook code)${legacyInfo}`;
    console.log(`[mcp] HTTP server listening on 0.0.0.0:${port} — endpoint POST /mcp`);
    console.log(`[mcp] Collections: per-token (Firestore metadata) project: ${process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "(ADC)"}`);
    console.log(`[mcp] Auth: ${authInfo} — use 'Authorization: Bearer <cookbook-code>' (Claude-compatible). Health checks (/, /health) are unauthenticated.`);
  });
}

if (isStdio) {
  runStdio().catch((err) => {
    console.error("[mcp] stdio failed:", err);
    process.exit(1);
  });
} else {
  runHttp().catch((err) => {
    console.error("[mcp] http failed:", err);
    process.exit(1);
  });
}
