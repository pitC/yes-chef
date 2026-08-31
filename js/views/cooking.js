import { getRecipe } from '../data/recipes.js';
import { navigate } from '../router.js';
import { signal, effect } from '../signals.js';
import { renderCookingStep } from '../components/cooking-step.js';
import { renderTimerTray } from '../components/timer-tray.js';
import { timerManager } from '../timers/manager.js';
import { scheduleNotification } from '../timers/sw-messaging.js';

export const doneSteps = signal(new Set());
export const activeStepId = signal(null);
export const prepChecked = signal(new Set());

function loadDoneSteps() {
  const stored = sessionStorage.getItem('doneSteps');
  if (stored) {
    doneSteps.value = new Set(JSON.parse(stored));
  }
}

function saveDoneSteps() {
  if (doneSteps.value.size === 0) {
    sessionStorage.removeItem('doneSteps');
  } else {
    sessionStorage.setItem('doneSteps', JSON.stringify(Array.from(doneSteps.value)));
  }
}

function loadPrepChecked() {
  const stored = sessionStorage.getItem('prepChecked');
  if (stored) {
    prepChecked.value = new Set(JSON.parse(stored));
  }
}

function savePrepChecked() {
  if (prepChecked.value.size === 0) {
    sessionStorage.removeItem('prepChecked');
  } else {
    sessionStorage.setItem('prepChecked', JSON.stringify(Array.from(prepChecked.value)));
  }
}

