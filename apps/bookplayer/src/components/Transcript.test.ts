import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { useTranscriptLoad } from "./Transcript.tsx";

type TranscriptRequest = NonNullable<Parameters<typeof useTranscriptLoad>[1]>;
type TranscriptState = ReturnType<typeof useTranscriptLoad>;

describe("useTranscriptLoad request lifecycle", () => {
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  let dom: JSDOM;
  let requests: Array<{
    bookId: string;
    signal: AbortSignal;
    reject: (error: unknown) => void;
  }>;
  let observed: TranscriptState | undefined;

  const request: TranscriptRequest = ({ data, signal }) => {
    if (!signal) throw new Error("expected an abort signal");
    return new Promise((_resolve, reject) => {
      requests.push({ bookId: data, signal, reject });
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  };

  function Probe({ bookId }: { bookId: string }) {
    observed = useTranscriptLoad(bookId, request);
    return null;
  }

  beforeEach(() => {
    dom = new JSDOM('<main id="root"></main>', {
      url: "http://localhost",
    });
    for (const [key, value] of [
      ["window", dom.window],
      ["document", dom.window.document],
      ["navigator", dom.window.navigator],
      ["HTMLElement", dom.window.HTMLElement],
    ] as const) {
      originalGlobals.set(
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      );
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value,
      });
    }
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    requests = [];
    observed = undefined;
  });

  afterEach(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    originalGlobals.clear();
    dom.window.close();
  });

  test("book changes abort the stale transcript request", async () => {
    const container = dom.window.document.querySelector("#root")!;
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { bookId: "book-one" }));
    });
    const staleRequest = requests[0]!;
    expect(staleRequest.bookId).toBe("book-one");
    expect(staleRequest.signal.aborted).toBeFalse();

    await act(async () => {
      root.render(createElement(Probe, { bookId: "book-two" }));
    });
    expect(staleRequest.signal.aborted).toBeTrue();
    expect(requests[1]!.bookId).toBe("book-two");
    expect(requests[1]!.signal.aborted).toBeFalse();
    expect(observed?.status).toBe("loading");

    await act(async () => root.unmount());
  });

  test("AbortError is not presented as a transcript failure", async () => {
    const container = dom.window.document.querySelector("#root")!;
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { bookId: "book-one" }));
    });
    await act(async () => {
      requests[0]!.reject(new DOMException("aborted", "AbortError"));
    });
    expect(observed?.status).toBe("loading");

    await act(async () => root.unmount());
    expect(requests[0]!.signal.aborted).toBeTrue();
  });
});
