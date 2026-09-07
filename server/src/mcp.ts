import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCollection, generateId, nowIso, slugify } from "./firestore.js";
import { assertValidRecipe } from "./validation.js";

// Zod schemas for ingredients/steps mirror schema.json closed enums
const unitEnum = z.enum(["g", "kg", "ml", "l", "tsp", "tbsp", "piece", "pinch"]);
const servingsUnitEnum = z.enum(["people", "servings"]);

const ingredientSchema = z.object({
  id: z.string().optional().describe("Ingredient ID, auto-generated as ing_N if omitted"),
  name: z.string().min(1).describe("Ingredient name"),
  amount: z.number().describe("Amount relative to servings.base"),
  unit: unitEnum.describe("Unit from closed enum"),
  notes: z.string().nullable().optional().describe("Preparation notes or null"),
});

const stepTimerSchema = z
  .object({
    durationSeconds: z.number().int().positive(),
    label: z.string().min(1),
  })
  .nullable()
  .optional();

const stepSchema = z.object({
  id: z.string().optional().describe("Step ID, auto-generated as step_N if omitted"),
  order: z.number().int().positive().describe("Step order number (1,2,3...)"),
  title: z.string().optional().describe("Short title for quick reference"),
  text: z.string().min(1).describe("Step description; ingredient names in brackets e.g. [onions]"),
  timer: stepTimerSchema.describe("Optional timer"),
  ingredientRefs: z.array(z.string()).optional().describe("Ingredient IDs relevant to this step"),
});

const baseRecipeInput = {
  title: z.string().min(1).describe("Recipe title"),
  sourceUrl: z.string().url().optional().describe("Original source URL"),
  sourceName: z.string().optional().describe("Source publication, e.g. 'The Guardian'"),
  tags: z.array(z.string()).optional().describe("Flat array of labels"),
  servings: z
    .object({
      base: z.number().positive().describe("Base serving count"),
      unit: servingsUnitEnum,
    })
    .optional(),
  timing: z
    .object({
      prepMinutes: z.number().int().min(0).optional(),
      cookMinutes: z.number().int().min(0).optional(),
      totalMinutes: z.number().int().min(0).optional(),
    })
    .optional(),
  ingredients: z.array(ingredientSchema).min(1).describe("List of ingredients — unit must be in closed enum"),
  steps: z.array(stepSchema).min(1).describe("List of cooking steps"),
};

