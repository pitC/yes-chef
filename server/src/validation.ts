import AjvCtor from "ajv";
import addFormatsFn from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";

// NodeNext ESM interop: ajv/ajv-formats are CJS — grab default if present
const Ajv = (AjvCtor as unknown as { default: typeof AjvCtor }).default ?? AjvCtor;
const addFormats = (addFormatsFn as unknown as { default: typeof addFormatsFn }).default ?? addFormatsFn;
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve schema.json — try multiple candidates so it works from dev, dist, and Docker
const candidates = [
  path.resolve(__dirname, "../../schema.json"),          // from dist/  -> repo root (dev: mcp-server/dist -> repo root)
  path.resolve(__dirname, "../schema.json"),             // dist's parent is mcp-server or /app
  path.resolve(__dirname, "./schema.json"),              // schema copied alongside compiled JS (Docker: /app/dist/schema.json)
  path.resolve(__dirname, "../../yes-chef-recipes/schema.json"),
  path.resolve(process.cwd(), "schema.json"),            // cwd = repo root or /app
  path.resolve(process.cwd(), "../schema.json"),
  path.resolve(process.cwd(), "mcp-server/schema.json"),
  "/app/schema.json",                                    // Cloud Run absolute
  "/app/dist/schema.json",
];

function findSchema(): string {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fallback: repo-root relative when running via tsx from mcp-server/src
  const fallback = path.resolve(__dirname, "../../schema.json");
  if (existsSync(fallback)) return fallback;
  throw new Error(
    `schema.json not found. Tried: ${candidates.join(", ")}`
  );
}

const schemaPath = findSchema();
const rawSchema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new (Ajv as unknown as { new (opts: unknown): import("ajv").Ajv })({ allErrors: true, strict: false, verbose: true } as unknown as never);
(addFormats as unknown as (a: unknown) => void)(ajv as unknown);

// schema.json uses `format: "uri"` etc. — ajv-formats covers date-time/uri
const validate = ajv.compile(rawSchema);

export function validateRecipe(data: unknown): { valid: boolean; errors?: string } {
  const ok = validate(data);
  if (ok) return { valid: true };
  const msgs = (validate.errors ?? [])
    .map((e: { instancePath: string; message?: string; params: unknown }) => {
      const at = e.instancePath || "(root)";
      return `${at} ${e.message}${e.params ? ` (${JSON.stringify(e.params)})` : ""}`;
    })
    .join("; ");
  return { valid: false, errors: msgs };
}

export function assertValidRecipe(data: unknown): void {
  const { valid, errors } = validateRecipe(data);
  if (!valid) {
    throw new Error(`Recipe validation failed: ${errors}`);
  }
}

export { schemaPath, rawSchema };
