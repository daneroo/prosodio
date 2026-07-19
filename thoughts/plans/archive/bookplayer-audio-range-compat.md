# bookplayer-audio-range-compat — exact ranges without dev OOM

Status: Done — accepted 2026-07-18 under revised scope.

The Review reset superseded the original detailed execution plan. R0–R2 were
completed. Final acceptance was a 50-book development burn-in without OOM,
Brave/iPad ad-hoc playback, and green CI.

Production/runtime parity was not completed under this plan. It moved to BACKLOG
`bookplayer-runtime-parity`, including built alignment serving and explicit
Node/Bun validation. Sections from **Scheduling and dispatch** onward are the
superseded experiment record; their unchecked items are historical proposals,
not outstanding work.

Goal: honor every satisfiable browser-requested audio byte range exactly while
keeping raw-file delivery bounded, cancellation-safe, and RSS-stable in the real
development and production server stacks.

## Review reset — controlling decisions

Review and simplification replaced the earlier execution plan and its 16 MiB
tuning target. The detailed material below remains only as an experiment record.

Keep the final objective small:

- honor browser-requested audio ranges exactly so large books work on iPad;
- do not crash or OOM during representative development or production use;
- observe memory coarsely enough to expose catastrophic or continuing growth;
- prefer understandable code over optimizing allocator noise.

Review decisions recorded so far:

- Remove the exact 16 MiB warmed-RSS acceptance threshold. It was a diagnostic
  guardrail, not a product requirement, and drove unjustified tuning.
- Keep `scripts/burn-in.ts` as the only durable burn-in artifact. It should stay
  an understandable book-sampling tool, not become an E2E framework.
- Make the memory route usable in both development and production so burn-in can
  sample RSS after every book and report simple minimum, maximum, range, and
  final values during the run and at completion.
- Presume the hard/in-app navigation modes and endpoint-selection matrix should
  be removed unless the remaining review identifies a concrete ongoing use.
- Remove `analyze-burn-in.ts`, `burn-in-analysis.ts`, their tests, and
  `burn-in.test.ts`. We do not want to maintain tests for this temporary tuning
  harness.
- Delete the ignored `data/bookplayer/evidence/audio-range-compat/` experiment
  output when simplification is executed. Its conclusions are recorded here; the
  raw evidence is not a maintained project artifact.
- Preserve only focused product tests: exact HTTP range behavior and any small
  transport lifecycle test required to prevent the original OOM failure.

## Review execution checklist

Execute in this order. The working burn-in is the regression guard while the
asset server is simplified; do not begin asset changes before R0 passes.

### R0 — establish the simple regression guard `[coding, tier: low]`

- [x] Preserve these normal commands and their current defaults:
      `bun run scripts/burn-in`, `bun run scripts/burn-in --no-mute`, and
      `bun run scripts/burn-in --play-time 30000`.
- [x] With the current working asset implementation unchanged, run burn-in and
      confirm it still visits books, exercises playback/seeking, reports useful
      per-book results, and completes normally.
- [x] Make the existing memory route available in both development and
      production, returning only uncached RSS bytes. The normal burn-in command
      should use that route automatically—no memory URL or PID option required.
- [x] Simplify `burn-in.ts` so it samples RSS after every book and reports only
      understandable minimum, maximum, range, and final RSS during the run and
      at completion. It must not require a second analysis command or evidence
      file.
- [x] Remove navigation and endpoint-selection modes unless a concrete behavior
      required by the normal commands proves they are necessary.
- [x] Run the normal command and focused short checks of `--no-mute` and
      `--play-time 30000`. Do not remove the old analyzer machinery until this
      replacement is visibly working.

Automated R0 checks used the user-owned standard development server without
altering asset delivery. One-book samples of normal playback, `--no-mute`, and
the full `--play-time 30000` all played from the middle, reported healthy media
state, completed with zero errors, and printed baseline, per-book, and final RSS
summaries. Daniel then accepted R0 after a normal five-book interactive run
completed and remained usable. It reported RSS final 1100.5 MiB, minimum 1081.2
MiB, maximum 1100.5 MiB, and range 19.3 MiB. Its 24 observed errors were mostly
known missing font/resources and do not block this burn-in simplification.

