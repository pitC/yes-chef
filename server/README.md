# Yes Chef — MCP Server (Cloud Run + Firestore)

Node.js MCP server exposing three tools over **Streamable HTTP** (Cloud Run) and **stdio** (local):

| Tool | Purpose |
|---|---|
| `create_recipe` | Create a new recipe from scratch — validates against `schema.json`, generates `id` + timestamps, writes to Firestore `recipes` collection |
| `update_recipe` | Update an existing recipe by `id` — merges `updates`/`recipe`, re-validates, bumps `updatedAt` |
| `search_recipes` | Keyword search over `title`, `tags`, and `steps[].text`/`steps[].title` (case-insensitive substring, in-memory after `collection.get()`) |

Validation uses `Ajv` + `ajv-formats` compiled directly from the repo-root `schema.json` — closed enums (`g, kg, ml, l, tsp, tbsp, piece, pinch` etc.) are enforced and `additionalProperties: false` is respected.

## Quick start (local)

```bash
cd mcp-server
npm install
cp .env.example .env   # set FIREBASE_PROJECT_ID etc.
npm run dev            # http on :8080
# or stdio mode:
npm run dev:stdio
```

Env:

```
FIREBASE_PROJECT_ID=yes-chef-cookbook
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json # local only, not in Cloud Run
RECIPES_COLLECTION=recipes            # also the Bearer token for MCP HTTP auth
PORT=8080
FIRESTORE_EMULATOR_HOST=localhost:8080 # optional
MCP_NO_AUTH=1                          # optional: disable auth locally (emulator)
# Clients must send: Authorization: Bearer <RECIPES_COLLECTION>
```

Local Firestore emulator:

```bash
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

## Authentication (Claude-compatible)

All MCP HTTP endpoints (`/mcp`, `/sse`) require a Bearer token. **Token = `RECIPES_COLLECTION`** (the Firestore collection key), normalized without leading `/`.

- Health checks (`/` and `/health`) are **unauthenticated** (required for Cloud Run).
- `stdio` transport bypasses HTTP auth.
- Accepted: `Authorization: Bearer <RECIPES_COLLECTION>` (primary, Claude-compatible), also `X-Api-Key: <token>`, `X-Collection-Key: <token>`, or `?token=<token>` query param.
- Invalid/missing token → `401 Unauthorized` + `WWW-Authenticate: Bearer realm="yes-chef-mcp"` (so Claude surfaces auth error).
- To disable auth locally (emulator): `MCP_NO_AUTH=1` or `MCP_AUTH_DISABLED=1`.
- Collection example: `RECIPES_COLLECTION=deafening-gnarly-dining` → token `deafening-gnarly-dining` (also accepts `/deafening-gnarly-dining`).

### Claude configuration

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yes-chef": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<cloud-run-url>/mcp"],
      "headers": {
        "Authorization": "Bearer deafening-gnarly-dining"
      }
    }
  }
}
```

Or with direct Streamable HTTP (Claude 2026+ remote MCP):

- URL: `https://<cloud-run-url>/mcp`
- Header: `Authorization: Bearer deafening-gnarly-dining`

**claude.ai custom connector**: Add server URL `https://<cloud-run-url>/mcp` and set header `Authorization: Bearer <RECIPES_COLLECTION>`.

## MCP endpoints (HTTP)

- `POST /mcp` — primary Streamable HTTP endpoint (stateless, per-request `McpServer` instance) — **requires Bearer auth**
- `GET  /mcp` — SSE fallback for clients that negotiate via GET — **requires Bearer auth**
- `POST /sse` / `GET /sse` — legacy SSE alias — **requires Bearer auth**
- `GET  /` / `GET /health` — health checks for Cloud Run — **unauthenticated**

`POST /mcp` expects JSON-RPC with `tools/call` etc. Example with `curl` (after starting server):

