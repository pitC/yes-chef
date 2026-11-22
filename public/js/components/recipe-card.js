import { escapeHtml } from '../utils/escape.js';

// Category priority determines which tag "wins" for the card banner colour.
// Order: cocktails > fish > meat > veg > mains > breakfast/supper > starter/salad/side.
const TAG_PRIORITY = ['cocktails', 'fish', 'meat', 'veg', 'mains', 'breakfast/supper', 'starter', 'salad', 'side'];

// Banner fill, tag text colour, and banner icon per category.
const TAG_STYLES = {
  cocktails: { fill: '#F6DDE3', text: '#8A3A55', icon: '🍸' },
  fish: { fill: '#DCE8EE', text: '#2F5D78', icon: '🐟' },
  meat: { fill: '#F7DDD8', text: '#9A3B32', icon: '🍗' },
  veg: { fill: '#DDEEE2', text: '#2F6B49', icon: '🌿' },
  mains: { fill: '#E8E3F1', text: '#5A4B87', icon: '🍴' },
  'breakfast/supper': { fill: '#F8EBCB', text: '#7A5A12', icon: '🥚' },
  starter: { fill: '#EFE9D8', text: '#6B6B6B', icon: '🥣' },
  salad: { fill: '#EFE9D8', text: '#6B6B6B', icon: '🥣' },
  side: { fill: '#EFE9D8', text: '#6B6B6B', icon: '🥣' },
};

const DEFAULT_TAG_STYLE = { fill: '#EFE9D8', text: '#6B6B6B', icon: '🏷️' };

function normalizeTag(tag) {
  return String(tag).toLowerCase().trim();
}

// Maps tag variants to a single category key.
function normalizeCategoryKey(tag) {
  const normalized = normalizeTag(tag);
  if (normalized === 'breakfast' || normalized === 'supper' || normalized === 'breakfast/supper') {
    return 'breakfast/supper';
  }
  return normalized;
}

function getTagStyle(tag) {
  return TAG_STYLES[normalizeCategoryKey(tag)] || DEFAULT_TAG_STYLE;
}

function getTagClass(tag) {
  const normalized = normalizeCategoryKey(tag);
  if (normalized === 'mains') return 'tag--mains';
  if (normalized === 'fish') return 'tag--fish';
  if (normalized === 'veg') return 'tag--veg';
  if (normalized === 'meat') return 'tag--meat';
  if (normalized === 'salad') return 'tag--salad';
  if (normalized === 'breakfast/supper') return 'tag--breakfast';
  if (normalized === 'cocktails') return 'tag--cocktails';
  if (normalized === 'starter') return 'tag--starter';
  if (normalized === 'side') return 'tag--side';
  return 'tag--default';
}

// Returns the recipe tag with the highest priority (the "primary" tag).
function getPrimaryTag(tags) {
  let primary = null;
  let primaryPriority = Infinity;
  for (const tag of tags) {
    const key = normalizeCategoryKey(tag);
    const index = TAG_PRIORITY.indexOf(key);
    if (index !== -1 && index < primaryPriority) {
      primaryPriority = index;
      primary = tag;
    }
  }
  return primary;
}

// Returns tags with the primary tag listed first, rest in original order.
function sortTagsWithPrimaryFirst(tags) {
  const primary = getPrimaryTag(tags);
  if (!primary) return [...tags];
  const primaryIndex = tags.indexOf(primary);
  const rest = [...tags];
  rest.splice(primaryIndex, 1);
  return [primary, ...rest];
}

export function renderRecipeCard(recipe, container) {
  const hasTiming = recipe.timing && (
    recipe.timing.totalMinutes ||
    recipe.timing.prepMinutes ||
    recipe.timing.cookMinutes
  );
  const totalTime = hasTiming
    ? recipe.timing.totalMinutes || (recipe.timing.prepMinutes || 0) + (recipe.timing.cookMinutes || 0)
    : 0;
  const timeDisplay = totalTime === 0 ? 'No cook' : `${totalTime} min`;

  const primaryTag = getPrimaryTag(recipe.tags);
  const primaryStyle = getTagStyle(primaryTag);
  const bannerFill = primaryStyle.fill;
  const bannerIcon = primaryStyle.icon;

  const sortedTags = sortTagsWithPrimaryFirst(recipe.tags);

  container.innerHTML = `
    <div class="recipe-card__banner" style="background-color: ${bannerFill};">
      <span class="recipe-card__banner-icon">${bannerIcon}</span>
    </div>
    <div class="recipe-card__content">
      <h3 class="recipe-card__title">${escapeHtml(recipe.title)}</h3>
      <div class="recipe-card__meta">
        <span class="recipe-card__time"><span class="recipe-card__clock">🕒</span> ${escapeHtml(timeDisplay)}</span>
      </div>
      <div class="recipe-card__tags">
        ${sortedTags.map((tag) => `<span class="tag ${getTagClass(tag)}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>
  `;
}
