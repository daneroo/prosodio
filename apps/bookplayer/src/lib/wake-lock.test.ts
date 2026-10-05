import { describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { createWakeLock, useWakeLock } from "./wake-lock.ts";

/** A fake sentinel; `hide()` mimics the browser releasing it on page hide. */
class FakeSentinel {
  released = false;
  private listeners: Array<() => void> = [];
  addEventListener(_type: "release", listener: () => void) {
    this.listeners.push(listener);
  }
  release(): Promise<void> {
    this.hide();
    return Promise.resolve();
  }
  hide() {
    if (this.released) return;
    this.released = true;
    for (const listener of this.listeners) listener();
  }
}

/**
 * `needsActivation` mimics iPadOS: a request without user activation is
 * refused; `tap()` is the activation.
 */
function fakes({
  visible = true,
  needsActivation = false,
}: { visible?: boolean; needsActivation?: boolean } = {}) {
  const sentinels: Array<FakeSentinel> = [];
  const pending: Array<(s: FakeSentinel) => void> = [];
  let holding = false;
  let isVisible = visible;
  let activated = false;
  const listeners = new Set<() => void>();
  const activationListeners = new Set<() => void>();
  return {
    sentinels,
    wakeLock: {
      request(_type: "screen") {
        if (needsActivation && !activated) {
          return Promise.reject(new Error("NotAllowedError"));
        }
        if (holding) {
          return new Promise<FakeSentinel>((resolve) => {
            pending.push((s) => {
              sentinels.push(s);
              resolve(s);
            });
          });
        }
        const sentinel = new FakeSentinel();
        sentinels.push(sentinel);
        return Promise.resolve(sentinel);
      },
    },
    visibility: {
      isVisible: () => isVisible,
      onChange(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    onActivation(listener: () => void) {
      activationListeners.add(listener);
      return () => activationListeners.delete(listener);
    },
    /** Subsequent requests stay pending until `settle()`. */
    holdRequests() {
      holding = true;
    },
    settle() {
      pending.shift()!(new FakeSentinel());
    },
    /** The page changes visibility; hiding releases the held sentinel. */
    setVisible(next: boolean) {
      isVisible = next;
      if (!next) for (const s of sentinels) s.hide();
      for (const listener of [...listeners]) listener();
    },
    /** A user tap: activation lasts while its listeners run. */
    tap() {
      activated = true;
      for (const listener of [...activationListeners]) listener();
      activated = false;
    },
    listenerCount: () => listeners.size + activationListeners.size,
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("wake lock controller", () => {
  test("requests on start when the page is visible", async () => {
    const f = fakes();
    createWakeLock(f).start();
    await flush();
    expect(f.sentinels).toHaveLength(1);
    expect(f.sentinels[0]!.released).toBeFalse();
  });

  test("does not request while the page is hidden", async () => {
    const f = fakes({ visible: false });
    createWakeLock(f).start();
    await flush();
    expect(f.sentinels).toHaveLength(0);
  });

  test("requests again when the page becomes visible", async () => {
    const f = fakes();
    createWakeLock(f).start();
    await flush();

    f.setVisible(false);
    await flush();
    expect(f.sentinels[0]!.released).toBeTrue();

    f.setVisible(true);
    await flush();
    expect(f.sentinels).toHaveLength(2);
    expect(f.sentinels[1]!.released).toBeFalse();
  });

  test("a repeated visible event does not request twice", async () => {
    const f = fakes();
    createWakeLock(f).start();
    await flush();
    f.setVisible(true);
    f.setVisible(true);
    await flush();
    expect(f.sentinels).toHaveLength(1);
  });

  test("releases on stop and stops listening", async () => {
    const f = fakes();
    const lock = createWakeLock(f);
    lock.start();
    await flush();

    lock.stop();
    expect(f.sentinels[0]!.released).toBeTrue();
    expect(f.listenerCount()).toBe(0);

    f.setVisible(false);
    f.setVisible(true);
    await flush();
    expect(f.sentinels).toHaveLength(1);
  });

  test("a stop while the request is pending releases it once granted", async () => {
    const f = fakes();
    f.holdRequests();
    const lock = createWakeLock(f);
    lock.start();
    lock.stop();
    f.settle();
    await flush();
    expect(f.sentinels).toHaveLength(1);
    expect(f.sentinels[0]!.released).toBeTrue();
  });

  test("does not double-request while a request is pending", async () => {
    const f = fakes();
    f.holdRequests();
    createWakeLock(f).start();
    f.setVisible(true);
    f.setVisible(true);
    f.settle();
    await flush();
    expect(f.sentinels).toHaveLength(1);
  });

  test("a rejected request is swallowed", async () => {
    const f = fakes();
    const lock = createWakeLock({
      ...f,
      wakeLock: { request: () => Promise.reject(new Error("NotAllowedError")) },
    });
    lock.start();
    await flush();
    lock.stop();
  });

  test("a request refused for want of user activation is retried on the next tap", async () => {
    const f = fakes({ needsActivation: true });
    createWakeLock(f).start();
    await flush();
    expect(f.sentinels).toHaveLength(0);

    f.tap();
    await flush();
    expect(f.sentinels).toHaveLength(1);
    expect(f.sentinels[0]!.released).toBeFalse();
  });

  test("returning to the page without a tap is refused; the next tap re-acquires", async () => {
    const f = fakes({ needsActivation: true });
    createWakeLock(f).start();
    await flush();
    f.tap();
    await flush();

    f.setVisible(false);
    f.setVisible(true);
    await flush();
    expect(f.sentinels).toHaveLength(1);
    expect(f.sentinels[0]!.released).toBeTrue();

    f.tap();
    await flush();
    expect(f.sentinels).toHaveLength(2);
    expect(f.sentinels[1]!.released).toBeFalse();
  });

  test("a tap while the lock is held does not request again", async () => {
    const f = fakes();
    createWakeLock(f).start();
    await flush();
    f.tap();
    f.tap();
    await flush();
    expect(f.sentinels).toHaveLength(1);
  });

  test("does nothing without the API", async () => {
    const f = fakes();
    const lock = createWakeLock({
      wakeLock: undefined,
      visibility: f.visibility,
      onActivation: f.onActivation,
    });
    expect(() => {
      lock.start();
      f.setVisible(false);
      f.setVisible(true);
      lock.stop();
    }).not.toThrow();
    await flush();
  });
});

describe("useWakeLock", () => {
  const globals = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;

  test("holds the lock while mounted and releases on unmount", async () => {
    const dom = new JSDOM('<main id="root"></main>', {
      url: "http://localhost",
    });
    const values = {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const key of globals) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: values[key],
      });
    }
    try {
      const f = fakes();
      const deps = {
        wakeLock: f.wakeLock,
        visibility: f.visibility,
        onActivation: f.onActivation,
      };
      function Probe() {
        useWakeLock(deps);
        return null;
      }
      const root = createRoot(dom.window.document.querySelector("#root")!);

      await act(async () => root.render(createElement(Probe)));
      expect(f.sentinels).toHaveLength(1);
      expect(f.sentinels[0]!.released).toBeFalse();

      await act(async () => root.unmount());
      expect(f.sentinels[0]!.released).toBeTrue();
    } finally {
      for (const key of globals) Reflect.deleteProperty(globalThis, key);
      dom.window.close();
    }
  });
});
