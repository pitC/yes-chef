export function renderCookingStep(step, ingredients, { isDone, isTimerRunning = false, onToggleDone, onStartTimer }, container) {
  const ingredientsMap = ingredients instanceof Map ? ingredients : new Map(ingredients.map((ing) => [ing.id, ing]));
  function highlight(text) {
    return text.replace(/\[([^\]]+)\]/g, '<span class="ingredient-highlight">$1</span>');
  }
  function getTitle(s) {
    if (s.title) return s.title;
    if (s.timer?.label) return s.timer.label;
    const plain = s.text.replace(/\[([^\]]+)\]/g, '$1').split(/[.!]/)[0].trim();
    const words = plain.split(/\s+/).slice(0, 5).join(' ');
    return words.length < plain.length ? `${words}…` : words;
  }
  const title = getTitle(step);

  const disabled = isDone || isTimerRunning ? 'disabled' : '';
  const timerHtml = step.timer
    ? `<button class="start-timer-btn btn ${isTimerRunning ? 'btn--secondary' : 'btn--primary'}" ${disabled} style="margin-top:10px; font-size:0.9rem; padding:6px 12px;">⏱ ${step.timer.label} · ${Math.floor(step.timer.durationSeconds / 60)}:${String(step.timer.durationSeconds % 60).padStart(2, '0')}</button>`
    : '';

  const sizingHtml = step.ingredientRefs
    .map((ref) => {
      const ing = ingredientsMap.get(ref);
      if (!ing) return '';
      const notes = ing.notes ? ` <span style="opacity:0.7;">${ing.notes}</span>` : '';
      return `<div class="cooking-step__ingredient-row" style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; padding:2px 0;">`
        + `<span>${ing.name}</span>`
        + `<span style="font-variant-numeric:tabular-nums; white-space:nowrap;">${ing.amount} ${ing.unit}${notes}</span>`
        + `</div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="cooking-step__grid">
      <label class="cooking-step__check" style="cursor:pointer; display:flex; align-items:center;">
        <input type="checkbox" class="step-done-checkbox" ${isDone ? 'checked' : ''} aria-label="Mark step as done" style="width:20px; height:20px; accent-color:var(--color-primary); cursor:pointer;" />
      </label>
      <span class="cooking-step__number" data-order="${step.order}" data-title="${title.replace(/"/g, '&quot;')}" style="font-weight:700; color:var(--color-text-secondary); font-size:0.85rem;">Step ${step.order} · ${title}${isDone ? ' · ✓ Done' : ''}</span>
      <div class="cooking-step__text" style="line-height:1.65; font-size:1.02rem; color:var(--color-text);">${highlight(step.text)}</div>
      ${sizingHtml ? `<div class="cooking-step__ingredients-meta" style="font-size:0.82rem; color:var(--color-text-secondary); display:flex; flex-direction:column; gap:2px; border-top:1px dashed var(--color-border); padding-top:6px; margin-top:8px;">${sizingHtml}</div>` : ''}
      <div class="step-timer" style="margin-top:6px;">${timerHtml}</div>
    </div>
  `;
  container.style.position = 'relative';

  const checkbox = container.querySelector('.step-done-checkbox');
  checkbox.addEventListener('change', () => {
    onToggleDone(step.id);
  });

  const timerBtn = container.querySelector('.start-timer-btn');
  if (timerBtn) {
    timerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onStartTimer(step.id, step.timer.durationSeconds, step.timer.label);
    });
  }
}
