let currentSubscriber = null;
let batchDepth = 0;
const batchedEffects = [];

export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  function notify(newValue) {
    if (batchDepth > 0) {
      batchedEffects.push({ subscribers, value: newValue });
    } else {
      subscribers.forEach((fn) => fn(newValue));
    }
  }

  const sig = {
    get value() {
      if (currentSubscriber) {
        currentSubscriber.dependencies.add(sig);
        sig.subscribe(currentSubscriber.callback);
      }
      return value;
    },
    set value(newValue) {
      if (newValue !== value) {
        value = newValue;
        notify(newValue);
      }
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };

  return sig;
}

export function computed(fn) {
  let value;
  let stale = true;
  const subscribers = new Set();

  const compute = () => {
    const prevSubscriber = currentSubscriber;
    currentSubscriber = { dependencies: new Set(), callback: scheduleRecompute };
    try {
      value = fn();
    } finally {
      currentSubscriber = prevSubscriber;
    }
    stale = false;
    notify();
  };

  function scheduleRecompute() {
    if (!stale) {
      stale = true;
      if (batchDepth === 0) {
        compute();
      }
    }
  }

  function notify() {
    if (batchDepth > 0) {
      batchedEffects.push({ subscribers, value });
    } else {
      subscribers.forEach((fn) => fn(value));
    }
  }

  const computedSignal = {
    get value() {
      if (stale) compute();
      if (currentSubscriber) {
        currentSubscriber.dependencies.add(computedSignal);
        computedSignal.subscribe(currentSubscriber.callback);
      }
      return value;
    },
    set value(_) {},
    subscribe(fn) {
      if (stale) compute();
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };

  return computedSignal;
}

export function effect(fn) {
  let cleanup = null;
  let disposed = false;
  let activeDependencies = new Set();

  const run = () => {
    if (disposed) return;
    
    activeDependencies.forEach((dep) => {
      dep.subscribers?.delete?.(run);
    });
    activeDependencies.clear();

    const prevSubscriber = currentSubscriber;
    currentSubscriber = { dependencies: new Set(), callback: run };
    try {
      cleanup = fn();
    } finally {
      currentSubscriber.dependencies.forEach((dep) => {
        if (dep && typeof dep.subscribe === 'function') {
          activeDependencies.add(dep);
          dep.subscribe(run);
        }
      });
      currentSubscriber = prevSubscriber;
    }
  };

  run();

  return () => {
    disposed = true;
    activeDependencies.forEach((dep) => {
      dep.subscribers?.delete?.(run);
    });
    if (typeof cleanup === 'function') {
      cleanup();
    }
  };
}

export function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      batchedEffects.forEach(({ subscribers, value }) => {
        subscribers.forEach((fn) => fn(value));
      });
      batchedEffects.length = 0;
    }
  }
}