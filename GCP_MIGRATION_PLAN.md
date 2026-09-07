# GCP Full Migration Plan — Yes Chef

> **Scope:** Host static PWA on Cloud Storage, route Firestore writes/reads via hardened rules + standard Firebase SDK (or proxied through the same Cloud Run that hosts the MCP server — no API keys committed), consolidate MCP server + budget-cap from `yes-chef-recipes` into `yes-chef`, and codify **all** infra in Terraform. Cloud Run is **max 1 instance**. Includes API-key invalidation/rotation procedure. `RECIPES_COLLECTION` is **removed** as an env var — collection discovery relies solely on what exists in Firestore. Recipe JSONs and `scripts/deploy-recipes.mjs` **stay** in `yes-chef-recipes` (not moved).

**Source inventories inspected:** `yes-chef@1.0.3` (`firebase.js:3-9`, `js/firebase.js:1-9`, `js/firestore.js`, `js/data/recipes.js`, `firestore.rules`, `sw.js`, `index.html`) and `yes-chef-recipes` (`mcp-server/` with `src/index.ts`, `firestore.ts`, `mcp.ts`, `oauth.ts`, `validation.ts`, `Dockerfile`, `schema.json`, `scripts/deploy-recipes.mjs`, `scripts/budget-cap/index.js`).

---

## 1. Goals & Non-Goals

### Goals
1. **Static hosting (Option A — Public bucket website):** `index.html`, `css/`, `js/`, `icons/`, `manifest.json`, `sw.js` served from a **public Cloud Storage bucket website** (`https://storage.googleapis.com/<bucket>/` via `website { main_page_suffix, not_found_page }`) with `allUsers:objectViewer`. No HTTP(S) Load Balancer, no Backend Bucket/CDN, no managed cert/custom domain.
2. **Standard Firebase SDK:** Client uses the **normal modular SDK** (`import { initializeApp } from "firebase/app"` + `firebaseConfig` → `initializeApp(firebaseConfig)`) per `https://firebase.google.com/docs/web/setup#available-libraries`. Config (including `apiKey`) is **not committed** — it is injected at deploy time via a Terraform-generated `js/firebase-config.js` / Secret Manager (see §6/§8). No `https://www.gstatic.com/firebasejs/...` CDN imports in `js/firebase.js`.
3. **Unified Cloud Run (max 1 instance):** Same **single-instance** service (`min 0 / max 1`, `concurrency 40`) serves the MCP Streamable-HTTP/SSE + OAuth discovery (`/mcp`, `/sse`, `/.well-known/*`, `/authorize`, `/token`, etc. — `mcp-server/src/index.ts:65-224` preserved) and, if a proxy is retained, any thin `/api/*` helpers. Firestore itself is accessed directly via the normal SDK, gated by **hardened Firestore Rules** that allow writes only to established collections (§6.3). No `RECIPES_COLLECTION` env var.
4. **Consolidation (scoped):** Move **only** MCP server and budget-cap from `yes-chef-recipes` into `yes-chef`. Recipe JSONs (`recipes/*.json`) and `scripts/deploy-recipes.mjs` **remain** in `yes-chef-recipes` (source of truth for bulk seeding stays there). `yes-chef-recipes` is not archived, only MCP/budget-cap are relocated.
5. **Terraform-only infra:** Every resource created by prior `gcloud run deploy --source . --set-env-vars=...` (now without `RECIPES_COLLECTION`) and console clicks becomes code in `terraform/` (`google_storage_bucket`, `google_cloud_run_v2_service` with `max_instance_count=1`, `google_billing_budget`, `google_pubsub_topic`, `google_cloudfunctions2_function`, `google_firestore_database`, IAM, Secret Manager). No LB/Backend Bucket/CDN resources.
6. **Key hygiene:** Invalidate the exposed Browser API key `AIzaSyD_jSlv9np8EJvgVebvHLxGO-St68ZOwGY` (`firebaseConfig.apiKey` in the snippet) and document rotation. The literal key from the snippet must **never** be committed — see §8 for deletion + restricted regeneration into Secret Manager.

### Non-Goals
- Changing the recipe JSON schema (`schema.json` — closed enums `g,kg,ml,l,tsp,tbsp,piece,pinch`, `js/types/recipe.js`) or tag semantics.
- Multi-project or multi-region rollout.
- Deleting existing Firestore data (collection `deafening-gnarly-dining` / `recipes`) — only tightening access.

---

## 2. Current-State Forensics

| Area | Where | Finding |
|------|-------|---------|
| **Exposed key** | `firebase.js:3-9`, `js/firebase.js:2-9` | Hard-coded `apiKey`, `authDomain`, `projectId=yes-chef-cookbook`. Visible in git history forever. Browser SDK fetched over gstatic. |
| **Direct Firestore** | `js/firestore.js:16-20,90,125`, `js/data/recipes.js:20-23,54` | `getFirestoreApi()` → `collection(db, collectionKey)` with rules `firestore.rules:8 allow read: if true; allow write: if false;`. "Security" is obscurity via `loadStoredCollectionKey()` in `js/storage.js:1-3`. |
| **MCP server** | `yes-chef-recipes/mcp-server/src/index.ts:76-216` | Express + MCP SDK, auth `RECIPES_COLLECTION` as Bearer token (`getAuthToken()`), OAuth bridge (`oauth.ts`) with in-memory stores, ADC for Firestore Admin, runs on Cloud Run `:8080`, health checks `GET /`, `/health` unauthenticated. Tools `create_recipe`, `update_recipe`, `search_recipes` via `mcp.ts`. |
| **Budget cap** | `yes-chef-recipes/scripts/budget-cap/index.js:14-117` | Gen2 function triggered by Pub/Sub `billing-alerts` from a 10 EUR Budget; on `alertThresholdExceeded >=1.0` it PATCHes `run.googleapis.com/v2/projects/.../services/yes-chef-cookbook` to `maxInstanceCount=1` (cap) and optionally unlinks billing (`DISABLE_BILLING`). Uses `google-auth-library`. |
| **Deploy script** | `yes-chef-recipes/scripts/deploy-recipes.mjs` | Firestore-first reconcile: pulls remote collection, diffs local `recipes/*.json` (14 fixtures), prompts/flags `--yes/--keep-local/--dry-run/--skip-pull`, then batch `set()` via `firebase-admin`. Env via `.env` (`FIREBASE_PROJECT_ID`, `RECIPES_COLLECTION`, `GOOGLE_APPLICATION_CREDENTIALS`). |
| **PWA shell** | `index.html:11-19`, `sw.js:2-33` | Static assets cached `CACHE_NAME='yes-chef-v18'`, cross-origin requests skipped (`sw.js:68-70`), so Firestore fetches already bypass SW. |

---

## 2.5 Existing Infra Inventory on `yes-chef-cookbook` (projectNumber `158345618336`) — Do Not Recreate

Discovered via `gcloud` on 2026-09-07 — **Terraform must `import` these, not `create`**:

