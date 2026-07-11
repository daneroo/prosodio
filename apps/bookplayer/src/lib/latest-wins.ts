/**
 * Latest-wins async scheduler (plan player-sync-core T2.3 follow-up; BACKLOG
 * bookplayer-epub-locator-hardening): serialize an async operation so at most
 * ONE run is ever in flight, and pending requests collapse to the newest one.
 *
 * Built for epub.js `rendition.display()`: overlapping display calls wedge
 * its internal queue (observed as locate promises that never settle while
 * follow fires 2-3 locates/sec), so callers must never have two displays in
 * flight — and when several arrive while one runs, only the newest matters:
 * the screen should end up at the LAST requested position, not replay every
 * intermediate one.
 *
 * Semantics:
 *  - request(arg) while idle: runs immediately; resolves "done" when the run
 *    settles.
 *  - request(arg) while busy: queued (queue depth 1). A newer request
 *    replaces the queued one, which resolves "superseded" — it never ran and
 *    never will; the replacing request owns the outcome.
 *  - when the in-flight run settles, the queued request (if any) runs.
 *  - a run that neither resolves nor rejects within `timeoutMs` is treated
 *    as settled (one console.warn, requester resolves "done") so a wedged
 *    run cannot freeze the scheduler forever — the newest queued request
 *    proceeds. If the zombie run settles later, that settlement is ignored.
 *  - a run that rejects propagates the rejection to ITS requester only; the
 *    scheduler itself proceeds with the queue.
 */
export type LatestWinsOutcome = "done" | "superseded";

interface PendingRequest<T> {
  arg: T;
  resolve: (outcome: LatestWinsOutcome) => void;
  reject: (error: unknown) => void;
}

export function createLatestWins<T>(
  run: (arg: T) => Promise<void>,
  timeoutMs = 5000,
): (arg: T) => Promise<LatestWinsOutcome> {
  let busy = false;
  let queued: PendingRequest<T> | null = null;

  const runNext = (): void => {
    if (!queued) {
      busy = false;
      return;
    }
    const next = queued;
    queued = null;
    execute(next);
  };

  const execute = (request: PendingRequest<T>): void => {
    busy = true;
    // One settlement per run: whichever of {resolve, reject, timeout} fires
    // first wins; a zombie run settling after its timeout is ignored.
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      settle();
      runNext();
    };
    const timer = setTimeout(() => {
      console.warn(
        `[latest-wins] run did not settle within ${timeoutMs}ms; treating as settled and proceeding`,
      );
      finish(() => request.resolve("done"));
    }, timeoutMs);
    run(request.arg).then(
      () => {
        clearTimeout(timer);
        finish(() => request.resolve("done"));
      },
      (error: unknown) => {
        clearTimeout(timer);
        finish(() => request.reject(error));
      },
    );
  };

  return (arg: T) =>
    new Promise<LatestWinsOutcome>((resolve, reject) => {
      const request: PendingRequest<T> = { arg, resolve, reject };
      if (busy) {
        queued?.resolve("superseded");
        queued = request;
      } else {
        execute(request);
      }
    });
}