### R1 — remove the completed experiment `[coding, tier: low]`

- [x] Delete `analyze-burn-in.ts`, `burn-in-analysis.ts`, their tests, and
      `burn-in.test.ts`; remove their package references and dead types/options.
- [x] Delete the ignored `data/bookplayer/evidence/audio-range-compat/`
      directory. Do not replace it with another maintained evidence format.
- [x] Run `bun run ci` and commit the small, self-contained burn-in before
      changing asset delivery.

R1 removed 687 maintained lines and 23 ignored experiment files (6.7 MiB). Full
CI passed with 565 tests and no failures; asset delivery remained unchanged.

### R2 — review and simplify asset delivery `[coding only after approval]`

- [x] Write a short durable asset-serving document: URL scheme, code ownership,
      and the current development and production paths. Use it as the design
      constraint; if the implementation cannot be explained briefly, simplify
      it.
- [x] Verify the specific Vite/Nitro limitation claimed to require a separate
      development audio middleware. Do not preserve the split on experiment
      history alone.
- [x] Decide whether one audio-serving path can work in development and
      production.
- [x] Remove the development override unless it is demonstrably necessary.
- [x] No override remains: development and production use the Nitro audio
      handler and native Bun file slices.
- [x] Simplify the remaining asset code and tests one piece at a time. After
      each change, use the working burn-in and its coarse RSS summary; require
      no exact MiB ceiling.
- [x] Finalize the document to describe only the accepted implementation and its
      invariants. Archive plans are experiment records to harvest and then
      delete, not permanent system documentation.
- [x] Stop when the smallest understandable implementation honors exact ranges,
      plays large books, survives representative switching without OOM/restart,
      and shows no obvious continuing or file-size-proportional RSS growth.

R2 replaced the 664-line development middleware/test pair with Nitro's `self`
runner and one native Bun audio path. The default worker path was re-tested on
the same five books: RSS rose from 517.8 MiB to 1880.6 MiB. The accepted path
played the same books, applied a live server edit without restart, and completed
a warmed 20-book run at 673.0 MiB final, 545.0 MiB minimum, 682.1 MiB maximum,
and 137.0 MiB range. Removing the 32-entry BunFile cache did not cause
catastrophic or file-sized growth.

### R3 — acceptance and close

- [x] Daniel accepted ad-hoc Brave/iPad playback of the previously failing large
      book. The more prescriptive experiment checklist below was superseded.
- [x] Complete a 50-book development burn-in without OOM and run `bun run ci`.
      Production validation moved to `bookplayer-runtime-parity` after the built
      alignment route was found broken.
- [x] Update the backlog, harvest durable asset-serving documentation, archive
      this reconciled plan, and merge after Daniel approves the reviewed source.

## Scheduling and dispatch

> **Superseded experiment record.** The Review reset replaced the scheduling,
> exact memory thresholds, and execution matrix below. Checked items record work
> actually performed; unchecked items were abandoned or moved, not left
> outstanding.

This plan starts only after Daniel finishes testing the current 4000 MiB
workaround and explicitly asks to execute it on a branch. Until then, do not
alter, remove, commit around, or otherwise disturb that workaround.

At execution Daniel will provide this directive:

> For all coding tasks use your judgement to decide an appropriate lower power
> model and run that in a subagent.

Apply it to every task marked `[coding]`: the orchestrator writes the bounded
subtask prompt, chooses an appropriate lower-power model and effort, delegates
the implementation, reviews the result and diff, runs the required verification,
and commits only with `bun run ci` green. Prefer one small commit per coding
task. Investigation, acceptance runs, manual handoff, and plan maintenance stay
with the orchestrator unless delegation is clearly useful.

## Established evidence

- Bookplayer uses a native hidden `<audio>` with `/api/audio/:bookId`; React
  owns controls and synchronization but the browser owns media requests and
  byte-range selection.
