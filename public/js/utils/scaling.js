export function scaleAmount(amount, baseServings, targetServings, unit) {
  if (baseServings === targetServings) return amount;
  if (amount === 0) return 0;
  const raw = (amount * targetServings) / baseServings;
  const isHalfUnit = unit === 'tsp' || unit === 'tbsp';
  if (isHalfUnit) {
    const ceiled = Math.ceil(raw * 2 - 1e-9) / 2;
    return Object.is(ceiled, -0) ? 0 : ceiled;
  }
  const ceiled = Math.ceil(raw - 1e-9);
  return Object.is(ceiled, -0) ? 0 : ceiled;
}

export function formatAmount(amount) {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return String(amount);
}

export function scaleIngredients(ingredients, baseServings, targetServings) {
  return ingredients.map((ing) => ({
    ...ing,
    amount: scaleAmount(ing.amount, baseServings, targetServings, ing.unit),
  }));
}