// The feature modules attach their listeners to window and document and never
// take them off. In a browser nothing ever needed them to — the page is thrown
// away on navigation. In a test file the page is not: every previous test's
// handlers are still live, still holding their own copy of the frame-coalescing
// flag and their own detached elements, and they answer the next test's events
// too.
//
// So each test gets a clean pair of shared targets. This isolates the tests
// from each other; it is not a claim about the modules, which are each
// initialised exactly once per page load.

import { vi } from 'vitest';

export function isolateListeners(targets = [window, document]) {
  const attached = [];

  // Bound up front, and bound to the target rather than lifted off
  // EventTarget.prototype: jsdom brands its wrappers, so a prototype method
  // called on the window it belongs to is still rejected as "not a valid
  // instance of EventTarget". Holding the pair here also means the cleanup
  // works after vi.restoreAllMocks has taken the spy back off.
  const originals = targets.map((target) => ({
    target,
    add: target.addEventListener.bind(target),
    remove: target.removeEventListener.bind(target),
  }));

  for (const { target, add } of originals) {
    vi.spyOn(target, 'addEventListener').mockImplementation((type, handler, options) => {
      attached.push([target, type, handler, options]);
      add(type, handler, options);
    });
  }

  return () => {
    for (const [target, type, handler, options] of attached) {
      originals.find((o) => o.target === target).remove(type, handler, options);
    }
    attached.length = 0;
  };
}