function normalizeRecipeForValidation(input: Record<string, unknown>): Record<string, unknown> {
  // Ensure ingredients/steps have ids and defaults; coerce notes null etc.
  const ingredients = (input.ingredients as unknown[]) as Record<string, unknown>[];
  const steps = (input.steps as unknown[]) as Record<string, unknown>[];

  const normIngredients = ingredients.map((ing, idx) => ({
    id: (ing.id as string) || `ing_${idx + 1}`,
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
    notes: ing.notes ?? null,
  }));

  const normSteps = steps.map((s, idx) => ({
    id: (s.id as string) || `step_${idx + 1}`,
    order: s.order ?? idx + 1,
    title: (s.title as string) || undefined,
    text: s.text,
    timer: (s.timer as unknown) ?? null,
    ingredientRefs: (s.ingredientRefs as string[]) ?? [],
  }));

  return {
    ...input,
    ingredients: normIngredients,
    steps: normSteps,
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "yes-chef-recipes",
    version: "0.1.0",
  });

  // ── create_recipe ──────────────────────────────────────────────
  server.tool(
    "create_recipe",
    "Create a new recipe from scratch in Firestore. Validates against schema.json (closed unit enums, required title/ingredients/steps). Generates id and timestamps. Returns the created document.",
    {
      id: z.string().optional().describe("Optional document ID (slug). If omitted, generated from title."),
      ...baseRecipeInput,
    },
    async (args) => {
      try {
        const { id: requestedId, ...rest } = args as Record<string, unknown> & { id?: string };

        const title = rest.title as string;
        if (!title) {
          return { content: [{ type: "text", text: "title is required" }], isError: true };
        }

        let docId = requestedId?.trim() || slugify(title);
        if (!docId) docId = generateId(title);
        docId = docId.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
        if (!docId) docId = generateId(title);

        const now = nowIso();
        let candidate: Record<string, unknown> = {
          id: docId,
          ...normalizeRecipeForValidation(rest as Record<string, unknown>),
          createdAt: now,
          updatedAt: now,
        };

        // Validate before any Firestore I/O so callers get schema errors without needing emulator
        try {
          assertValidRecipe(candidate);
        } catch (e) {
          const msg = (e as Error).message;
          return { content: [{ type: "text", text: `Validation failed: ${msg}` }], isError: true };
        }

        const col = getCollection();
        const existing = await col.doc(docId).get();
        if (existing.exists) {
          docId = `${docId}-${Math.random().toString(36).slice(2, 6)}`;
          candidate = { ...candidate, id: docId };
        }

        await col.doc(docId).set(candidate);
        return {
          content: [{ type: "text", text: JSON.stringify({ id: docId, ...candidate }, null, 2) }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `Firestore error: ${msg}` }], isError: true };
      }
    }
  );

  // ── update_recipe ──────────────────────────────────────────────
  server.tool(
    "update_recipe",
    "Update an existing recipe by ID in Firestore. Provide `id` and `updates` (partial recipe fields) or a full recipe payload via `recipe`. Merges with existing document, re-validates against schema.json, bumps updatedAt, and returns the updated document.",
    {
      id: z.string().min(1).describe("Existing document ID"),
      updates: z
        .object({
          title: z.string().min(1).optional(),
          sourceUrl: z.string().url().optional(),
          sourceName: z.string().optional(),
          tags: z.array(z.string()).optional(),
          servings: z
            .object({
              base: z.number().positive(),
              unit: servingsUnitEnum,
            })
            .optional(),
          timing: z
            .object({
              prepMinutes: z.number().int().min(0).optional(),
              cookMinutes: z.number().int().min(0).optional(),
              totalMinutes: z.number().int().min(0).optional(),
            })
            .optional(),
          ingredients: z.array(ingredientSchema).optional(),
          steps: z.array(stepSchema).optional(),
        })
        .optional()
        .describe("Partial fields to merge into existing recipe"),
      recipe: z
        .record(z.unknown())
        .optional()
        .describe(
          "Alternative: full recipe object to replace/merge (same shape as create_recipe input). If provided, `updates` is ignored."
        ),
    },
    async ({ id, updates, recipe }) => {
      try {
        const col = getCollection();
        const ref = col.doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
          return { content: [{ type: "text", text: `Not found: no recipe with id "${id}"` }], isError: true };
        }
        const existing = snap.data() as Record<string, unknown>;
        const patch: Record<string, unknown> =
          (recipe as Record<string, unknown>) ?? (updates as Record<string, unknown>) ?? {};

        if (!patch || Object.keys(patch).length === 0) {
          return { content: [{ type: "text", text: "No updates provided. Supply `updates` or `recipe`." }], isError: true };
        }

        let merged: Record<string, unknown> = {
          ...existing,
          ...patch,
          id,
          updatedAt: nowIso(),
          createdAt: existing.createdAt,
        };

        if (patch.ingredients || patch.steps) {
          merged = normalizeRecipeForValidation(merged);
          merged.id = id;
          merged.createdAt = existing.createdAt;
          merged.updatedAt = nowIso();
        }

        try {
          assertValidRecipe(merged);
        } catch (e) {
          const msg = (e as Error).message;
          return { content: [{ type: "text", text: `Validation failed: ${msg}` }], isError: true };
        }

        await ref.set(merged, { merge: false });
        return { content: [{ type: "text", text: JSON.stringify(merged, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `Firestore error: ${msg}` }], isError: true };
      }
    }
  );

  // ── search_recipes ─────────────────────────────────────────────
  server.tool(
    "search_recipes",
    "Search existing recipes by keyword, matching against title, tags, and step descriptions (step text + step title). Case-insensitive substring search. Requires Firestore read. Returns matching recipes (optionally limited). Firestore has no native full-text index, so search is performed in-memory after fetching the collection — suitable for cookbook-sized collections.",
    {
      keyword: z.string().min(1).describe("Keyword to search for (e.g. 'tomato', 'egg', 'cocktail')"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return (default 20, max 100)"),
      field: z
        .enum(["title", "tags", "steps", "all"])
        .optional()
        .describe("Restrict search to `title`, `tags`, or `steps` only, or `all` (default)"),
    },
    async ({ keyword, limit, field }) => {
      try {
        const col = getCollection();
        const snap = await col.get();
      const q = keyword.toLowerCase();
      const scope = field ?? "all";
      const max = limit ?? 20;

      type Hit = { id: string; title: string; matchedIn: string[]; recipe: unknown };

      const hits: Hit[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const title = String(data.title ?? "");
        const steps = (data.steps ?? []) as Array<Record<string, unknown>>;
        const tags = (data.tags ?? []) as string[];
        const matchedIn: string[] = [];

        if (scope === "title" || scope === "all") {
          if (title.toLowerCase().includes(q)) matchedIn.push("title");
        }
        if (scope === "tags" || scope === "all") {
          for (const tag of tags) {
            if (String(tag).toLowerCase().includes(q)) {
              matchedIn.push(`tags:${String(tag)}`);
              break;
            }
          }
        }
        if (scope === "steps" || scope === "all") {
          for (const s of steps) {
            const text = String(s.text ?? "");
            const stitle = String(s.title ?? "");
            if (text.toLowerCase().includes(q) || stitle.toLowerCase().includes(q)) {
              matchedIn.push(`steps[${s.order ?? "?"}]`);
              break; // one hit per recipe enough to count; include detail below
            }
          }
        }
        if (matchedIn.length > 0) {
          // Collect which steps/tags actually matched for richer output (respect scope)
          const stepHits =
            scope === "steps" || scope === "all"
              ? steps
                  .filter((s) => {
                    const t = `${String(s.text ?? "")} ${String(s.title ?? "")}`.toLowerCase();
                    return t.includes(q);
                  })
                  .map((s) => `step ${s.order}: ${String(s.title ?? "").trim() || String(s.text).slice(0, 80)}`)
              : [];
          const tagHits =
            scope === "tags" || scope === "all"
              ? tags.filter((t) => String(t).toLowerCase().includes(q)).map((t) => `tags: ${String(t)}`)
              : [];
          const titleHits = matchedIn.filter((m) => m === "title");

          hits.push({
            id: doc.id,
            title,
            matchedIn: stepHits.length || tagHits.length ? [...titleHits, ...tagHits, ...stepHits] : matchedIn,
            recipe: data,
          });
        }
        if (hits.length >= max) break;
      }

      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `No recipes found for keyword "${keyword}" (searched ${snap.size} recipes, scope=${scope}).` }],
        };
      }

      // Return compact list plus full docs; clients can choose what to render
      const compact = hits.map((h) => ({
        id: h.id,
        title: h.title,
        matchedIn: h.matchedIn,
      }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  keyword,
                  scope,
                  totalInCollection: snap.size,
                  returned: hits.length,
                  results: compact,
                  recipes: hits.map((h) => h.recipe),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `Firestore error: ${msg}` }], isError: true };
      }
    }
  );

  return server;
}
