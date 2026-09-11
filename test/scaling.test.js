import { describe, it, expect } from 'vitest';
import { scaleAmount, formatAmount, scaleIngredients } from '../public/js/utils/scaling.js';

describe('scaling utilities', () => {
  describe('scaleAmount', () => {
    it('scales 200 from 2 to 4 servings', () => {
      expect(scaleAmount(200, 2, 4)).toBe(400);
    });

    it('scales 1 from 2 to 3 servings (ceil 1.5 -> 2)', () => {
      expect(scaleAmount(1, 2, 3)).toBe(2);
    });

    it('scales 0.5 from 2 to 1 serving (ceil 0.25 -> 1)', () => {
      expect(scaleAmount(0.5, 2, 1)).toBe(1);
    });

    it('returns same amount when base equals target', () => {
      expect(scaleAmount(100, 2, 2)).toBe(100);
    });

    it('handles zero amount', () => {
      expect(scaleAmount(0, 2, 4)).toBe(0);
    });

    it('scales 1.2 cups by 2x -> 3 (ceil 2.4)', () => {
      expect(scaleAmount(1.2, 1, 2)).toBe(3);
    });

    it('scales 0.6 tsp by 3x -> 2 (ceil 1.8)', () => {
      expect(scaleAmount(0.6, 1, 3)).toBe(2);
    });

    it('scales 1 tsp from 2 to 3 servings with half-increment -> 1.5', () => {
      expect(scaleAmount(1, 2, 3, 'tsp')).toBe(1.5);
    });

    it('scales 1 tbsp from 2 to 3 servings with half-increment -> 1.5', () => {
      expect(scaleAmount(1, 2, 3, 'tbsp')).toBe(1.5);
    });

    it('scales 1.2 tsp by 2x -> 2.5 (half ceil 2.4)', () => {
      expect(scaleAmount(1.2, 1, 2, 'tsp')).toBe(2.5);
    });

    it('keeps integer ceil for non-tsp units', () => {
      expect(scaleAmount(1, 2, 3, 'piece')).toBe(2);
      expect(scaleAmount(1.2, 1, 2, 'g')).toBe(3);
    });
  });

  describe('formatAmount', () => {
    it('formats 1.5 as "1.5"', () => {
      expect(formatAmount(1.5)).toBe('1.5');
    });

    it('formats 1 as "1"', () => {
      expect(formatAmount(1)).toBe('1');
    });

    it('formats 0.25 as "0.25"', () => {
      expect(formatAmount(0.25)).toBe('0.25');
    });

    it('formats 0.5 as "0.5"', () => {
      expect(formatAmount(0.5)).toBe('0.5');
    });

    it('formats 2 as "2"', () => {
      expect(formatAmount(2)).toBe('2');
    });
  });

  describe('scaleIngredients', () => {
    it('preserves id, name, unit, notes; scales amount', () => {
      const ingredients = [
        { id: 'ing_1', name: 'eggs', amount: 4, unit: 'piece', notes: null },
        { id: 'ing_2', name: 'olive oil', amount: 3, unit: 'tbsp', notes: 'extra virgin' },
      ];
      const scaled = scaleIngredients(ingredients, 2, 4);
      
      expect(scaled).toHaveLength(2);
      expect(scaled[0]).toEqual({
        id: 'ing_1',
        name: 'eggs',
        amount: 8,
        unit: 'piece',
        notes: null,
      });
      expect(scaled[1]).toEqual({
        id: 'ing_2',
        name: 'olive oil',
        amount: 6,
        unit: 'tbsp',
        notes: 'extra virgin',
      });
    });

    it('does not modify original ingredients', () => {
      const ingredients = [
        { id: 'ing_1', name: 'eggs', amount: 4, unit: 'piece', notes: null },
      ];
      scaleIngredients(ingredients, 2, 4);
      expect(ingredients[0].amount).toBe(4);
    });

    it('scales spices (tsp/tbsp) same as others', () => {
      const ingredients = [
        { id: 'ing_1', name: 'cumin', amount: 1, unit: 'tsp', notes: null },
        { id: 'ing_2', name: 'oil', amount: 1, unit: 'tbsp', notes: null },
      ];
      const scaled = scaleIngredients(ingredients, 2, 4);
      expect(scaled[0].amount).toBe(2);
      expect(scaled[1].amount).toBe(2);
    });

    it('rounds up fractional scaled amounts via scaleIngredients (g integer, tsp half)', () => {
      const ingredients = [
        { id: 'ing_1', name: 'flour', amount: 1.2, unit: 'g', notes: null },
        { id: 'ing_2', name: 'salt', amount: 0.6, unit: 'tsp', notes: null },
      ];
      const scaled = scaleIngredients(ingredients, 1, 2);
      expect(scaled[0].amount).toBe(3);
      expect(scaled[1].amount).toBe(1.5);
    });

    it('turmeric example: 1 tsp at 2 servings -> 1.5 tsp at 3 servings', () => {
      const ingredients = [
        { id: 'ing_1', name: 'turmeric', amount: 1, unit: 'tsp', notes: null },
      ];
      const scaled = scaleIngredients(ingredients, 2, 3);
      expect(scaled[0].amount).toBe(1.5);
    });
  });
});