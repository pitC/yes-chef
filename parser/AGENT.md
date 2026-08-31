# AGENT — Recipe Parsing Agent for Yes Chef

This agent fetches recipe web pages, extracts structured data, normalizes units, and writes JSON matching the `parser/schema.json` contract.

## Workflow

### 1. Fetch the recipe page
- Use `fetch(url)` to retrieve the HTML
- Parse with a schema.org/Recipe microdata parser where present
- Fallback: extract key fields from visible page structure (titles, ingredient lists, step descriptions)

### 2. Extract and normalize fields

| Field | Source | Normalization |
|---|---|---|
| `title` | `<h1>`, `<title>` | Keep as-is |
| `sourceUrl` | Current page URL | Keep as-is |
| `sourceName` | Domain name (e.g. "The Guardian") | Keep as-is |
| `tags` | Recipe category tags, or keyword parsing | Flat array of strings. Allowed labels: `mains`, `fish`, `veg`, `meat`, `salad`, `breakfast/supper`, `cocktails` |
| `servings.base` | "Serves X" or "Portions X" | Number |
| `servings.unit` | "servings", "people", or default "people" | From closed enum |
| `timing.prepMinutes` | "Prep X min" | Integer |
| `timing.cookMinutes` | "Cook X min" | Integer |
| `timing.totalMinutes` | Sum of prep + cook | Integer |
| `ingredients[name, amount, unit]` | `<li>` items, `<meta itemprop="recipeIngredient">` | **Unit must be normalized to closed enum: `g, kg, ml, l, tsp, tbsp, piece, pinch`**. Spices forced to `tsp`/`tbsp`. |
| `ingredients.id` | Generated as `ing_N` | Auto-generated |
| `ingredients.notes` | Free-text beside ingredient | String or `null` |
| `steps[order, text, timer?, ingredientRefs[]]` | Step list `<ol>` or numbered divs | `timer` optional; `ingredientRefs` lists ingredient `id`s relevant to that step |

### 3. Unit normalization rules (critical)

- **Weight/mass**: `g`, `kg`, `g` (grams); convert to `g` if possible
- **Volume**: `ml`, `l`, convert to milliliters
- **Spices**: `tsp`, `tbsp` — if source says "1 tsp cumin", keep as `tsp`; if "1 tablespoon oil", keep as `tbsp`
- **Counts**: `piece` — e.g. "4 eggs", "2 cloves garlic" → `piece` (cloves normalized per schema)
- **Pinch**: `pinch` — if explicitly listed
- **Always relative to `servings.base`**: The agent must scale `amount` by `targetServings / servings.base` when the user changes serving count.

### 4. Steps extraction

- Each step gets sequential `order` (1, 2, 3...)
- Ingredients in the step text are encapsulated in brackets, e.g. `[onions]`, `[garlic]`, `[eggs]`
- `timer` is optional: `{ durationSeconds, label }` if the step has a cook/prep time
- `ingredientRefs` lists which ingredient `id`s are relevant to that step — the cooking mode uses this to highlight ingredients

### 5. Output

Write one JSON file per recipe to `parser/` directory, matching `schema.json`. Filename is the recipe `id` (e.g. `example.json`).

### 6. Example: Menemen

The `parser/example.json` was parsed from:
<https://www.theguardian.com/food/2026/aug/29/yotam-ottolenghi-simple-breakfasts-recipes>

Key parsing decisions for Menemen:
- Garlic "3 cloves" → normalized to `unit: "piece"` (cloves not in closed enum, mapped to `piece`)
- Spices (cumin, Aleppo chilli, cinnamon) kept as `tsp`
- Tomato paste `0.5 tbsp` kept as `tbsp`
- Cherry tomatoes `300g` kept as `g`
- Step timers: 5 min (step 2), 2 min (step 3), 10 min (step 4) extracted from cooking instructions

### 7. Running the agent

The agent itself fetches, parses, and normalizes recipe web pages, writing JSON matching `parser/schema.json`. At the end, validate the output:

```bash
# From yeschef root
python3 -c "
import json, jsonschema
with open('parser/<recipe-id>.json') as f:
    data = json.load(f)
with open('parser/schema.json') as f:
    schema = json.load(f)
if jsonschema.validate(data, schema):
    print('VALID: <recipe-id>.json conforms to schema.json')
else:
    print('INVALID')
"
```

The agent will:
1. Fetch and parse the page
2. Extract recipe fields per the schema
3. Normalize all units to the closed enum: `g, kg, ml, l, tsp, tbsp, piece, pinch`
4. Write `<recipe-id>.json` to `parser/`
5. Exit with status 0 on success
"

