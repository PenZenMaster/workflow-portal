import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver, which Radix UI primitives
// (e.g. Select via react-use-size) require at render time.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement these pointer-capture / scroll APIs, which
// Radix UI's Select uses when a trigger is opened and an option clicked -
// needed for tests that actually interact with a Select, not just render it.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom's Blob/File do not implement text(); polyfill via FileReader,
// which jsdom does implement.
if (
  typeof Blob !== "undefined" &&
  typeof Blob.prototype.text !== "function"
) {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