- The original server shortened every broad satisfiable range to at most 1 MiB.
  Chromium burn-in passed, but large M4B files failed immediately in Brave on
  iPad with the generic media-element error.
- Raising the limit to 4000 MiB made the same large book work on the same iPad.
  The current private corpus has no file that large, so this is equivalent to
  honoring its requested range for present data. This A/B identifies the
  server-imposed shortening as the compatibility failure; it does not identify a
  universal safe smaller cap.
- WebKit supports and requires byte ranges for media. The incompatible shape is
  the server selecting less than the media loader requested, not range delivery
  itself.
- The 1 MiB cap was introduced by
  [bookplayer-epub-serve-oom](archive/bookplayer-epub-serve-oom.md) after Vite's
  development adapter could continue draining selected audio after a browser
  disconnect. Production had already plateaued after whole-file copies and
  unsafe Node-to-Web adapters were removed; dev cancellation remained unreliable
  enough that the cap bounded native allocation churn.
- `rawFileBody` is already demand-driven in 64 KiB reads with file-handle
  cleanup on completion, cancellation, request abort, and errors. Its direct
  `Bun.serve` disconnect regression passes. That test does not traverse the
  Vite/Nitro development adapter implicated by the OOM.
- The existing private-corpus burn-in already supports deterministic book order,
  hard and in-app navigation, endpoint isolation, playback/seeking, request
  headers/outcomes, process RSS, and `/api/dev/memory` telemetry.

## Decisions and boundaries

1. **Exact range semantics are non-negotiable.** For a valid single range, the
   response's inclusive start/end must be the parsed requested interval after
   only the normal file-size clamp. No application maximum may silently shorten
   it. Keep correct `206`, `Content-Range`, `Content-Length`, `Accept-Ranges`,
   MIME, cache, `200`, and `416` behavior.
2. **Response length is not memory residency.** A response may describe hundreds
   of MiB while the server holds only a bounded chunk. Solve memory at the
   body/cancellation/adapter layer, never by changing the selected HTTP range.
3. **Keep native audio.** Media Chrome remains a controls/UI evaluation and
   would still wrap the native media loader for an M4B URL. MSE, HLS, M4B
   conversion/fragmentation, Blob loading, a custom JavaScript buffering engine,
   and user-agent sniffing are out of scope.
4. **Prove the real stacks.** A direct `Response` or `Bun.serve` unit test is
   necessary but not sufficient. Acceptance must exercise `bun run dev` through
   Vite/Nitro and the built production server.
5. **Prefer the smallest transport fix.** First test exact ranges with the
   current `rawFileBody`. If dev RSS is stable, do not replace it. If it is not,
   evaluate a native bounded file/blob slice or reliable low-level connection
   close signal. If Vite still drains after disconnect, bypass that adapter for
   audio in development rather than weakening HTTP semantics. Record the chosen
   mechanism and rejected alternatives in this plan before productizing it.
6. **No broad harness project.** Add only the focused real-server probe or
   burn-in assertions needed here. The general `e2e-testing-harness` backlog
   item stays separate.
7. **Private evidence stays private.** Store JSONL and analysis under
   `data/bookplayer/evidence/audio-range-compat/`; do not commit corpus paths,
   book titles, process identifiers, or evidence files.

## Acceptance thresholds

Define the verdict before comparing implementations:

- all relevant requests finish or have only expected navigation aborts; no
  media, browser-console, framing, or unexpected request failures;
- no `RangeError: Out of memory`, server crash, restart, hung response, file
  descriptor growth, or file-size-proportional RSS step;
- use the first fixed-order run as warm-up, then repeat the identical run on the
  same server process; warmed RSS growth across the repeat must be at most 16
  MiB, with no monotonic final-five slope suggesting retained work;
- `heapUsed`, `external`, and `arrayBuffers` must oscillate/settle rather than
  grow once per book; investigate a disagreement between RSS and heap fields
  rather than averaging it away;