```bash
# Health (no auth)
curl -s http://localhost:8080/health

# MCP (auth required) — use RECIPES_COLLECTION as token
curl -s http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer deafening-gnarly-dining' \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/list","params":{}
  }'

# Alternative header
curl -s http://localhost:8080/mcp -H 'X-Api-Key: deafening-gnarly-dining' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expect `401 {"error":"Unauthorized",...}` + `WWW-Authenticate: Bearer` if token missing/invalid — Claude uses this to prompt for credentials.

## Tools detail

### create_recipe

Input (Zod, then Ajv JSON Schema):

```json
{
  "id": "optional-slug",
  "title": "My Soup",
  "sourceUrl": "https://...",
  "sourceName": "My Blog",
  "tags": ["veg"],
  "servings": { "base": 4, "unit": "people" },
  "timing": { "prepMinutes": 10, "cookMinutes": 20, "totalMinutes": 30 },
  "ingredients": [
    { "name": "onion", "amount": 1, "unit": "piece", "notes": "finely chopped" }
  ],
  "steps": [
    { "order": 1, "title": "Soften onions", "text": "Cook [onion]...", "timer": null, "ingredientRefs": ["ing_1"] }
  ]
}
```

- `id` auto-generated from title (`slug-random`) if omitted.
- `ingredients[].id` / `steps[].id` default to `ing_N` / `step_N`.
- `notes: null` is normalized; `timer: null` allowed.
- Returns created document JSON.

### update_recipe

```json
{
  "id": "existing-doc-id",
  "updates": { "title": "New Title", "tags": ["veg","mains"] }
}
```

Or provide a full `recipe` object to merge. Existing `createdAt` is preserved; `updatedAt` is bumped. If `ingredients`/`steps` are patched they are re-normalized and the merged doc is re-validated before `set()`.

### search_recipes

```json
{ "keyword": "tomato", "limit": 20, "field": "all" }
```

- `field`: `all` (default), `title`, `tags`, or `steps`.
- Case-insensitive substring match on `title`, `tags` (e.g. `cocktails` matches `cocktail`), and step `text`/`title`.
- Fetches the whole collection then filters — suitable for cookbook scale (tens/hundreds of docs). For larger scale wire up Algolia/Typesense.

## Cloud Run deployment

### Prerequisites

```bash
# 1. Install gcloud (macOS)
brew install --cask google-cloud-sdk
gcloud --version

# 2. Auth & project
gcloud auth login
gcloud auth application-default login
gcloud config set project yes-chef-cookbook

# 3. Enable billing — required even for free tier
# Console: https://console.cloud.google.com/billing/linkedaccount?project=yes-chef-cookbook
gcloud beta billing accounts list
gcloud beta billing projects link yes-chef-cookbook --billing-account=XXXXXX-XXXXXX-XXXXXX

# 4. Enable APIs
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### Deploy (from repo root — `Dockerfile` at root is auto-detected)

> `Dockerfile` at repo root and `mcp-server/Dockerfile` are identical copies. `gcloud` < ~490 has no `--dockerfile` flag, so deploy **from repo root** with `--source .`. Do **not** run from `mcp-server/`.

```bash
cd /Users/piotrek/Workspaces/yes-chef-recipes  # repo root

gcloud run deploy yes-chef-cookbook \
  --source . \
  --region=europe-west1 \
  --allow-unauthenticated \
  --max-instances=5 \
  --set-env-vars=FIREBASE_PROJECT_ID=yes-chef-cookbook,RECIPES_COLLECTION=deafening-gnarly-dining \
  --port=8080
```

If you update `gcloud` (`gcloud components update`), the flag works:

```bash
gcloud run deploy yes-chef-cookbook \
  --source . \
  --dockerfile=mcp-server/Dockerfile \
  --region=europe-west1 \
  --allow-unauthenticated \
  --max-instances=5 \
  --set-env-vars=FIREBASE_PROJECT_ID=yes-chef-cookbook,RECIPES_COLLECTION=deafening-gnarly-dining
```

### Update env vars (e.g. change collection)

Collection names must not contain `/` — use `deafening-gnarly-dining`, not `/deafening-gnarly-dining`.

```bash
# merge one var
gcloud run services update yes-chef-cookbook \
  --region=europe-west1 \
  --update-env-vars=RECIPES_COLLECTION=deafening-gnarly-dining

# or reset both
gcloud run deploy yes-chef-cookbook \
  --source . \
  --region=europe-west1 \
  --set-env-vars=FIREBASE_PROJECT_ID=yes-chef-cookbook,RECIPES_COLLECTION=deafening-gnarly-dining
```

### Get the MCP URL

```bash
gcloud run services describe yes-chef-cookbook --region=europe-west1 --format='value(status.url)'
# → https://yes-chef-cookbook-XXXX.europe-west1.run.app
# MCP endpoint:  https://<url>/mcp
# Health:        https://<url>/health  and  https://<url>/
```

### Docker locally (without Cloud Run)

```bash
docker build -t yes-chef-mcp .
docker run -p 8080:8080 -e FIREBASE_PROJECT_ID=yes-chef-cookbook -e RECIPES_COLLECTION=deafening-gnarly-dining yes-chef-mcp
# alternate with explicit Dockerfile:
docker build -f mcp-server/Dockerfile -t yes-chef-mcp .
```

### Service account

Grant the Cloud Run service account `roles/datastore.user`:

```bash
gcloud projects add-iam-policy-binding yes-chef-cookbook \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

When using a custom SA:

```bash
gcloud run deploy yes-chef-cookbook --service-account=mcp@yes-chef-cookbook.iam.gserviceaccount.com ...
```

ADC is used in Cloud Run — no `GOOGLE_APPLICATION_CREDENTIALS` needed.

## Project layout

```
mcp-server/
  src/
    index.ts       # Express + MCP wiring (stdio + HTTP)
    mcp.ts         # create/update/search tool definitions
    firestore.ts   # Admin SDK init + helpers
    validation.ts  # Ajv compiled from schema.json
  Dockerfile
  package.json
  tsconfig.json
```

Root `schema.json` is the single source of truth — see `validation.ts` candidate paths.