| Resource | Name / ID | Current Config | TF Action |
|----------|-----------|----------------|-----------|
| **Firestore DB** | `projects/yes-chef-cookbook/databases/(default)` | `FIRESTORE_NATIVE`, `locationId=nam5` (not `europe-west1`), `type=STANDARD`, `deleteProtection=DISABLED` (`firestore databases describe` output). Contains collection `deafening-gnarly-dining` with ~14 docs | `import` → `google_firestore_database.default`. TF `location_id` must be `nam5` verbatim; do **not** set `europe-west1` or TF will propose destructive recreate |
| **Cloud Run service** | `yes-chef-cookbook` @ `europe-west1` — `https://yes-chef-cookbook-158345618336.europe-west1.run.app` | v1 API shape (`spec.template.spec.containers[0]`), image `europe-west1-docker.pkg.dev/yes-chef-cookbook/cloud-run-source-deploy/yes-chef-cookbook@sha256:3fb0…`, `serviceAccount=158345618336-compute@developer.gserviceaccount.com` (default compute), `concurrency=40`, `minScale=0/maxScale=5` (**will be tightened to max 1**), `memory 256Mi/1000m`, `env {FIREBASE_PROJECT_ID=yes-chef-cookbook, RECIPES_COLLECTION=deafening-gnarly-dining}` (**`RECIPES_COLLECTION` will be removed** — collection discovery moves to Firestore introspection), `ingress=all`, `allow_unauthenticated` | `import` → `google_cloud_run_v2_service` (pick v2 consistently; live is v1-compat so TF v2 `name=projects/.../locations/europe-west1/services/yes-chef-cookbook`). **Keep the name** `yes-chef-cookbook` to preserve the URL. In-place update sets `max_instance_count=1` and drops `RECIPES_COLLECTION` env |
| **Artifact Registry** | `europe-west1-docker.pkg.dev/yes-chef-cookbook/cloud-run-source-deploy` + `run-sources-*` buckets | Auto-created by `gcloud run deploy --source .` (Cloud Build packs source → image). Not a standalone repo the team created. Also `gcf-v2-sources-*`, `gcf-v2-uploads-*.cloudfunctions` for Functions | `import` or parameterise: TF can manage `google_artifact_registry_repository.cloud_run_source` (`format=DOCKER`, `location=europe-west1`) if you switch to explicit `docker build → push` flow; otherwise leave as `data` source and have Cloud Build create it. Do **not** let TF delete `run-sources-*` buckets |
| **Pub/Sub topic** | `projects/yes-chef-cookbook/topics/billing-alerts` | Exists, no labels, used by budget → function trigger | `import` → `google_pubsub_topic.billing_alerts` |
| **Billing budget** | `billingAccounts/012C2A-E1DB49-8C3E18/budgets/92e91195-8367-4918-ba57-1590cac43a25` (`displayName=yes-chef-cookbook 10 EUR cap`) | `EUR 10`, `projects=[158345618336]`, `thresholds 0.5/0.9/1.0 CURRENT_SPEND`, `pubsubTopic=projects/yes-chef-cookbook/topics/billing-alerts`, `schemaVersion=1.0` | **Recreate-or-import decision:** `google_billing_budget` import is supported but fragile (`billing_account` must match). Tf `import billingAccounts/…/budgets/… <id>` then immediately `plan` — if TF wants to replace due to field defaults (`includeAllCredits`), consider `lifecycle { ignore_changes=[...] }` or delete-and-TF-create in a maintenance window (budget has no data loss — only notifications). Budget lives on the **billing account**, not the project — requires `var.billing_account_id=012C2A-…` |
| **Cloud Function Gen2** | `projects/yes-chef-cookbook/locations/europe-west1/functions/budget-cap` (`run service budget-cap` + Eventarc trigger `budget-cap-742054`) | `runtime=nodejs22`, `entryPoint=handleBudgetAlert`, `env {GCP_PROJECT=yes-chef-cookbook, REGION=europe-west1, SERVICE=yes-chef-cookbook, DISABLE_BILLING=false, LOG_EXECUTION_ID=true}`, `serviceAccount=158345618336-compute@developer.gserviceaccount.com`, `eventType=google.cloud.pubsub.topic.v1.messagePublished` on `billing-alerts` | `import` → `google_cloudfunctions2_function.budget_cap` + companion `google_cloud_run_v2_service.budget-cap` is created implicitly — import both. Do **not** change `SERVICE` env away from `yes-chef-cookbook` until Run name is final |
| **API key (Browser)** | `projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789` (`displayName=Browser key (auto created by Firebase)`) | `restrictions.apiTargets` includes `firestore.googleapis.com`, `identitytoolkit`, `securetoken`, etc., `browserKeyRestrictions={}` (unrestricted referrer) — this is the `AIzaSyD_j…` in `firebase.js:4` | **Delete**, not import. TF should have **no** `google_apikeys_key` for it. After deletion ensure no `TF_VAR_api_key` exists. If a new restricted key is ever created, manage it via `google_apikeys_key` with `restrictions.browser_key_restrictions.allowed_referrers` and `api_targets` locked down, stored in Secret Manager — never in code |
| **Greenfield (to create)** | GCS static bucket (**public website, Option A**), `js/firebase-config.js` (TF-generated, contains `firebaseConfig` — not committed), dedicated `yes-chef-run` SA with `roles/datastore.user` (currently using default compute) | Does not exist — `gcloud storage ls` shows only `gcf-v2-*` and `run-sources-*` | TF `create` |

**Implications for Terraform (updated for max 1 + no RECIPES_COLLECTION):**

- All `import` targets get `import {}` blocks (TF ≥1.5 declarative import) so `terraform plan` shows no `create` for existing resources; reviewers can see the mapping in code.
- Add `lifecycle { prevent_destroy = true }` on `google_firestore_database` and `google_billing_budget` to avoid accidental deletion.
- For Cloud Run, pin `location = "europe-west1"` and `name = "yes-chef-cookbook"` — do **not** introduce `yes-chef-api-mcp` as a second service; evolve the existing one (same URL, rolling revision) in place, setting `scaling.max_instance_count=1` (down from 5) and **removing** `RECIPES_COLLECTION` env (TF will show a diff removing that env — intentional). If a rename is desired, do it in a later phase with DNS cutover, not during the initial import.
- Firestore's `nam5` vs Run's `europe-west1` latency/cost trade-off is **inherited** — TF must not try to "fix" location to `europe-west1` (would require delete). Document this asymmetry.
- Billing budget TF resource needs `var.billing_account_id` — fetch via `gcloud beta billing projects describe yes-chef-cookbook --format="value(billingAccountName)"` → `012C2A-E1DB49-8C3E18`.

---

## 3. Target Architecture

```
                ┌─────────────────────────────────┐
  PWA (browser) │  https://storage.googleapis.com/yes-chef-static-XXXX/index.html
    ──────────► │  GCS Bucket  yes-chef-static-XXXX  (public website, Option A)
                │  index.html, js/*, css/*, icons/*, sw.js, js/firebase-config.js*
                │  website { main_page_suffix="index.html", not_found_page="index.html" }
                └─────────────────────────────────┘
                              │
                              │ Firebase modular SDK (initializeApp)
                              │ apiKey+projectId from js/firebase-config.js (TF-generated, not committed)
                              │ read/write directly to Firestore via SDK, gated by Rules
                              │ — or thin /api/* proxy on same Run (optional, not collection-key-gated)
                              │ Run URL is separate: https://yes-chef-cookbook-…run.app/mcp
                              ▼
                ┌─────────────────────────────────┐
                │  Cloud Run  yes-chef-cookbook   │  europe-west1, min 0 / max 1, concurrency 40
                │  Express  ─┬─  POST /mcp (MCP)  │  ──►  Firestore (Native)  nam5  project yes-chef-cookbook
                │            ├─  GET  /mcp (SSE)  │       collection deafening-gnarly-dining (established)
                │            ├─  /.well-known/*   │       no RECIPES_COLLECTION env — MCP discovers collections
                │            ├─  GET /health, /   │       via listCollections / Admin SDK
                │            └─  GET /api/* (opt) │
                │  SA: yes-chef-run@...  (datastore.user)  ADC
                └─────────────────────────────────┘
                              ▲
                              │ Pub/Sub billing-alerts
                ┌─────────────┴───────────────────┐
                │  Budget 10 EUR (0.5,0.9,1.0)     │──► Pub/Sub topic billing-alerts ──► Cloud Function Gen2 budget-cap
                └─────────────────────────────────┘                                              │ PATCH Run scaling=1 / unlink billing
```
* `js/firebase-config.js` is **generated** by `gcloud storage` deploy from a Secret Manager secret — never committed (see §6.2 / §8). PWA bucket is separate from Cloud Run; no LB path routing — the PWA's `https://storage.googleapis.com/...` origin talks directly to Firestore (normal SDK) and to `https://yes-chef-cookbook-…run.app/mcp` for MCP.

**Firestore rules (established collections only):** Replace `firestore.rules:7-10` (`allow read: if true; allow write: if false`) with an allowlist that permits writes only to collections that already exist (e.g. `deafening-gnarly-dining`). This satisfies "add corresponding rules to allow for writing to the established collections" while still denying creation of arbitrary collections. See §6.3 for the rule snippet.

**Firebase SDK:** Client uses the **normal modular SDK** per the snippet:
```js
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "…", // injected at deploy time, not committed
  authDomain: "yes-chef-cookbook.firebaseapp.com",
  projectId: "yes-chef-cookbook",
  storageBucket: "yes-chef-cookbook.firebasestorage.app",
  messagingSenderId: "158345618336",
  appId: "1:158345618336:web:5846633ae0d4d529c13ac5"
};
const app = initializeApp(firebaseConfig);
```
No `RECIPES_COLLECTION` env var — the app (and MCP server) discover the established collection by inspecting Firestore (e.g. `listCollections()` on the backend, or a small bootstrap doc) rather than a committed env var.

