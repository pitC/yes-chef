import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderServingsStepper } from '../js/components/servings-stepper.js';

describe('servings stepper component', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('default value = baseServings (2)', () => {
    const onChange = vi.fn();
    renderServingsStepper(2, onChange, container);
    
    const valueDisplay = container.querySelector('.stepper-value');
    expect(valueDisplay.textContent).toBe('2');
  });

  it('min 1, max 20', () => {
    const onChange = vi.fn();
    renderServingsStepper(2, onChange, container);
    
    const decrementBtn = container.querySelector('.stepper-decrement');
    const incrementBtn = container.querySelector('.stepper-increment');
    
    for (let i = 0; i < 5; i++) {
      decrementBtn.click();
    }
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(decrementBtn.disabled).toBe(true);
    
    for (let i = 0; i < 25; i++) {
      incrementBtn.click();
    }
    expect(onChange).toHaveBeenLastCalledWith(20);
    expect(incrementBtn.disabled).toBe(true);
  });

  it('onChange(newValue) called on click', () => {
    const onChange = vi.fn();
    renderServingsStepper(2, onChange, container);
    
    const incrementBtn = container.querySelector('.stepper-increment');
    incrementBtn.click();
    
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('disables - at 1, + at 20', () => {
    const onChange = vi.fn();
    renderServingsStepper(1, onChange, container);
    
    let decrementBtn = container.querySelector('.stepper-decrement');
    let incrementBtn = container.querySelector('.stepper-increment');
    
    expect(decrementBtn.disabled).toBe(true);
    expect(incrementBtn.disabled).toBe(false);
    
    container.innerHTML = '';
    renderServingsStepper(20, onChange, container);
    decrementBtn = container.querySelector('.stepper-decrement');
    incrementBtn = container.querySelector('.stepper-increment');
    
    expect(decrementBtn.disabled).toBe(false);
    expect(incrementBtn.disabled).toBe(true);
  });

  it('keyboard accessible (Enter/Space)', () => {
    const onChange = vi.fn();
    renderServingsStepper(2, onChange, container);
    
    const incrementBtn = container.querySelector('.stepper-increment');
    incrementBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    incrementBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});