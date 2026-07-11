import { describe, expect, test } from "bun:test";
import { createLatestWins } from "./latest-wins.ts";

/** A promise settled from outside — the "run" whose timing each test owns. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush the microtask queue so settled promises propagate. */
const tick = () => new Promise<void>((res) => setTimeout(res, 0));

describe("createLatestWins", () => {
  test("idle request runs immediately and resolves done", async () => {
    const ran: string[] = [];
    const request = createLatestWins<string>((arg) => {
      ran.push(arg);
      return Promise.resolve();
    });

    await expect(request("a")).resolves.toBe("done");
    expect(ran).toEqual(["a"]);
  });

  test("serialization: a second request never starts until the first settles", async () => {
    const gates = [deferred(), deferred()];
    const started: string[] = [];
    let runIndex = 0;
    const request = createLatestWins<string>((arg) => {
      started.push(arg);
      return gates[runIndex++]!.promise;
    });

    const first = request("a");
    const second = request("b");
    await tick();
    expect(started).toEqual(["a"]); // b waits

    gates[0]!.resolve();
    await tick();
    expect(started).toEqual(["a", "b"]); // b started only after a settled
    await expect(first).resolves.toBe("done");

    gates[1]!.resolve();
    await expect(second).resolves.toBe("done");
  });

  test("supersession: a newer request replaces the queued one, which resolves superseded and never runs", async () => {
    const gates = [deferred(), deferred()];
    const started: string[] = [];
    let runIndex = 0;
    const request = createLatestWins<string>((arg) => {
      started.push(arg);
      return gates[runIndex++]!.promise;
    });

    const first = request("a");
    const second = request("b"); // queued
    const third = request("c"); // replaces b

    await expect(second).resolves.toBe("superseded");
    expect(started).toEqual(["a"]);

    gates[0]!.resolve();
    await tick();
    expect(started).toEqual(["a", "c"]); // b was skipped entirely
    await expect(first).resolves.toBe("done");

    gates[1]!.resolve();
    await expect(third).resolves.toBe("done");
  });

  test("timeout self-heal: a run that never settles resolves done after timeoutMs and the queued request proceeds", async () => {
    const started: string[] = [];
    let hang = true;
    const request = createLatestWins<string>((arg) => {
      started.push(arg);
      if (hang) return new Promise<void>(() => {}); // never settles
      return Promise.resolve();
    }, 20);

    const wedged = request("a");
    hang = false;
    const queued = request("b");

    await expect(wedged).resolves.toBe("done"); // self-healed at 20ms
    await expect(queued).resolves.toBe("done");
    expect(started).toEqual(["a", "b"]);
  });

  test("a zombie run settling after its timeout is ignored (no double settlement, queue not re-run)", async () => {
    const gate = deferred();
    const started: string[] = [];
    let first = true;
    const request = createLatestWins<string>((arg) => {
      started.push(arg);
      if (first) {
        first = false;
        return gate.promise; // outlives its timeout
      }
      return Promise.resolve();
    }, 20);

    const wedged = request("a");
    await expect(wedged).resolves.toBe("done"); // timed out

    gate.resolve(); // zombie settles late
    await tick();

    // Scheduler is idle again and healthy: a new request runs normally.
    await expect(request("b")).resolves.toBe("done");
    expect(started).toEqual(["a", "b"]);
  });

  test("rejection propagates to its own requester and the queue proceeds", async () => {
    const gates = [deferred(), deferred()];
    let runIndex = 0;
    const request = createLatestWins<string>(() => gates[runIndex++]!.promise);

    const first = request("a");
    const second = request("b");

    gates[0]!.reject(new Error("display blew up"));
    await expect(first).rejects.toThrow("display blew up");

    gates[1]!.resolve();
    await expect(second).resolves.toBe("done");
  });
});