**Collection discovery (no RECIPES_COLLECTION):** MCP `src/firestore.ts:getCollection()` / `getCollectionName()` are refactored to enumerate Firestore collections or read a well-known `config/collections` doc; the PWA no longer stores a collection key in `localStorage` (`js/storage.js:COLLECTION_KEY` deprecated). OAuth / Bearer token for MCP is decoupled from the collection name (use a dedicated `MCP_TOKEN` secret or keep OAuth's `getAuthToken()` but sourced from Secret Manager, not `RECIPES_COLLECTION`).

---

## 4. Repository Restructure — What Moves Where

### 4.1 Source of truth after move (proposed layout in `yes-chef`)

```
yes-chef/
  terraform/                        # NEW — all infra (see §5)
    versions.tf
    variables.tf
    outputs.tf
    main.tf                         # provider, project services
    storage.tf                      # GCS bucket website (Option A, no LB)
    run.tf                          # Cloud Run v2 service (max 1) + IAM
    firestore.tf                    # database import + rules (allow writes to established collections) + indexes
    budget.tf                       # billing budget + pubsub + function gen2
    secrets.tf                      # Secret Manager for firebaseConfig / MCP token (no RECIPES_COLLECTION)
  server/                           # NEW — moved from yes-chef-recipes/mcp-server ONLY
    package.json
    tsconfig.json
    Dockerfile                      # canonical; repo-root Dockerfile deleted or re-exported
    src/
      index.ts                      # keep /mcp, /.well-known/*, /health; optional /api/* helpers
      firestore.ts                  # REFACTORED: remove getCollectionName()/getAuthToken() RECIPES_COLLECTION; discover collections via listCollections / config doc
      mcp.ts                        # validation stays, but collection is discovered, not env-driven
      validation.ts
      oauth.ts                      # token source moves from RECIPES_COLLECTION to Secret Manager MCP_TOKEN (or stays as shared secret but renamed)
      # api.ts — ONLY if a thin proxy is retained; otherwise no new file
  functions/
    budget-cap/
      index.js                      # moved from yes-chef-recipes/scripts/budget-cap/index.js
      package.json
  # NOTE: NOT moved — remain in yes-chef-recipes:
  #   schema.json          — stays in yes-chef-recipes (server/Dockerfile COPY adjusted to fetch from ../yes-chef-recipes or copy at build)
  #   recipes/*.json       — stays in yes-chef-recipes/recipes/*.json (14 files)
  #   scripts/deploy-recipes.mjs — stays in yes-chef-recipes/scripts/deploy-recipes.mjs
  .env.example                      # merged: FIREBASE_PROJECT_ID only; RECIPES_COLLECTION removed; add MCP_TOKEN / OAUTH_ISSUER / PORT
  Dockerfile                        # NEW root wrapper (FROM server/Dockerfile) or remove; Terraform builds from ./server
  js/
    firebase.js                     # REWRITTEN to normal SDK: `import { initializeApp } from "firebase/app"` + injected firebaseConfig (snippet)
    firebase-config.js              # GENERATED at deploy from Secret Manager — never committed (see §6.2)
  firebase.json / firestore.rules   # firestore.rules rewritten to allow writes to established collections (§6.3)
```

### 4.2 Migration steps (file moves — MCP + budget-cap ONLY)

1. `git mv` / copy preserving history:
   - `yes-chef-recipes/mcp-server/*` → `yes-chef/server/*` (`package.json`, `tsconfig.json`, `src/*`, `README.md` fragments)
   - `yes-chef-recipes/Dockerfile` → `yes-chef/server/Dockerfile` (keep one canonical; add a 2-line `Dockerfile` at repo root re-exporting for `gcloud < 490` compatibility if needed)
   - `yes-chef-recipes/scripts/budget-cap/*` → `yes-chef/functions/budget-cap/*`
   - `.env.example` merge — **remove** `RECIPES_COLLECTION`; add `MCP_TOKEN`, `OAUTH_ISSUER`, `PORT`, `FIREBASE_PROJECT_ID` docs from `mcp-server/.env.example`.
2. **Do NOT move:** `yes-chef-recipes/schema.json`, `yes-chef-recipes/recipes/*.json`, `yes-chef-recipes/scripts/deploy-recipes.mjs` — leave in place in `yes-chef-recipes`. Update `server/Dockerfile` and `server/src/validation.ts` to resolve `schema.json` via a relative path (`../yes-chef-recipes/schema.json` for local dev, or `COPY` at Cloud Build time from a sibling checkout / artifact).
3. Rewrite `js/firebase.js` to the snippet's normal SDK init (see §6.2) — the literal `apiKey` in the snippet must be replaced by the generated `js/firebase-config.js` / `import { firebaseConfig } from "./firebase-config.js"`.
4. Rewrite `firestore.rules` per §6.3 (allow writes to established collections).
5. Update `package.json` scripts: root gets `build:server`, `dev:server`; server keeps `build/start`.
6. Update `.gitignore` to re-assert `! .env.example` + `service-account.json`, `*.service-account.json`, `.env`, `.env.local`, `js/firebase-config.js`, `terraform/*.tfstate*`, `.terraform/` and add `**/AIza*` pre-commit guard.

---

## 5. Terraform — Required Resources (all in `terraform/`)

**Provider & versions (`versions.tf`)**
- `required_version >= 1.6`, `provider google ~> 6`, `google-beta` for Run v2 + budgets, backend `gcs` or `local` (start local, then migrate to `gs://yes-chef-tfstate`).
- Variables: `project_id = "yes-chef-cookbook"`, `region = "europe-west1"`, `firestore_location = "nam5"` (TF for `google_firestore_database` must be `nam5`, not `region` — see §2.5), `bucket_name`, `run_service_name = "yes-chef-cookbook"` (**must preserve** existing name — renaming would break `https://yes-chef-cookbook-…run.app/mcp` for Claude clients), `budget_amount = 10`, `billing_account_id = "012C2A-E1DB49-8C3E18"` (existing), `domain` (optional). **No `recipes_collection` variable** — collection discovery is Firestore-driven; remove `var.recipes_collection` / `TF_VAR_recipes_collection` entirely. If MCP auth still needs a shared secret, use `var.mcp_token` (Secret Manager `mcp-token`) instead.

**`main.tf` — APIs**
- `google_project_service`: `run.googleapis.com`, `firestore.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `cloudbilling.googleapis.com`, `cloudfunctions.googleapis.com`, `cloudresourcemanager.googleapis.com`, `secretmanager.googleapis.com`, `pubsub.googleapis.com`, `eventarc.googleapis.com`, `apikeys.googleapis.com` (for key deletion audit only — no `google_apikeys_key` for the deleted browser key). **No** `compute.googleapis.com` — no LB/Backend Bucket for Option A.
- `google_project` data source for `number` (`158345618336` — needed for default compute SA `158345618336-compute@…` and billing budget `projects/158345618336` filter).
- Declarative imports (`import {}`) for every existing resource so `plan` is `no-op` on first run (see §2.5 & Phase 1). Example:
  ```hcl
  import {
    to = google_firestore_database.default
    id = "projects/yes-chef-cookbook/databases/(default)"
  }
  import {
    to = google_cloud_run_v2_service.yes_chef
    id = "projects/yes-chef-cookbook/locations/europe-west1/services/yes-chef-cookbook"
  }
  import {
    to = google_pubsub_topic.billing_alerts
    id = "projects/yes-chef-cookbook/topics/billing-alerts"
  }
  import {
    to = google_cloudfunctions2_function.budget_cap
    id = "projects/yes-chef-cookbook/locations/europe-west1/functions/budget-cap"
  }
  # Budget import — billing-account-scoped:
  import {
    to = google_billing_budget.cap
    id = "billingAccounts/012C2A-E1DB49-8C3E18/budgets/92e91195-8367-4918-ba57-1590cac43a25"
  }
  ```

**`storage.tf` — Static site, Option A: Public bucket website (GREENFIELD — no import, no LB)**
```hcl
resource "google_storage_bucket" "static" {
  name          = var.bucket_name # e.g. yes-chef-static-${project_id} or yes-chef-static-158345618336 — NEW, globally unique
  location      = var.region      # europe-west1; NOTE: Firestore is nam5 but bucket can remain europe-west1
  uniform_bucket_level_access = true
  website { main_page_suffix = "index.html"; not_found_page = "index.html" } # SPA fallback — serves index.html for deep links
  cors { origin=["https://storage.googleapis.com","http://localhost:8000"]; method=["GET","HEAD"]; response_header=["Content-Type"]; max_age_seconds=3600 }
}
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.static.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"    # required for https://storage.googleapis.com/<bucket>/ website access without LB
}
# Coexistence: do NOT import gcf-v2-* or run-sources-* buckets — they are Cloud Functions/Cloud Run internals
# Deployment: external `gcloud storage rsync` / `gsutil -m rsync -r -d` in CI or local (see §7); TF can use terraform_data + local-exec but rsync is simpler.
# No google_compute_* resources for Option A (no LB, no Backend Bucket, no CDN, no managed cert, no global address).
```

**`run.tf` — Unified Cloud Run (EVOLVE existing `yes-chef-cookbook`, max 1 instance, no RECIPES_COLLECTION)**
- `google_service_account` `yes-chef-run` (NEW dedicated SA; current live SA is default compute `158345618336-compute@developer.gserviceaccount.com`) + `google_project_iam_member` `roles/datastore.user` (+ `roles/secretmanager.secretAccessor` if using Secret Manager for `MCP_TOKEN` / `firebaseConfig`). TF should **not** detach the default compute SA until the new SA is verified — use `service_account = var.use_dedicated_sa ? google_service_account.run.email : "158345618336-compute@developer.gserviceaccount.com"` with a flag, then flip in a second `apply`.
- `google_secret_manager_secret` for **MCP auth token** (e.g. `mcp-token`) and optionally `firebase-config` JSON (if the snippet's `firebaseConfig` is to be served via Run) — **not** `RECIPES_COLLECTION`. Current live env `RECIPES_COLLECTION=deafening-gnarly-dining` will be **removed** in the first in-place update. MCP `src/firestore.ts` and `src/index.ts:96-130` must be refactored to stop reading `process.env.RECIPES_COLLECTION`.
- `google_artifact_registry_repository` — live service uses the implicit `cloud-run-source-deploy` repo (auto-created). TF can either `import` that repo as `data` or declare `google_artifact_registry_repository.cloud_run_source` with `lifecycle { prevent_destroy = true }`. Do not let TF try to delete it.
- `google_cloud_run_v2_service.yes_chef` (**imported**, name `yes-chef-cookbook`, location `europe-west1`):
  - `template.containers[0].image` from `var.image` (built from `server/Dockerfile`; first TF apply will show an **update in place** diff when image changes — not a recreate)
  - `env`: `FIREBASE_PROJECT_ID = var.project_id`, `REGION=europe-west1`, `SERVICE=yes-chef-cookbook` (must match `budget-cap` function's `SERVICE` env — see §2.5), `PORT=8080`. **No `RECIPES_COLLECTION`** — remove the env var (TF will show a diff removing it; that is intentional). If MCP still needs a shared secret, use `MCP_TOKEN` from Secret Manager (`value_source.secret_key_ref`).
  - `scaling`: `min_instance_count=0`, `max_instance_count=1` (**tightened from live `max 5` to `1` per requirement**; also update any `autoscaling.knative.dev/maxScale` annotation drift — TF v2 `scaling {}` is the source of truth; add `lifecycle { ignore_changes = [template[0].metadata[0].annotations] }` if annotation churn appears)
  - `service_account = ...` (see above)
  - `ingress = "INGRESS_TRAFFIC_ALL"`; `allow_unauthenticated = true` for health but MCP enforces `requireMcpAuth` (refactored to use `MCP_TOKEN` from Secret Manager, not `RECIPES_COLLECTION`). Check `gcloud run services get-iam-policy yes-chef-cookbook --region=europe-west1` for existing `allUsers` invoker.
- Outputs: `run_url` (existing `https://yes-chef-cookbook-158345618336.europe-west1.run.app` should remain stable), `mcp_endpoint = "${run_url}/mcp"`, `health = "${run_url}/health"`.