export async function renderCookingView(params, container) {
  if (!container) container = document.getElementById('app') || document.body;
  const recipe = await getRecipe(params.id);
  if (!recipe) {
    container.innerHTML = '<div class="error-state">Recipe not found</div>';
    return;
  }

  loadDoneSteps();
  loadPrepChecked();

  let observer = null;
  const cleanups = [];
  
  function render() {
    container.innerHTML = `
      <div class="cooking-mode">
        <header class="cooking-mode__header">
          <button class="exit-cooking-btn btn btn--secondary" aria-label="Exit cooking mode">✕ Exit</button>
          <h1>${recipe.title}</h1>
        </header>
        <div class="cooking-mode__steps cooking-steps" style="scroll-snap-type: y mandatory;">
          <div class="cooking-step cooking-step--prep" data-step-id="__prep__" style="scroll-snap-align: start;">
            <div class="cooking-step__grid">
              <span class="cooking-step__number" style="font-weight:700; color:var(--color-text-secondary); font-size:0.85rem;">Step 0 · Preparation</span>
              <div class="cooking-step__text" style="line-height:1.65; font-size:1.02rem; color:var(--color-text);">Check that you have everything in place before you start.</div>
              <ul class="prep-checklist" style="list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px; grid-column: 1 / -1;">
                ${recipe.ingredients.map(ing => {
                  const isChecked = prepChecked.value.has(ing.id);
                  const notes = ing.notes ? ` <span style="opacity:0.7;">${ing.notes}</span>` : '';
                  return `<li style="display:flex; align-items:center; gap:8px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                      <input type="checkbox" class="prep-checkbox" data-ing-id="${ing.id}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--color-primary);" />
                      <span style="${isChecked ? 'text-decoration:line-through; opacity:0.6;' : ''}">${ing.name} · ${ing.amount} ${ing.unit}${notes}</span>
                    </label>
                  </li>`;
                }).join('')}
              </ul>
            </div>
          </div>
          ${recipe.steps.map(step => `
            <div class="cooking-step" data-step-id="${step.id}" style="scroll-snap-align: start;"></div>
          `).join('')}
        </div>
        <div class="timer-tray-container" style="position:relative; z-index:300;"></div>
      </div>
    `;

    const stepsContainer = container.querySelector('.cooking-mode__steps');
    const stepElements = stepsContainer.querySelectorAll('.cooking-step[data-step-id^="step_"]');
    const prepElement = stepsContainer.querySelector('.cooking-step--prep');
    if (prepElement) {
      prepElement.querySelectorAll('.prep-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const ingId = cb.dataset.ingId;
          const next = new Set(prepChecked.value);
          if (cb.checked) next.add(ingId);
          else next.delete(ingId);
          prepChecked.value = next;
        });
      });
    }
    
    const ingredientsMap = new Map(recipe.ingredients.map(ing => [ing.id, ing]));
    
    stepElements.forEach((el, index) => {
      const step = recipe.steps[index];
      const isDone = doneSteps.value.has(step.id);
      const isActive = activeStepId.value === step.id;
      const existingTimer = timerManager.getTimer(step.id);
      const isTimerRunning = Boolean(existingTimer?.running && !existingTimer?.done);

      renderCookingStep(step, ingredientsMap, {
        isActive,
        isDone,
        isTimerRunning,
        onToggleDone: (stepId) => {
          const newDone = new Set(doneSteps.value);
          const wasDone = newDone.has(stepId);
          if (wasDone) {
            newDone.delete(stepId);
          } else {
            newDone.add(stepId);
          }
          doneSteps.value = newDone;
        },
        onStartTimer: (stepId, duration, label) => {
          timerManager.startTimer({ id: stepId, label, durationSeconds: duration });
          scheduleNotification(stepId, label, duration * 1000).catch(() => {});
        },
      }, el);
    });
    
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activeStepId.value = entry.target.dataset.stepId;
        }
      });
    }, { root: stepsContainer, threshold: 0.5 });
    
    stepElements.forEach(el => observer.observe(el));
    
    const exitBtn = container.querySelector('.exit-cooking-btn');
    exitBtn.addEventListener('click', () => {
      sessionStorage.removeItem('doneSteps');
      sessionStorage.removeItem('prepChecked');
      doneSteps.value = new Set();
      prepChecked.value = new Set();
      if (observer) observer.disconnect();
      navigate(`/recipe/${recipe.id}`);
    });

    const trayContainer = container.querySelector('.timer-tray-container');
    if (trayContainer) {
      const trayCleanup = renderTimerTray(
        timerManager.getAllTimers(),
        {
          onDismiss: (id) => timerManager.dismissTimer(id),
          onPause: (id) => timerManager.pauseTimer(id),
          onResume: (id) => timerManager.resumeTimer(id),
        },
        trayContainer,
      );
      cleanups.push(trayCleanup);
    }
  }
  
  const refreshDoneActive = effect(() => {
    if (!container) return;
    const stepsContainer = container.querySelector('.cooking-mode__steps');
    if (!stepsContainer) return;
    const stepElements = stepsContainer.querySelectorAll('.cooking-step:not(.cooking-step--prep)');
    stepElements.forEach((el) => {
      const stepId = el.dataset.stepId;
      const isDone = doneSteps.value.has(stepId);
      const isActive = activeStepId.value === stepId;

      el.classList.toggle('done', isDone);
      el.classList.toggle('active', isActive);

      // collapse to save space - hide body, keep header
      const text = el.querySelector('.cooking-step__text');
      const meta = el.querySelector('.cooking-step__ingredients-meta');
      const timer = el.querySelector('.step-timer');
      const num = el.querySelector('.cooking-step__number');
      if (text) text.style.display = isDone ? 'none' : '';
      if (meta) meta.style.display = isDone ? 'none' : '';
      if (timer) timer.style.display = isDone ? 'none' : '';
      if (num?.dataset.order) {
        const title = num.dataset.title;
        num.textContent = `Step ${num.dataset.order} · ${title}${isDone ? ' · ✓ Done' : ''}`;
      }

      if (isDone) {
        el.style.opacity = '0.6';
        el.style.borderLeft = '4px solid green';
        el.style.paddingTop = '10px';
        el.style.paddingBottom = '10px';
      } else {
        el.style.opacity = '';
        el.style.borderLeft = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
      }

      if (isActive) {
        el.style.borderLeft = '4px solid green';
      }
    });
  });
  cleanups.push(refreshDoneActive);

  const persist = effect(() => {
    // track doneSteps to persist
    void doneSteps.value;
    saveDoneSteps();
  });
  cleanups.push(persist);

  const persistPrep = effect(() => {
    void prepChecked.value;
    savePrepChecked();
  });
  cleanups.push(persistPrep);

  const refreshPrep = effect(() => {
    void prepChecked.value;
    if (!container) return;
    const prepEl = container.querySelector('.cooking-step--prep');
    if (!prepEl) return;
    prepEl.querySelectorAll('.prep-checkbox').forEach(cb => {
      const ingId = cb.dataset.ingId;
      const checked = prepChecked.value.has(ingId);
      cb.checked = checked;
      const labelSpan = cb.nextElementSibling;
      if (labelSpan) {
        labelSpan.style.textDecoration = checked ? 'line-through' : '';
        labelSpan.style.opacity = checked ? '0.6' : '';
      }
    });
    // optional done styling when all checked
    const allChecked = recipe.ingredients.every(ing => prepChecked.value.has(ing.id));
    prepEl.classList.toggle('done', allChecked);
    if (allChecked) {
      prepEl.style.opacity = '0.6';
    } else {
      prepEl.style.opacity = '';
    }
  });
  cleanups.push(refreshPrep);

  const refreshTimers = effect(() => {
    void timerManager.getAllTimers().value;
    if (!container) return;
    const steps = container.querySelectorAll('.cooking-step');
    steps.forEach((el) => {
      const id = el.dataset.stepId;
      const t = timerManager.getTimer(id);
      const btn = el.querySelector('.start-timer-btn');
      if (btn) btn.disabled = Boolean(t?.running && !t?.done);
    });
  });
  cleanups.push(refreshTimers);

  render();

  return () => {
    if (observer) observer.disconnect();
    cleanups.forEach((fn) => {
      if (typeof fn === 'function') fn();
    });
  };
}