/**
 * happy-dom has no layout, so every element measures 0 px and the
 * virtualizer would render nothing. These helpers give divs a phone-sized
 * box for a test and restore the prototype afterwards. happy-dom builds
 * element classes per window, so the stub goes on the prototype the divs
 * actually use.
 */
const SIZES = { clientHeight: 800, clientWidth: 400, offsetHeight: 72, offsetWidth: 400 };

/** Stubs div sizes; returns a function that restores them. */
export function stubDivLayout(): () => void {
  const divPrototype = Object.getPrototypeOf(document.createElement('div')) as object;
  const saved = Object.fromEntries(
    Object.keys(SIZES).map((name) => [name, Object.getOwnPropertyDescriptor(divPrototype, name)]),
  );
  for (const [name, value] of Object.entries(SIZES)) {
    Object.defineProperty(divPrototype, name, { configurable: true, get: () => value });
  }
  return () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(divPrototype, name);
      } else {
        Object.defineProperty(divPrototype, name, descriptor);
      }
    }
  };
}