**`firestore.tf` (IMPORT existing `nam5`, do not recreate)**
```hcl
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = "nam5"          # MUST be nam5 per live describe — not var.region!
  type        = "FIRESTORE_NATIVE"
  lifecycle { prevent_destroy = true }
}
# Firestore rules: no TF-native resource; manage via firebase CLI.
# Document the lock-down rules file (`firestore.rules: allow read, write: if false`) and indexes (`firestore.indexes.json` stays empty).
# Deploy via: firebase deploy --only firestore:rules --project yes-chef-cookbook  (or a terraform_data local-exec provisioner)
# Import: already covered by import{} block in main.tf above.
```

**`budget.tf` (IMPORT existing topic + budget + function — do not recreate)**
- `google_pubsub_topic.billing_alerts` (imported `projects/yes-chef-cookbook/topics/billing-alerts`) + `google_pubsub_topic_iam_member` for `serviceAccount:service-${project_number}@gcp-sa-billing.iam.gserviceaccount.com` → `roles/pubsub.publisher` (import existing binding — check `gcloud pubsub topics get-iam-policy billing-alerts --project=yes-chef-cookbook`).
- `google_billing_budget.cap` (imported `billingAccounts/012C2A-E1DB49-8C3E18/budgets/92e91195-8367-4918-ba57-1590cac43a25` — billing-account-scoped, not project-scoped):
  ```hcl
  resource "google_billing_budget" "cap" {
    billing_account = var.billing_account_id # "012C2A-E1DB49-8C3E18"
    display_name    = "yes-chef-cookbook 10 EUR cap" # keep existing displayName to avoid diff
    budget_filter {
      projects = ["projects/158345618336"] # number, not project_id
      calendar_period = "MONTH"             # live value per gcloud output
      credit_types_treatment = "INCLUDE_ALL_CREDITS"
    }
    amount { specified_amount { currency_code="EUR" units="10" } }
    threshold_rules { threshold_percent=0.5 spend_basis="CURRENT_SPEND" }
    threshold_rules { threshold_percent=0.9 spend_basis="CURRENT_SPEND" }
    threshold_rules { threshold_percent=1.0 spend_basis="CURRENT_SPEND" }
    all_updates_rule {
      pubsub_topic   = google_pubsub_topic.billing_alerts.id
      schema_version = "1.0"
    }
    lifecycle { prevent_destroy = true }
  }
  # If TF import shows perpetual diff on `credit_types_treatment`/`calendar_period`, add:
  # lifecycle { ignore_changes = [budget_filter[0].credit_types_treatment] }
  ```
