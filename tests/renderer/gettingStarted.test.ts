import { describe, it, expect } from 'vitest';
import { GettingStarted, type OnboardingStep } from '@renderer/features/onboarding/GettingStarted';

// The renderer test env is plain `node` (no jsdom / RTL), so this is a
// render-free smoke test: the component imports cleanly, is a function with the
// expected arity, and an OnboardingStep object is shaped the way callers expect.

describe('GettingStarted', () => {
  it('is a function component', () => {
    expect(typeof GettingStarted).toBe('function');
    // ({ steps, onDismiss, lang }) — a single destructured props object.
    expect(GettingStarted.length).toBe(1);
  });
});

describe('OnboardingStep shape', () => {
  it('accepts a fully-populated step', () => {
    let clicked = 0;
    const step: OnboardingStep = {
      id: 'service',
      label: 'Set up your service',
      hint: 'Supply, earthing and connected power',
      done: false,
      onClick: () => {
        clicked += 1;
      },
    };
    expect(step.id).toBe('service');
    expect(step.label).toBe('Set up your service');
    expect(step.hint).toBe('Supply, earthing and connected power');
    expect(step.done).toBe(false);
    step.onClick?.();
    expect(clicked).toBe(1);
  });

  it('accepts a minimal step (no hint / no onClick)', () => {
    const step: OnboardingStep = { id: 'export', label: 'Export your drawings', done: true };
    expect(step.done).toBe(true);
    expect(step.hint).toBeUndefined();
    expect(step.onClick).toBeUndefined();
  });
});
