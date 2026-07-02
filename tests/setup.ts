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