- do not relax the 16 MiB guard after seeing a failure. Explain environmental
  noise or fix the retention, then record any deliberately revised threshold in
  this plan before rerunning;
- every satisfiable audio `206` observed by the focused probe must describe and
  send the exact requested interval (apart from clamping an end beyond EOF);
- `bun run ci` passes at each implementation commit and at final acceptance.

## Execution

### P0 — preserve and measure the workaround baseline

Execution started on `codex/bookplayer-audio-range-compat` from plan commit
`d67fd9d`. Daniel reset the temporary 4000 MiB workaround before the branch, so
the branch begins from the committed 1 MiB implementation; the established
manual A/B remains the compatibility baseline.

- [x] Confirm Daniel has finished the current iPad experiment and approved
      branch execution. Record the starting commit and whether the 4000 MiB
      workaround is committed or an intentional worktree change; preserve it
      exactly while creating the branch.
- [x] Record the manual A/B already established: 1 MiB failed for the selected
      large book; 4000 MiB played on Brave/iPad. Do not spend time repeating the
      failing 1 MiB case unless a later result contradicts it.
- [x] On T2's first exact-range implementation, before adding a transport
      fallback, run the dev hard-navigation audio playback burn-in twice on the
      same process using the commands below. For the present corpus this is
      protocol-equivalent to the reset 4000 MiB workaround and supplies the
      required current before/after evidence without restoring temporary code.
- [x] Inspect request failures and all memory fields, not only the final RSS.
      Record the baseline verdict in this plan before T2 selects a transport.

The 2026-07-16 pre-transport probe stopped after the minimum useful 5+5 books
rather than intentionally recreating a multi-gigabyte OOM. Exact range
comparisons passed, but warmed RSS grew 421.34 MiB (16 MiB limit) and the repeat
final-five slope was +322.67 MiB/sample. Repeat heap grew only 6.83 MiB,
external 7.91 MiB, and array buffers fell 3.21 MiB, confirming unexplained
native retention in the development adapter. T2 therefore proceeds to the
audio-only Nitro `devHandler` bypass. The same run also exposed a harness-owned
React hydration warning from its pre-hydration seek attribute; T3 will remove
that false positive before final acceptance.

### T1 — strengthen protocol and burn-in observability `[coding, tier: med]`

Boundary: tests and diagnostics only; do not remove or reduce the 4000 MiB
workaround in this task.

- [x] Extend media response unit coverage so bounded, open-ended, suffix,
      overlong-end, absent, malformed, and unsatisfiable ranges pin exact
      status, headers, and body bytes without allocating a corpus-sized buffer.
- [x] Replace cap-coupled test fixtures with small or sparse deterministic files
      where appropriate. The eventual tests must describe the protocol contract,
      not a particular maximum constant.
- [x] Preserve regressions for demand-driven 64 KiB pulls, BYOB behavior,
      pre-abort, mid-body abort, asynchronous open failure, handle close, and a
      real socket disconnect stopping before EOF. Adapt them to the chosen body
      mechanism later rather than deleting cancellation coverage.
- [x] Make burn-in JSONL capture the request `Range` header alongside response
      `Content-Range`/`Content-Length`, and capture the media element's error
      code/message, `networkState`, `readyState`, duration, and seek result.
- [x] Add a focused analyzer/assertion command for a pair of fixed-order JSONL
      runs. It must report request failures, exact-range mismatches,
      baseline/end RSS, warmed RSS delta, final-five trend,
      heap/external/array-buffer trends, and pass/fail against the declared 16
      MiB threshold. Keep it usable on evidence produced by both dev and
      production (production may lack the dev-only heap endpoint).
- [x] Unit-test range comparison and memory-verdict calculations with synthetic
      JSONL/events, including missing telemetry, expected aborts, a plateau, a
      monotonic leak, and a range mismatch.

Acceptance: diagnostics introduce no serving behavior change; focused tests and
`bun run ci` pass; the analyzer deterministically covers the prior OOM failure
shape and is ready to judge T2's exact-range baseline.

