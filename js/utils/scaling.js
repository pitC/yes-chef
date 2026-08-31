export function scaleAmount(amount, baseServings, targetServings) {
  if (baseServings === targetServings) return amount;
  return (amount * targetServings) / baseServings;
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
    amount: scaleAmount(ing.amount, baseServings, targetServings),
  }));
}