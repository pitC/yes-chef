export function renderServingsStepper(baseServings, onChange, container) {
  let value = baseServings;

  container.innerHTML = `
    <div class="servings-stepper">
      <button class="servings-stepper__btn stepper-decrement" aria-label="Decrease servings">−</button>
      <span class="servings-stepper__value stepper-value" aria-live="polite">${value}</span>
      <button class="servings-stepper__btn stepper-increment" aria-label="Increase servings">+</button>
    </div>
  `;

  const decrementBtn = container.querySelector('.stepper-decrement');
  const incrementBtn = container.querySelector('.stepper-increment');
  const valueDisplay = container.querySelector('.stepper-value');

  function updateButtons() {
    decrementBtn.disabled = value <= 1;
    incrementBtn.disabled = value >= 20;
  }

  function handleChange(newValue) {
    value = Math.max(1, Math.min(20, newValue));
    valueDisplay.textContent = value;
    updateButtons();
    onChange(value);
  }

  decrementBtn.addEventListener('click', () => handleChange(value - 1));
  incrementBtn.addEventListener('click', () => handleChange(value + 1));

  [decrementBtn, incrementBtn].forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  updateButtons();
}