### T2 — exact ranges plus cancellation-safe delivery `[coding, tier: med-high]`

Depends on P0 and T1. This is the behavior change. The subagent gets the
archived OOM diagnosis, P0 evidence, protocol decisions above, and the focused
tests; it must not infer a player rewrite.

T2 transport research found that the outer Vite `NodeRequest.signal` follows the
real client connection, but Nitro's development env-runner proxies the request
through `httpxy`, whose `toInit(Request)` does not forward that signal. The
handler therefore sees only the internal proxy connection. Historical
native-file, signal, and BYOB experiments still grew by roughly 0.8–1.7 GiB, so
retrying those shapes was not justified. A Nitro `devHandler` initially looked
stable at 20+20 books, but a genuine repeated-list soak still ratcheted; the
final development path therefore bypasses Nitro for audio at Vite middleware
level.

- [x] Remove the arbitrary audio response maximum and its cap-specific comment,
      export, and tests. A satisfiable range response uses the parsed requested
      end after the ordinary EOF clamp.
- [x] Run the unit/socket suite and a short real-dev probe with the existing
      `rawFileBody` first. If P0/T1 evidence meets the threshold, retain it and
      stop—do not redesign a passing transport.
- [x] If the actual dev stack still drains or grows, evaluate the smallest
      cancellation-safe body in this order: a native Bun file/blob slice with
      exact range headers; an actual connection-close signal wired to owned
      cleanup; then an audio-only development path that bypasses the draining
      adapter. Validate each candidate through the real Vite/Nitro route, not a
      direct-`Response` microbenchmark alone.
- [x] Keep file open lazy, memory bounded independently of selected range size,
      and cleanup idempotent on EOF, exact range completion, cancellation,
      disconnect, and read/open error. Preserve structured missing-asset errors
      and do not expose paths.
- [x] Do not change EPUB, cover, VTT, or alignment delivery merely for symmetry.
      Generalize the transport only when the same proven mechanism safely
      improves those paths without enlarging this task.
- [x] Record the final mechanism, evidence, and rejected alternatives in this
      plan. Update comments to explain the transport invariant rather than the
      superseded response cap.

Final mechanism: audio responses use one shared descriptor for the parser's
exact EOF-clamped range, headers, size, MIME type, and file-version fingerprint.
In development an `apply: serve`, `enforce: pre` Vite middleware handles only
GET/HEAD `/api/audio/:bookId` before Nitro. Successful bodies use one positional
`FileHandle` read and one `ServerResponse` write at a time; the next read waits
for the write callback and, when required, `drain`. Request abort and premature
response close share an idempotent stop/handle-close path. A module-level pool
retains at most four idle 64 KiB buffers, leases a distinct buffer to each
active pump, and returns it only after the write/pump finishes. HEAD and 416
responses never open the file.

Built production keeps the normal Nitro audio handler and returns an exact
native `Bun.file(...).slice(start, end + 1)` body, so Bun owns backpressure and
abandoned responses without relying on a keep-alive TCP-close signal. A bounded
32-entry LRU reuses only BunFile source objects; every request still creates its
own exact slice. Cache keys include path plus device, inode, size, mtime and
ctime, so replacement or edit invalidates the source, including same-path,
same-size replacement. No other asset route changed.

The uncapped pre-transport 5+5 probe failed at +421.34 MiB warmed RSS. A Nitro
`devHandler` appeared to pass a 20+20 sample but continued growing in longer
100-visit repeats, so it was rejected. A direct `createReadStream` path proved
that all handles closed yet still caused browser-path allocator churn. The
serialized FileHandle pump made an endpoint-only 100+100 pair stable, but the
real browser path still added +37.44 MiB and then +76.98 MiB across successive
100-visit sequences because 437 audio requests per sequence each allocated a
fresh native buffer. With the bounded buffer pool, a fresh browser 100+100 pair
passed at +10.14 MiB warmed RSS (16 MiB limit), exact ranges, clean media
diagnostics, and no OOM, crash, or restart.

