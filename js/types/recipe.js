/**
 * @typedef {Object} Servings
 * @property {number} base - Base serving count
 * @property {'people'|'servings'} unit - Unit for base count
 */

/**
 * @typedef {Object} Timing
 * @property {number} [prepMinutes] - Preparation time in minutes
 * @property {number} [cookMinutes] - Cooking time in minutes
 * @property {number} [totalMinutes] - Total time in minutes
 */

/**
 * @typedef {Object} Ingredient
 * @property {string} id - Ingredient ID
 * @property {string} name - Ingredient name
 * @property {number} amount - Amount relative to servings.base
 * @property {'g'|'kg'|'ml'|'l'|'tsp'|'tbsp'|'piece'|'pinch'} unit - Unit from closed enum
 * @property {string|null} [notes] - Optional ingredient notes
 */

/**
 * @typedef {Object} Timer
 * @property {number} durationSeconds - Timer duration in seconds
 * @property {string} label - Timer label
 */

/**
 * @typedef {Object} Step
 * @property {string} id - Step ID
 * @property {number} order - Step order number
 * @property {string} [title] - Short title for quick reference (e.g., 'Soften onions'), displayed alongside step number and when collapsed
 * @property {string} text - Step description
 * @property {Timer|null} [timer] - Optional timer per step
 * @property {string[]} ingredientRefs - Ingredient IDs relevant to this step
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id - Auto-generated document ID
 * @property {string} title - Recipe title
 * @property {string} sourceUrl - Original source URL
 * @property {string} sourceName - Source name/publication
 * @property {string[]} tags - Flat array of dietary and meal-type labels
 * @property {Servings} servings - Serving information
 * @property {Timing} [timing] - Timing object (optional)
 * @property {Ingredient[]} ingredients - List of ingredients
 * @property {Step[]} steps - List of cooking steps
 * @property {string} createdAt - Creation timestamp (ISO 8601)
 * @property {string} updatedAt - Last update timestamp (ISO 8601)
 */