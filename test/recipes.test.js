import { describe, it, expect } from 'vitest';
import { getRecipes, getRecipe } from '../js/data/recipes.js';

describe('recipes data service', () => {
  it('getRecipes returns array with menemen recipe', async () => {
    const recipes = await getRecipes();
    expect(Array.isArray(recipes)).toBe(true);
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.some((r) => r.id === 'menemen')).toBe(true);
  });

  it('getRecipe returns correct shape for menemen', async () => {
    const recipe = await getRecipe('menemen');
    expect(recipe).not.toBeNull();
    expect(recipe.id).toBe('menemen');
    expect(recipe.title).toBe('Menemen');
    expect(Array.isArray(recipe.ingredients)).toBe(true);
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(Array.isArray(recipe.steps)).toBe(true);
    expect(recipe.steps.length).toBeGreaterThan(0);
    expect(recipe.servings.base).toBe(2);
    expect(recipe.tags).toContain('breakfast');
    expect(recipe.tags).toContain('vegetarian');
  });

  it('getRecipe returns null for missing ID', async () => {
    const recipe = await getRecipe('nonexistent');
    expect(recipe).toBeNull();
  });

  it('recipe ingredients have required fields', async () => {
    const recipe = await getRecipe('menemen');
    recipe.ingredients.forEach((ing) => {
      expect(ing.id).toBeDefined();
      expect(ing.name).toBeDefined();
      expect(typeof ing.amount).toBe('number');
      expect(ing.unit).toBeDefined();
      expect(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'pinch']).toContain(ing.unit);
    });
  });

  it('recipe steps have required fields', async () => {
    const recipe = await getRecipe('menemen');
    recipe.steps.forEach((step) => {
      expect(step.id).toBeDefined();
      expect(typeof step.order).toBe('number');
      expect(step.text).toBeDefined();
      expect(Array.isArray(step.ingredientRefs)).toBe(true);
      if (step.timer) {
        expect(typeof step.timer.durationSeconds).toBe('number');
        expect(step.timer.label).toBeDefined();
      }
    });
  });
});