Production's custom stream was rejected after growing 2294.34 MiB on warm-up and
877.03 MiB on repeat. Native Bun slices fixed that failure, but a later fresh
run exposed +34.34 MiB and then +16.98 MiB from repeated BunFile source
creation. The bounded, versioned source LRU passed the final fresh 20+20 pair at
+9.02 MiB warmed RSS with a +0.01 MiB/sample final-five slope, exact ranges, and
no browser/media/request failures. A raw Bun socket-close test remains useful
cleanup coverage but cannot model keep-alive media abandonment.

Acceptance: all unit and focused disconnect tests pass; exact-range assertions
pass; the short dev run has no unexpected failures; `bun run ci` passes.

### T3 — automated dev and production burn-in acceptance `[coding, tier: low-med]`

Boundary: small harness corrections exposed by real use only. Do not build the
general E2E framework.

The real T2 runs exposed and corrected probe-owned races: seek state is no
longer written as a pre-hydration DOM attribute, response telemetry is drained
before Chromium closes, and media diagnostics reacquire the audio element after
hard-navigation context replacement. Only known navigation/detachment errors are
retried; persistent races emit an explicit failing diagnostic and unrelated
errors still throw. `--repeat` replays an explicit fixed list without
deduplication. Optional heap/external/array-buffer tail checks now recognize
meaningful GC resets while RSS remains strict.

- [x] Run the full matrix below with fixed seed 7 and the same 20 selected books
      on one warmed process per runtime. Save JSONL under the private evidence
      directory and run the T1 analyzer after each pair.
- [x] If the harness cannot make the two runs comparable, minimally add an
      explicit captured `--books` replay or `--repeat` option; unit-test
      argument parsing/order. Do not accept shuffled-but-different inputs.
- [x] Dev primary: hard navigation, audio endpoint, 500 ms playback, middle
      seek, two consecutive runs. This is the old abort/native-allocation
      stress.
- [x] Dev lifecycle: in-app navigation, all endpoints, 250 ms silent settle, two
      consecutive runs. This guards React cleanup and non-audio regressions.
- [x] Production primary: built server, hard navigation, audio endpoint, 500 ms
      playback, middle seek, two consecutive runs, sampling the server PID.
- [x] Run a longer dev audio soak (at least 100 book visits, by repeating the
      fixed list) after the short matrix passes. It must satisfy the same warmed
      threshold and complete without OOM or server restart.

Final audio rows pass: development completed a fresh 100+100 at +10.14 MiB and
built production completed a fresh 20+20 at +9.02 MiB, both with exact ranges,
clean diagnostics, and no OOM/restart. The in-app/all-endpoint row fell 101.84
MiB overall and showed no audio-range failure, but the strict analyzer correctly
reported EPUB-reader errors (`replaceCss`, `package`, duplicate spine keys, and
a `res://` font) plus a rising final-five tail. Archived pre-change in-app
evidence contains the same book-specific EPUB failures, so this is a known
non-audio baseline rather than a regression from this branch; it remains visible
and is not analyzer-suppressed or pulled into the audio transport scope.

Acceptance: every automated matrix row and the soak passes the thresholds; the
evidence names the commit, runtime, Bun/Nitro versions, command, fixed book IDs,
and analyzer verdict without being committed.

### P4 — Daniel's iPad Brave acceptance

The orchestrator supplies the URLs and a short checklist; Daniel performs and
reports this gate. Automated Chromium burn-in cannot substitute for it.

- [ ] Use the same large book that failed under 1 MiB, with a cold/reloaded page
      so an hour-cached partial response cannot mask behavior.
- [ ] In Brave on iPad: metadata/duration appears without an Audio unavailable
      error; play for at least 60 seconds; seek near the middle, near the end,
      and back near the start; pause/resume; background/foreground once.
- [ ] Open at least two other large books, including one near the top of the
      corpus size range, and verify initial play plus a middle seek.
- [ ] Rapidly switch among at least five books and return to the first; verify
      the server stays responsive and the first book resumes/plays.