- `google_storage_bucket` `budget-cap-source` + `google_storage_bucket_object` zip of `functions/budget-cap` — live function uses `gcf-v2-sources-…` / `gcf-v2-uploads-…` buckets; TF can create a dedicated `yes-chef-budget-cap-source` bucket or reuse. Do not import the `gcf-*` buckets as managed resources.
- `google_cloudfunctions2_function.budget_cap` (imported `projects/yes-chef-cookbook/locations/europe-west1/functions/budget-cap`) + implicitly created `google_cloud_run_v2_service.budget-cap` (the Function's underlying Run service) — import both if TF tracks the Run service separately:
  - `build_config { runtime="nodejs22" entry_point="handleBudgetAlert" source { storage_source { bucket, object } } }`
  - `service_config { service_account_email="158345618336-compute@developer.gserviceaccount.com" (live) or dedicated SA, environment_variables { GCP_PROJECT=yes-chef-cookbook, REGION=europe-west1, SERVICE=yes-chef-cookbook, DISABLE_BILLING=false, LOG_EXECUTION_ID=true } }`
  - `event_trigger { trigger_region="europe-west1" event_type="google.cloud.pubsub.topic.v1.messagePublished" pubsub_topic=google_pubsub_topic.billing_alerts.id retry_policy="RETRY_POLICY_DO_NOT_RETRY" service_account_email="158345618336-compute@developer.gserviceaccount.com" }` — note: Eventarc trigger `budget-cap-742054` and `serviceAccountEmail` must match TF or TF will try to replace.
  - IAM: `google_project_iam_member`/`google_cloud_run_service_iam_member` to allow function SA to `roles/run.admin` (PATCH scaling `yes-chef-cookbook` service via `run.googleapis.com/v2/.../services/...` as in `functions/budget-cap/index.js:122-138`) and optionally `roles/billing.projectManager` if `DISABLE_BILLING=true`.

**`outputs.tf`, `variables.tf`** — wire all above. **No `recipes_collection` variable** — remove `variable "recipes_collection"` and `sensitive` flag; if needed add `variable "mcp_token" { sensitive = true }` for MCP auth (Secret Manager).

**State & secrets hygiene:** `.gitignore` `*.tfstate`, `*.tfstate.*`, `.terraform/`, `terraform.tfvars` (use `terraform.tfvars.example`), `js/firebase-config.js`. Never put `MCP_TOKEN`, `firebaseConfig.apiKey`, or any `RECIPES_COLLECTION` in committed `terraform.tfvars` — inject via `TF_VAR_*` env or Secret Manager. The snippet's `apiKey: "AIzaSyD_j…"` must **never** appear literally in `js/firebase.js` — it lives in Secret Manager as `firebase-config` JSON and is rendered to `js/firebase-config.js` at `gcloud storage rsync` time.

---

## 6. Application Changes — Standard SDK + Rules for Established Collections, No RECIPES_COLLECTION

### 6.1 Firebase init (normal SDK) — `js/firebase.js` rewritten to the snippet

Replace the current CDN-import `js/firebase.js:1-31` (`https://www.gstatic.com/firebasejs/...`) with the **standard modular SDK** per the provided snippet. The literal `apiKey` in the snippet must **not** be committed — use a generated config:

```js
// js/firebase-config.js (GENERATED at deploy, gitignored — see §8)
export const firebaseConfig = {
  apiKey: "…", // from Secret Manager `firebase-config` JSON
  authDomain: "yes-chef-cookbook.firebaseapp.com",
  projectId: "yes-chef-cookbook",
  storageBucket: "yes-chef-cookbook.firebasestorage.app",
  messagingSenderId: "158345618336",
  appId: "1:158345618336:web:5846633ae0d4d529c13ac5"
};
```
```js
// js/firebase.js (COMMITTED)
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./firebase-config.js";
export const app = initializeApp(firebaseConfig);
// re-export Firestore helpers as needed: getFirestore, collection, doc, getDocs, etc.
```

Build/deploy step: `terraform_data` / `gcloud storage rsync` renders `js/firebase-config.js` from `google_secret_manager_secret_version.firebase_config` (or from `TF_VAR_firebase_config_json`). Add a `js/firebase-config.example.js` with placeholder values; `.gitignore` `js/firebase-config.js`. The root `firebase.js` (duplicate of `js/firebase.js`) is deleted or kept as a re-export only.

### 6.2 Frontend — `js/firestore.js` + `js/data/recipes.js` adapted (no RECIPES_COLLECTION)

- **Remove `RECIPES_COLLECTION` usage:** Deprecate `loadStoredCollectionKey()` / `COLLECTION_KEY` (`js/storage.js:1-3`) as the collection selector. The established collection is `deafening-gnarly-dining` (and any future collections discovered via Firestore). Options:
  - (A) **Single established collection:** Hardcode `const ESTABLISHED_COLLECTION = "deafening-gnarly-dining"` in `js/firestore.js` (or read from a small bootstrap doc `config/activeCollections`).
  - (B) **Multi-collection:** Use `listCollections` via a thin Cloud Run helper `GET /api/collections` (Admin SDK) that enumerates Firestore collections, or enumerate client-side by reading a `config` doc that lists established collections.
- `fetchCollectionMetadata`, `fetchAllRecipes`, `fetchRecipe` now call `collection(db, ESTABLISHED_COLLECTION)` directly via the normal SDK (`getFirestore(app)`), not `fetch("/api/...")` with a Bearer collection key. The `collectionKey` param is removed or becomes the discovered collection name.
- `ensureSyncConfig` / `showFirestoreSetup` (`js/firestore.js:28-72`) is **removed or repurposed** — no longer prompts for a collection key. If a "cookbook code" UX is still desired, it becomes an MCP auth token flow (`MCP_TOKEN`), not a Firestore collection selector.
- `js/data/recipes.js:6-44` `loadFromLocal` fallback (`test/menemen.json`) stays for offline/skip path, but `loadRecipes` no longer branches on `RECIPES_COLLECTION`.
- `js/bootstrap.js:20` `ensureSyncConfig(statusEl)` is updated to initialize Firebase via `js/firebase.js` instead of prompting for collection key.
- Update `sw.js:28-30` `STATIC_ASSETS`: remove old `firebase.js`/`js/firebase.js` CDN entries, add `js/firebase.js` (new) + `js/firebase-config.js` (generated, cache-busted) as needed. Keep `sw.js:67-70` cross-origin skip.

### 6.3 Firestore rules — allow writes to established collections (not blanket deny)

Replace `firestore.rules:1-12` (`allow read: if true; allow write: if false`) with an **allowlist** for the established collection(s). This satisfies "add corresponding rules to allow for writing to the established collections" while denying creation of arbitrary collections:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Established cookbook collection — read + write allowed (direct SDK)
    match /deafening-gnarly-dining/{docId} {
      allow read, write: if true;
      // Tighten later: e.g. `allow write: if request.resource.data.keys().hasAll(["title","ingredients","steps"])`
      // and `request.resource.data.title is string && request.resource.data.ingredients.size() > 0`
    }
    // Optional metadata doc within that collection (if used)
    match /deafening-gnarly-dining/metadata {
      allow read, write: if true;
    }
    // Bootstrap / config collection (if multi-collection discovery is used)
    match /config/{docId} {
      allow read: if true;
      allow write: if false; // only via Admin SDK / MCP
    }
    // Everything else — deny (no new collections via client SDK)
    match /{other=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy via `firebase deploy --only firestore:rules --project yes-chef-cookbook` or TF `terraform_data` local-exec. **Verify:** With `FIRESTORE_EMULATOR_HOST` or directly against prod (after key rotation), `setDoc(doc(db, "deafening-gnarly-dining", "test-doc"), {…})` succeeds, while `setDoc(doc(db, "new-arbitrary-collection", "x"), {…})` is denied with `permission-denied`. MCP tools (Admin SDK) bypass rules via `roles/datastore.user` on the Run SA and work for any collection.

If strictly-`allow read, write: if false` was previously planned, this section replaces that — the new requirement explicitly wants writes to established collections.

### 6.4 Cloud Run + MCP refactoring (no RECIPES_COLLECTION)

- `server/src/firestore.ts`: Remove `getCollectionName()` / `getAuthToken()` that read `process.env.RECIPES_COLLECTION` (`firestore.ts:38-47`). Replace with:
  - `FIREBASE_PROJECT_ID` only (or `GCLOUD_PROJECT` fallback) for `admin.initializeApp({ projectId })`.
  - Collection discovery: `admin.firestore().listCollections()` filtered to `deafening-gnarly-dining` (allowlist), or single hardcoded `ESTABLISHED_COLLECTION = "deafening-gnarly-dining"`. MCP tools (`mcp.ts: search/create/update`) operate on the discovered collection, not `getCollection()` bound to an env var.
- `server/src/index.ts:96-130` `requireMcpAuth`: Stop comparing `provided === expected` where `expected = getAuthToken() === RECIPES_COLLECTION`. Instead compare against `process.env.MCP_TOKEN` (Secret Manager `mcp-token`) or keep OAuth's `isValidOAuthToken` but decouple from `RECIPES_COLLECTION`. Health checks `GET /`, `/health` remain unauthenticated.
- `server/src/oauth.ts`: Same — `expected` becomes `MCP_TOKEN`, not `getAuthToken()`.
- `server/src/mcp.ts`: `getCollection()` now takes no `RECIPES_COLLECTION`; it resolves to the established collection(s).
- Scaling: `scaling { min_instance_count=0, max_instance_count=1 }` (see §5 `run.tf`).

### 6.5 Migrating local dev (no RECIPES_COLLECTION)

- `python3 -m http.server 8000` still works for pure-local (`isFirestoreSkipped()` path).
- With Firebase SDK: create a local `js/firebase-config.js` from `yes-chef-recipes/.env` / Secret Manager (or use `FIRESTORE_EMULATOR_HOST=localhost:8080` + `MCP_NO_AUTH=1` for offline). Do **not** set `RECIPES_COLLECTION` — instead set `MCP_TOKEN` if testing MCP auth: `PORT=8080 FIREBASE_PROJECT_ID=yes-chef-cookbook MCP_TOKEN=dev-token npm run dev` in `server/` and point PWA `API_BASE` only if using the optional `/api/*` proxy (otherwise PWA talks directly to Firestore via normal SDK + emulator).
- Emulator: `firebase emulators:start --only firestore` + `FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev` — rules from `firestore.rules` (allowlist) are enforced locally.

---

## 7. Hosting Cutover on Cloud Storage — Option A: Public bucket website (no LB, no custom domain)

**Chosen:** **(A) Public bucket website** (`https://storage.googleapis.com/<bucket>/` / `https://<bucket>.storage.googleapis.com/`). Simplest, no cert for custom domain.

- Terraform creates **only** `google_storage_bucket.static` with `website { main_page_suffix="index.html", not_found_page="index.html" }` (SPA fallback) + `google_storage_bucket_iam_member` `allUsers:objectViewer`. No `google_compute_*` resources.
- Steps (TF does the bucket; manual/CI does the objects):
  ```bash
  # bucket already exists via terraform apply; set website + public read (TF does this, shown for reference)
  gsutil web set -m index.html -e index.html gs://<bucket>
  gsutil iam ch allUsers:objectViewer gs://<bucket>

  # deploy objects (including generated js/firebase-config.js)
  gcloud secrets versions access latest --secret=firebase-config --project=yes-chef-cookbook --format="value(payload.data)" | base64 -d > js/firebase-config.js
  gcloud storage rsync --recursive --delete-unmatched-destination-objects \
    ./ gs://yes-chef-static-yes-chef-cookbook/
  # or: gsutil -m rsync -r -d ./ gs://<bucket>/
  # optional: set cache-control on upload
  gcloud storage objects update "gs://<bucket>/**" --cache-control="public, max-age=300" --project=yes-chef-cookbook
  # html: max-age=300; assets may use longer max-age if hashed later
  ```
  URL: `https://storage.googleapis.com/<bucket>/index.html` (TF output `bucket_url` / `website_url`).
- No `gcloud compute url-maps invalidate-cdn-cache` — no CDN for Option A. Cache busting is via `sw.js` `CACHE_NAME` bump and `?v=` hash on `js/firebase-config.js` if needed.
- Terraform **must not** manage objects via `google_storage_bucket_object` for large syncs — prefer out-of-band `gcloud storage rsync` (documented in `terraform/storage.tf` comments).

**Deploy flow (CI or local):**
```bash
# generate firebase-config before rsync
gcloud secrets versions access latest --secret=firebase-config --project=yes-chef-cookbook --format="value(payload.data)" | base64 -d > js/firebase-config.js
# rsync from repo root (or from a staging dist/ dir)
gcloud storage rsync --recursive --delete-unmatched-destination-objects \
  ./ gs://yes-chef-static-yes-chef-cookbook/
```

**PWA specifics:** `manifest.json:start_url="./"` and `sw.js` scope `"/"` work on `storage.googleapis.com` website. Test `sw.js` registration on `https://storage.googleapis.com` + `http://localhost:8000`. CORS on bucket allows `GET` from `https://storage.googleapis.com` and `http://localhost:8000`.

---

## 8. Invalidating & Rotating the Firestore API Key

The key to kill is the **Firebase Web API Key / Browser key** shown in `firebaseConfig.apiKey` (`AIzaSyD_jSlv9np8EJvgVebvHLxGO-St68ZOwGY`) — it is a GCP **API key** under `APIs & Services → Credentials`.

Live instance: `projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789` (`displayName=Browser key (auto created by Firebase)`, `createTime=2026-08-31`, `apiTargets` includes `firestore.googleapis.com` + 20 Firebase services, `browserKeyRestrictions={}` unfenced). TF must **not** manage this key — it will be deleted.

### 8.1 Locate & confirm exposure

1. `gcloud config set project yes-chef-cookbook && gcloud auth login`
2. List keys (already confirmed to exist):
   ```bash
   gcloud services api-keys list --project=yes-chef-cookbook --format="table(name,displayName,createTime)"
   # → projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789  Browser key (auto created by Firebase)  2026-08-31...
   # Console: https://console.cloud.google.com/apis/credentials?project=yes-chef-cookbook
   ```
3. Check restrictions before deleting (capture for audit):
   ```bash
   gcloud services api-keys describe projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789 --project=yes-chef-cookbook --format=json
   # → restrictions.apiTargets (firestore.googleapis.com etc.), browserKeyRestrictions={}
   ```
4. Search git history for leakage scope: `git log --all -S "AIzaSyD_jSlv9np8EJvgVebvHLxGO-St68ZOwGY" --oneline` and GitHub secret scanning alerts.

### 8.2 Invalidate (recommended: delete — not just restrict)

Because the PWA will no longer use a Browser key at all, **deletion** is cleanest. Restriction-only leaves the key discoverable. The key is currently **unrestricted by referrer** (`browserKeyRestrictions={}`), so deletion is urgent if the repo is/was public.

**Console path:**
- `https://console.cloud.google.com/apis/credentials?project=yes-chef-cookbook` → click `Browser key (auto created by Firebase)` (`03a8b12a-…`) → **Delete** → confirm.

**gcloud path (exact live resource name):**
```bash
gcloud services api-keys delete projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789 --project=yes-chef-cookbook
# Verify gone:
gcloud services api-keys list --project=yes-chef-cookbook
# If gcloud services variant is unavailable, use apikeys.googleapis.com directly:
# curl -X DELETE -H "Authorization: Bearer $(gcloud auth print-access-token)" \
#   https://apikeys.googleapis.com/v2/projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789
```

> **Order matters:** Delete **after** Phase 6 Firestore lockdown + Phase 3/4 proxy verification (the new `GET /api/*` path uses ADC, not the Browser key). Deleting before the proxy is live would break the current PWA (which still imports gstatic SDK). The plan's schedule (lock → verify → delete) guarantees zero-downtime.

**No TF for this key:** Do not add `resource "google_apikeys_key" "browser"` for the deleted key. If `terraform plan` shows a `create` for an apikeys resource, remove it — the desired state is **zero** browser keys.

**Post-delete checks (do before announcing):**
- Direct Firestore via SDK should now fail with `API key not valid` / `403` — proves invalidation (test from a scratch HTML page importing gstatic SDK with the old key).
- PWA served from Cloud Storage + Cloud Run should still load recipes via `/api/*` (ADC path) — proves no regression.
- MCP `curl -H "Authorization: Bearer <RECIPES_COLLECTION>" https://<run-url>/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'` still succeeds.
- If anything still needs the Browser key (unlikely), revert via API regeneration within ~30 days.

### 8.3 Generate a new key **only if needed** (and keep it out of the repo)

You should **not** need a new browser key after the proxy cutover. If Firebase Console or another Google SDK insists one exists:

1. **Regenerate via Firebase Console (creates a new Browser key linked to the web app):**
   - `https://console.firebase.google.com/project/yes-chef-cookbook/settings/general` → **Your apps → Web app (1:158345618336:web:5846633ae0d4d529c13ac5)** → delete/re-add app or use **GCP Console → APIs & Services → Credentials → Create credentials → API key → Browser key**.

2. **Immediately restrict it** (never commit it):
   - **Application restrictions → HTTP referrers**: add only your custom domain(s) + `localhost` temporarily.
   - **API restrictions → Restrict key**: select only needed APIs (e.g. `Identity Toolkit API` if using Auth, otherwise none — but for this project, select **no** Firestore API if all access is via Admin SDK). Best restriction post-proxy is **no API enabled** or **no HTTP referrer matches production** — effectively unusable.

3. **Store it — if ever required by a backend component — in Secret Manager, not in repo:**
   ```bash
   echo -n "<NEW_KEY>" | gcloud secrets create firebase-browser-key --data-file=- --project=yes-chef-cookbook
   # Grant Cloud Run SA: gcloud secrets add-iam-policy-binding firebase-browser-key --member="serviceAccount:yes-chef-run@..." --role=roles/secretmanager.secretAccessor
   # Reference in run.tf as value_source { secret_key_ref { secret=firebase-browser-key version=latest } }
   ```

4. **Rotate local envs:** Update `terraform.tfvars` / `TF_VAR_*` / `Secret Manager` only; verify `git grep -r "AIza"` returns nothing (add a `pre-commit` hook to reject `AIza` pattern).

### 8.4 Git hygiene

- Add to `.gitignore` already (no `.env`).
- Consider a history rewrite if key was deemed sensitive by org policy: `git filter-repo --replace-text` or BFG, then force-push + rotate key (deletion already covers it). Document as optional — Firebase Browser keys are low-risk but public exposure violates "no API keys in repo" requirement.

---

## 9. Implementation Steps — Ordered Checklist

### Phase 0 — Prep & inventory (½ day) — snapshot existing infra
- [ ] Freeze `yes-chef-recipes/main`; tag `pre-gcp-move`.
- [ ] Capture live state for import accuracy (already partly done on 2026-09-07):
  ```bash
  gcloud projects describe yes-chef-cookbook --format="value(projectNumber)" # → 158345618336
  gcloud firestore databases describe --project=yes-chef-cookbook --format=json # locationId=nam5
  gcloud run services describe yes-chef-cookbook --project=yes-chef-cookbook --region=europe-west1 --format=json > /tmp/run-live.json
  gcloud pubsub topics describe billing-alerts --project=yes-chef-cookbook --format=json
  gcloud billing budgets list --billing-account=012C2A-E1DB49-8C3E18 --format=json > /tmp/budget-live.json
  gcloud functions describe budget-cap --gen2 --region=europe-west1 --project=yes-chef-cookbook --format=json > /tmp/fn-live.json
  gcloud services api-keys describe projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789 --project=yes-chef-cookbook --format=json > /tmp/key-live.json
  gcloud storage ls --project=yes-chef-cookbook # only gcf-v2-* + run-sources-* → confirms no static bucket yet
  ```
- [ ] `terraform fmt` + `tflint` + `gcloud --version` + `firebase --version` baseline.
- [ ] Run `npm run deploy:recipes -- --dry-run` and snapshot `recipes/` + Firestore dumps (`scripts/deploy-recipes.mjs --pull-only` — collection `deafening-gnarly-dining`).

### Phase 1 — Terraform skeleton & declarative imports (1 day) — no recreation
- [ ] Create `terraform/` per §5 + §2.5 (`versions.tf`, `variables.tf`, `main.tf` with `import {}` blocks for every existing resource). Set `project_id=yes-chef-cookbook`, `billing_account_id=012C2A-E1DB49-8C3E18`, `firestore_location=nam5`, `run_service_name=yes-chef-cookbook`.
- [ ] `terraform init` (local backend first). For remote state, create `gs://yes-chef-tfstate` (`gcloud storage buckets create gs://yes-chef-tfstate --location=europe-west1 --project=yes-chef-cookbook --uniform-bucket-level-access`) then `terraform init -migrate-state -backend-config="bucket=yes-chef-tfstate"`.
- [ ] **Import, don't create** — the `import {}` blocks already map live IDs (§2.5). Run:
  ```bash
  terraform plan  # should show: Firestore= no-op (nam5), Run= no-op or image-only update, PubSub= no-op, Budget= no-op or perpetual diff (see §2.5 lifecycle ignore), Function= no-op, Storage bucket= create (greenfield), API key= no resource (delete outside TF)
  ```
  - If `plan` wants to **create** Firestore/Run/Budget/Topic/Function, the `import.to` is wrong — fix `id` to live values in §2.5, not generic placeholders.
  - If `plan` wants to **destroy** `google_firestore_database` because `location_id` is `europe-west1`, fix TF to `nam5` immediately.
  - If budget shows unavoidable replace, schedule a 2-min window: `terraform destroy -target=google_billing_budget.cap` (deletes console budget) → `terraform apply -target=google_billing_budget.cap` (TF recreates identical EUR-10, 0.5/0.9/1.0 thresholds).
- [ ] Address Run v1→v2 drift: live is `autoscaling.knative.dev/minScale/maxScale` annotations + `concurrency=40` — TF v2 uses `scaling {}` and `container_concurrency`. Add `lifecycle { ignore_changes = [template[0].metadata[0].annotations] }` if TF churns on annotations. Verify `terraform plan` → `0 to add, 0 to destroy` for existing infra; only `google_storage_bucket.static` shows `1 to add`.

### Phase 2 — Monorepo move (½ day) — MCP + budget-cap ONLY, max 1, no RECIPES_COLLECTION
- [ ] Execute file moves in §4.2 (atomic commit `chore: move MCP + budget-cap into yes-chef (max1, no RECIPES_COLLECTION)`). **Do not move** `recipes/*.json`, `schema.json`, `scripts/deploy-recipes.mjs` — they stay in `yes-chef-recipes`.
- [ ] Fix `server/Dockerfile` to resolve `schema.json` from sibling `yes-chef-recipes` (or vendor a copy at build time) and update `validation.ts` import path. Refactor `server/src/firestore.ts` / `src/oauth.ts` / `src/index.ts` to remove `RECIPES_COLLECTION` / `getAuthToken()` reads; add `MCP_TOKEN` Secret Manager wiring if needed. Run `npm ci && npm run build` in `server/`.
- [ ] Docker sanity: `docker build -f server/Dockerfile -t yes-chef-test . && docker run -p 8080:8080 -e FIREBASE_PROJECT_ID=yes-chef-cookbook -e MCP_TOKEN=test yes-chef-test` → `curl localhost:8080/health` (no `RECIPES_COLLECTION`).

### Phase 3 — Cloud Run evolution (in-place, max 1, no RECIPES_COLLECTION) (1–2 days)
- [ ] Refactor `server/src/firestore.ts` / `src/index.ts` / `src/oauth.ts` / `src/mcp.ts` to discover the established collection (`deafening-gnarly-dining`) via Firestore, not `RECIPES_COLLECTION`. MCP auth switches from `RECIPES_COLLECTION` to `MCP_TOKEN` (Secret Manager). Update `server/src/api.ts` only if a thin `/api/*` proxy is retained (optional — PWA can use normal SDK directly). Add tests. Keep `POST /mcp`/`GET /mcp`/`/sse`/`/.well-known/*` untouched.
- [ ] Build & push new image from `server/`, then `terraform apply` — **updates the existing `yes-chef-cookbook` service in place** (same URL `https://yes-chef-cookbook-158345618336.europe-west1.run.app`) via rolling revision, setting `scaling.max_instance_count=1` (was 5) and **removing** `RECIPES_COLLECTION` env. Verify `terraform plan` shows: `~ max_instance_count 5→1`, `- env RECIPES_COLLECTION`, `+ env MCP_TOKEN` (if used). There is **no** second service.
  - If a rename is ever desired, it must be a separate phase with a new service + DNS alias + `SERVICE` env update in `budget-cap` function (`SERVICE=yes-chef-cookbook` today — see `gcloud functions describe budget-cap`).
- [ ] Smoke test on the **same** URL:
  ```bash
  RUN=https://yes-chef-cookbook-158345618336.europe-west1.run.app
  # MCP should work via new token (Secret Manager) — not RECIPES_COLLECTION
  curl -H "Authorization: Bearer $MCP_TOKEN" $RUN/mcp -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  curl $RUN/health  # unauthenticated, must be 200
  # If /api/* proxy retained, test without collection key:
  curl -H "Authorization: Bearer $MCP_TOKEN" $RUN/api/recipes 2>&1 | head
  # Verify scaling is 1:
  gcloud run services describe yes-chef-cookbook --region=europe-west1 --format="value(metadata.annotations['run.googleapis.com/maxScale'])"
  ```
- [ ] Verify env: `gcloud run services describe yes-chef-cookbook --region=europe-west1 --format="value(spec.template.spec.containers[0].env)"` must contain `FIREBASE_PROJECT_ID=yes-chef-cookbook` and **not** `RECIPES_COLLECTION`; `scaling.max_instance_count` must be `1`.

### Phase 4 — Frontend switch to normal SDK (no RECIPES_COLLECTION) (1 day)
- [ ] Rewrite `js/firebase.js` to the snippet's `import { initializeApp } from "firebase/app"` + `firebaseConfig` from generated `js/firebase-config.js` (TF/Secret Manager, not committed). Delete root `firebase.js` duplicate. Rewrite `js/firestore.js` to use `getFirestore(app)` + `collection(db, "deafening-gnarly-dining")` directly (no `RECIPES_COLLECTION` / `loadStoredCollectionKey()` branching). Update `js/storage.js` to deprecate collection-key storage; `js/data/recipes.js` + `js/bootstrap.js:20` to call the new init.
- [ ] Generate `js/firebase-config.js` at deploy time from Secret Manager (`firebase-config` JSON) — `gcloud secrets versions access ... > js/firebase-config.js` before `gcloud storage rsync`. Ensure `sw.js:28-30` `STATIC_ASSETS` lists `js/firebase.js` + `js/firebase-config.js` (cache-busted). `API_BASE` is **not needed** if PWA talks directly to Firestore via normal SDK.
- [ ] Local verification: `npm test` (jsdom — mock `firebase/app`), `npx eslint js test`, `python3 -m http.server 8000` with a local `js/firebase-config.js` (placeholder) + `FIRESTORE_EMULATOR_HOST=localhost:8080` + `server/ npm run dev` (MCP only, `MCP_TOKEN=dev`).
- [ ] Staging on GCS: `gcloud storage rsync` with generated `js/firebase-config.js`, test e2e (browse → detail → cook → timers still work). Verify writes to `deafening-gnarly-dining` succeed via normal SDK, writes to `new-collection` are denied by rules (§6.3).

### Phase 5 — Storage hosting cutover, Option A (½–1 day) — greenfield public bucket, no LB
- [ ] `terraform apply` for `storage.tf` (Option A only: `google_storage_bucket.static` + `allUsers:objectViewer` + `website` SPA fallback). Bucket `yes-chef-static-yes-chef-cookbook` is **new** (live `gcloud storage ls` has only `gcf-v2-*`/`run-sources-*`). Creation + IAM takes ~1 min. No `google_compute_*` resources.
- [ ] Generate `js/firebase-config.js` from Secret Manager, then `gcloud storage rsync --recursive --delete-unmatched-destination-objects ./ gs://yes-chef-static-yes-chef-cookbook/`; verify `Cache-Control` and `Content-Type` (`text/html`, `text/css`, `application/javascript`, `image/svg+xml`). Test URL `https://storage.googleapis.com/<bucket>/index.html` (no custom domain, no cert).
- [ ] Verify PWA install, offline shell (`sw.js` cache `CACHE_NAME`), `manifest.json` icons. No CDN invalidation step for Option A.

### Phase 6 — Firestore rules for established collections + key rotation (½ day) — delete live key `03a8b12a-…`
- [ ] Rewrite `firestore.rules` per §6.3 (allow `read, write: if true` on `deafening-gnarly-dining/{docId}` + `metadata`, deny `/{other=**}`). Deploy via `firebase deploy --only firestore:rules --project yes-chef-cookbook` (or TF `terraform_data` local-exec). TF has `google_firestore_database` imported but **not** a `google_apikeys_key` for the deleted key.
- [ ] Verify: `js/firebase.js` (normal SDK) can read/write `deafening-gnarly-dining` via `initializeApp(firebaseConfig)` with the **new** (or still-live) restricted key; writes to `arbitrary-collection` are `permission-denied` per rules. MCP (Admin SDK, `roles/datastore.user`) bypasses rules and still succeeds.
- [ ] Execute §8.2 key deletion (`gcloud services api-keys delete projects/158345618336/locations/global/keys/03a8b12a-d15e-4433-962d-a2adb05be789`) **after** the new `js/firebase-config.js` (with a newly-generated restricted key, §8.3) is deployed to GCS and verified. The literal snippet `apiKey: "AIzaSyD_j…"` must never be committed — only the Secret Manager version is used.
- [ ] `terraform plan` after rules — should show `0 to add, 0 to destroy` for DB (rules live outside TF; TF only manages `google_firestore_database` with `prevent_destroy`).

### Phase 7 — Budget cap TF-alignment (½ day) — already live, just adopt (cap is already 1, matches max 1)
- [ ] `terraform plan` shows `google_pubsub_topic.billing_alerts`, `google_billing_budget.cap` (billingAccounts/012C2A-…/budgets/92e9119…), and `google_cloudfunctions2_function.budget_cap` as **no-op** (imported). If budget shows replace, use maintenance window to destroy+recreate (see §2.5).
- [ ] Ensure TF source for function is `functions/budget-cap` (moved from `yes-chef-recipes/scripts/budget-cap` ONLY — deploy script stays). On next `terraform apply`, function rebuilds from new source path — verify `environmentVariables` remain `GCP_PROJECT=yes-chef-cookbook, REGION=europe-west1, SERVICE=yes-chef-cookbook, DISABLE_BILLING=false` (live values). Function's `PATCH maxInstanceCount=1` in `functions/budget-cap/index.js:143` is now idempotent (matches TF `max 1`).
- [ ] Test safely: `gcloud pubsub topics publish billing-alerts --project=yes-chef-cookbook --message='{"alertThresholdExceeded":1.0,"budgetAmount":{"units":10}}'` and observe `budget-cap` logs `CAP TRIGGERED` → Run `maxInstanceCount=1` (no-op if already 1); restore is unnecessary (TF `max 1` is the steady state). If you temporarily raised to 5 for migration, restore via `terraform apply` with `max_instance_count=1`.

### Phase 8 — Decommission & docs (½ day) — no Run deletion
- [ ] **Do NOT delete** `yes-chef-cookbook` Run service — it is the permanent MCP+API endpoint (imported, now TF-managed). Old URL `https://yes-chef-cookbook-158345618336.europe-west1.run.app` stays. If a rename was considered, document it as a future RFC, not part of this cutover.
- [ ] Archive `yes-chef-recipes` repo (make private/archived, update `mcp-server/README.md` → redirect to `yes-chef/server/README.md` + `terraform/README.md`). Live `run-sources-*` and `gcf-v2-*` buckets remain — do not delete via TF.
- [ ] Update root `README.md` + `AGENTS.md` (add `terraform init/plan/apply`, `import {}` for existing infra, `gcloud storage rsync` deploy, emulator notes, `billing_account_id=012C2A-…`, `firestore_location=nam5` caveat).
- [ ] Commit final `terraform.lock.hcl`, add CI (optional): `terraform fmt -check`, `terraform validate`, `tflint`, `gcloud storage rsync --dry-run`, `npm test`.

---

## 10. Testing & Verification Matrix (max 1, no RECIPES_COLLECTION, normal SDK)

| Check | Command / Action | Expected |
|-------|------------------|----------|
| Unit | `npm test` (Vitest jsdom) + `server tsc --noEmit` | All suites pass (mock `firebase/app` `initializeApp`); server builds with no `RECIPES_COLLECTION` |
| Lint | `npm run lint` + `tsc --noEmit` in `server/` | Zero errors (`no-alert`, `prefer-template` etc.) |
| Local PWA (normal SDK) | `python3 -m http.server 8000` with generated `js/firebase-config.js` + `FIRESTORE_EMULATOR_HOST=localhost:8080` | Browse/detail/cook/timers work via `initializeApp(firebaseConfig)` + `collection(db, "deafening-gnarly-dining")`; no collection-key prompt |
| Staging GCS | `gcloud storage rsync` (with `js/firebase-config.js` from Secret Manager) → open `https://storage.googleapis.com/<bucket>/index.html` | SW installs, offline reload works; `firebaseConfig` not visible in committed `js/firebase.js` |
| Prod (Option A) | `https://storage.googleapis.com/<bucket>/index.html` | 200, `cache-control`, `manifest.json` link; `getDocs(collection(db, "deafening-gnarly-dining"))` succeeds, `getDocs(collection(db, "new-collection"))` → `permission-denied` (rules allowlist) |
| MCP HTTP | `curl -H "Authorization: Bearer $MCP_TOKEN" .../mcp tools/list` with/without Bearer | 401 `WWW-Authenticate: Bearer` vs 200 list (token is `MCP_TOKEN`, not `RECIPES_COLLECTION`) |
| OAuth flow | `https://<run-url>/authorize?...` → enter `MCP_TOKEN` → redirect with `code` → `POST /token` with `code_verifier` → `access_token == MCP_TOKEN` | Full Claude-compatible flow, collection-agnostic |
| Firestore rules | Normal SDK `setDoc(doc(db, "deafening-gnarly-dining", "test"))` vs `setDoc(doc(db, "arbitrary", "x"))` | Established collection succeeds, arbitrary collection denied |
| Scaling | `gcloud run services describe yes-chef-cookbook --region=europe-west1 --format="value(spec.template.spec.containerConcurrency)"` + `maxScale` | `concurrency 40`, `max 1`, `min 0` |
| Budget cap (dry) | `gcloud pubsub topics publish billing-alerts --message='{"alertThresholdExceeded":1.0,...}'` | Function logs `CAP TRIGGERED`, Run `maxInstanceCount=1` (idempotent) |
| Rollback | `firebase deploy --only firestore:rules` revert + `gcloud storage rsync` prev snapshot + `terraform apply` (max 1) | Reverts within 5 min; no `RECIPES_COLLECTION` to restore |

---

## 11. Risks & Mitigations

- **TF import drift on billing budget / Firestore DB:** Budgets sometimes can't be imported — plan recreates via TF and deletes console one during a maintenance window; document `terraform state rm` fallback. `nam5` vs `europe-west1` drift already handled.
- **Public bucket website (Option A) limits:** No CDN, no custom domain/cert, and `https://storage.googleapis.com/<bucket>/` URL. Mitigation: acceptable per chosen Option A; `cache-control` via `gcloud storage objects update --cache-control` and `sw.js` bump for invalidation.
- **Single-instance limit (max 1):** With `max_instance_count=1`, cold starts and concurrent MCP + PWA load share one instance (`concurrency 40`). Risk: contention / throttling. Mitigation: keep `concurrency 40`, monitor `request_latencies`; the budget cap's `PATCH maxInstanceCount=1` is now no-op (steady state). If traffic grows, this must be revisited via RFC.
- **In-memory OAuth stores lost on scale-out:** `oauth.ts` uses `Map`s (single-instance safe per comment `oauth.ts:5`). With `max 1`, loss only on restarts (10 min `authCodes` TTL) — acceptable. If max ever raised, move to Firestore with TTL.
- **No RECIPES_COLLECTION — collection discovery:** Refactor risk: hardcoding `deafening-gnarly-dining` is simplest; adding a new established collection requires a `firestore.rules` allowlist update + code change. Document `config/activeCollections` alternative for future.
- **Cache invalidation after static deploy:** Add CI step `invalidate-cdn-cache` and version `CACHE_NAME` bump (`sw.js:2 yes-chef-v19`); ensure `js/firebase-config.js` is cache-busted (`?v=` hash).
- **Service account IAM propagation delay:** After `roles/datastore.user` grant, wait ~60s before testing; add `depends_on` in TF.

---

## 12. Effort Estimate

| Phase | Duration | Owner |
|-------|----------|-------|
| 0 Prep | 0.5 d | — |
| 1 Terraform skeleton & imports | 1 d | — |
| 2 Monorepo move | 0.5 d | — |
| 3 Cloud Run unification | 1–2 d | — |
| 4 Frontend proxy | 1 d | — |
| 5 Storage (Option A) | 0.5–1 d | — |
| 6 Lockdown + key deletion | 0.5 d | — |
| 7 Budget cap TF | 0.5 d | — |
| 8 Decommission & docs | 0.5 d | — |
| **Total** | **~6–7.5 d** | single engineer |

---

## 13. Appendix — File-Level Traceability (updated scope)

- Key exposure to remove / generate: `firebase.js:3-9`, `js/firebase.js:2-9` → rewritten to `import { initializeApp } from "firebase/app"` + `js/firebase-config.js` (Secret Manager, not committed). Literal snippet `apiKey: "AIzaSyD_j…"` must never be committed.
- Removed env: `RECIPES_COLLECTION` — delete from `mcp-server/src/firestore.ts:38-47` (`getCollectionName`/`getAuthToken`), `mcp-server/src/index.ts:96-130` (`expected`), `mcp-server/src/oauth.ts:80-89`, `yes-chef-recipes/.env` / `mcp-server/.env.example`, and live Run `env`. No `var.recipes_collection`.
- Rules to flip: `firestore.rules:7-10` → allowlist for `deafening-gnarly-dining/{docId}` + `metadata` `allow read, write: if true;` + `config/{docId}` `allow read;` + `/{other=**} deny`.
- Assets to bucket: `index.html`, `manifest.json`, `css/base.css`, `css/views.css`, `js/**` (including `js/firebase.js` (normal SDK) + generated `js/firebase-config.js`), `icons/*`, `sw.js`.
- Moved only: `mcp-server/*` → `server/*`, `scripts/budget-cap/*` → `functions/budget-cap/*`. **NOT moved:** `recipes/*.json`, `schema.json`, `scripts/deploy-recipes.mjs` (stay in `yes-chef-recipes`).
- Scaling: `run.tf` `scaling.max_instance_count=1` (was 5). `budget-cap/index.js:143` `maxInstanceCount:1` is now idempotent.
- Schema: `schema.json` stays in `yes-chef-recipes`; `server/Dockerfile` / `validation.ts` resolve via sibling path or build-time copy (not a move).
