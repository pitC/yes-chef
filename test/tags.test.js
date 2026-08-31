import { describe, it, expect } from 'vitest';
import { extractAllTags, filterByTags, filterByKeyword } from '../js/utils/tags.js';

describe('tag utilities', () => {
  const recipes = [
    {
      id: 'recipe1',
      title: 'Recipe 1',
      tags: ['breakfast', 'vegetarian'],
      ingredients: [{ name: 'eggs', amount: 2, unit: 'piece' }],
    },
    {
      id: 'recipe2',
      title: 'Recipe 2',
      tags: ['dinner', 'meat'],
      ingredients: [{ name: 'chicken', amount: 200, unit: 'g' }],
    },
    {
      id: 'recipe3',
      title: 'Recipe 3',
      tags: ['breakfast', 'vegan'],
      ingredients: [{ name: 'tofu', amount: 100, unit: 'g' }],
    },
  ];

  describe('extractAllTags', () => {
    it('returns unique sorted tags from all recipes', () => {
      const tags = extractAllTags(recipes);
      expect(tags).toEqual(['breakfast', 'dinner', 'meat', 'vegan', 'vegetarian']);
    });

    it('returns empty array for empty recipes', () => {
      expect(extractAllTags([])).toEqual([]);
    });

    it('handles recipes with no tags', () => {
      const noTags = [{ id: '1', title: 'No Tags', tags: [], ingredients: [] }];
      expect(extractAllTags(noTags)).toEqual([]);
    });
  });

  describe('filterByTags', () => {
    it('returns all recipes when no tags selected', () => {
      const filtered = filterByTags(recipes, []);
      expect(filtered).toHaveLength(3);
    });

    it('returns only vegetarian recipes', () => {
      const filtered = filterByTags(recipes, ['vegetarian']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe1');
    });

    it('returns recipes matching ALL tags (AND logic)', () => {
      const filtered = filterByTags(recipes, ['breakfast', 'vegetarian']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe1');
    });

    it('returns empty when no recipe has all selected tags', () => {
      const filtered = filterByTags(recipes, ['breakfast', 'dinner']);
      expect(filtered).toHaveLength(0);
    });

    it('returns empty when no match', () => {
      const filtered = filterByTags(recipes, ['dessert']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterByKeyword', () => {
    it('matches title case-insensitive', () => {
      const filtered = filterByKeyword(recipes, 'recipe 1');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe1');
    });

    it('matches ingredients case-insensitive', () => {
      const filtered = filterByKeyword(recipes, 'CHICKEN');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe2');
    });

    it('matches tags case-insensitive', () => {
      const filtered = filterByKeyword(recipes, 'VEGAN');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe3');
    });

    it('returns all for empty query', () => {
      const filtered = filterByKeyword(recipes, '');
      expect(filtered).toHaveLength(3);
    });

    it('returns empty for no match', () => {
      const filtered = filterByKeyword(recipes, 'pizza');
      expect(filtered).toHaveLength(0);
    });
  });

  describe('combined filtering', () => {
    it('combines tag filter and keyword filter', () => {
      const tagged = filterByTags(recipes, ['breakfast']);
      const filtered = filterByKeyword(tagged, 'vegan');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('recipe3');
    });
  });
});