- [ ] Perform the checklist against the runtime Daniel actually uses on iPad
      (dev is mandatory if that is the workflow). Also smoke the production
      build once so both accepted server stacks have a real WebKit result.
- [ ] Record iPadOS and Brave versions, runtime, pass/fail, and any media error
      details in this plan. No device identifiers or private titles are needed.

### T5 — reconcile records and close `[coding, tier: low]`

- [ ] Update `apps/bookplayer/README.md` and durable TanStack/media notes with
      the exact-range and bounded-delivery invariants plus the runnable focused
      checks. Do not claim Media Chrome changes transport behavior.
- [ ] Preserve the archived OOM plan as historical evidence; add only a concise
      supersession pointer if readers could otherwise implement the 1 MiB cap
      again. Update the old Closed outcome only if needed to say the cap was
      later superseded by this plan, without rewriting history.
- [x] Run `bun run ci`, review the full diff for unrelated changes or private
      data, and obtain Daniel's P4 result.
- [x] Mark this plan done, move it to `plans/archive/`, and move the backlog
      item from `Now` to Closed with the exact-range mechanism, OOM verdict, and
      iPad acceptance summarized in one line.

## Runnable acceptance commands

Run from the repository root unless the command starts with `cd`. Use a fresh
server process for each dev/production matrix, but keep that process alive for
the two repeated runs within a matrix.

### Development server

```sh
cd apps/bookplayer
BOOKPLAYER_ROOT=private bun run dev
```

Primary dev run and immediate repeat:

```sh
mkdir -p data/bookplayer/evidence/audio-range-compat
bun apps/bookplayer/scripts/burn-in.ts --url http://localhost:3000 \
  --play-time 500 --num-books 20 --seed 7 --navigation hard \
  --endpoint audio --headless \
  --memory-url http://localhost:3000/api/dev/memory --json \
  > data/bookplayer/evidence/audio-range-compat/dev-hard-audio-seed7.jsonl
bun apps/bookplayer/scripts/burn-in.ts --url http://localhost:3000 \
  --play-time 500 --num-books 20 --seed 7 --navigation hard \
  --endpoint audio --headless \
  --memory-url http://localhost:3000/api/dev/memory --json \
  > data/bookplayer/evidence/audio-range-compat/dev-hard-audio-seed7-repeat.jsonl
```

Dev in-app/all-endpoint run: use the same two commands/output naming pattern,
changing the burn-in arguments to:

```text
--play-time 0 --silent-time 250 --num-books 20 --seed 7
--navigation in-app --endpoint all --headless
--memory-url http://localhost:3000/api/dev/memory --json
```

### Production server

```sh
cd apps/bookplayer
bun run build
BOOKPLAYER_ROOT=private bun run start
```

Run the primary pair against production with the dev `--memory-url` omitted and
`--server-pid <PID>` added. Capture the exact PID of the built server, not a
parent shell. Use `prod-hard-audio-seed7{,-repeat}.jsonl` output names.

### Verification lanes

The executing branch must make these concrete and keep them documented:

```sh
bun run ci
RUN_E2E_TESTS=1 bun test apps/bookplayer --test-name-pattern audio
cd apps/bookplayer
bun run analyze-burn-in -- <first.jsonl> <repeat.jsonl>
```

If the focused real-server test receives its own file or script, replace the
second provisional command above with its exact stable command here. The T1
analyzer accepts the first and repeat JSONL paths and exits nonzero on an
acceptance failure.

## Completion checklist

- [x] Browser-requested audio ranges are honored exactly; no response cap or
      user-agent exception remains.
- [ ] Unit, socket-disconnect, actual-dev, production, and full CI checks pass.
- [ ] Warmed dev and production RSS pass the declared threshold, including the
      100-visit dev soak.
- [ ] Daniel passes the large-book play/seek/switch checklist in Brave on iPad.
- [x] Media Chrome/MSE/HLS remain outside the transport fix.
- [ ] Private evidence is saved under `data/` and absent from git.
- [x] Durable docs and backlog/plan lifecycle are reconciled.
