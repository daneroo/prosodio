export const DEFAULT_RSS_THRESHOLD_BYTES = 16 * 1024 * 1024;

export type BurnInEvent = { type: string } & Record<string, unknown>;

export type MetricName =
  "rssBytes" | "heapUsedBytes" | "externalBytes" | "arrayBuffersBytes";

export type MetricTrend = {
  samples: number;
  baseline: number | null;
  end: number | null;
  delta: number | null;
  finalFiveDelta: number | null;
  finalFiveSlope: number | null;
  monotonicFinalFive: boolean;
};

export type BurnInVerdict = {
  passed: boolean;
  rssThresholdBytes: number;
  warmedRssDeltaBytes: number | null;
  failures: Array<string>;
  rangeMismatches: Array<string>;
  first: Record<MetricName, MetricTrend>;
  repeat: Record<MetricName, MetricTrend>;
};

const METRICS: ReadonlyArray<MetricName> = [
  "rssBytes",
  "heapUsedBytes",
  "externalBytes",
  "arrayBuffersBytes",
];

export function analyzeBurnInPair(
  firstEvents: Array<BurnInEvent>,
  repeatEvents: Array<BurnInEvent>,
  rssThresholdBytes = DEFAULT_RSS_THRESHOLD_BYTES,
): BurnInVerdict {
  const first = analyzeMetrics(firstEvents);
  const repeat = analyzeMetrics(repeatEvents);
  const failures = [
    ...collectFailures(firstEvents, "first"),
    ...collectFailures(repeatEvents, "repeat"),
  ];
  if (!firstEvents.some((event) => event.type === "complete")) {
    failures.push("first: complete event is missing (run may have crashed)");
  }
  if (!repeatEvents.some((event) => event.type === "complete")) {
    failures.push("repeat: complete event is missing (run may have crashed)");
  }
  const rangeMismatches = [
    ...collectRangeMismatches(firstEvents, "first"),
    ...collectRangeMismatches(repeatEvents, "repeat"),
  ];
  const repeatRss = repeat.rssBytes;
  const warmedRssDeltaBytes = repeatRss.delta;

  if (warmedRssDeltaBytes === null) {
    failures.push("repeat: RSS telemetry is missing");
  } else if (warmedRssDeltaBytes > rssThresholdBytes) {
    failures.push(
      `repeat: warmed RSS grew by ${warmedRssDeltaBytes} bytes (limit ${rssThresholdBytes})`,
    );
  }

  for (const metric of METRICS) {
    if (repeat[metric].monotonicFinalFive) {
      failures.push(`repeat: ${metric} increased across every final-five step`);
    }
  }

  if (!sameSelection(firstEvents, repeatEvents)) {
    failures.push("first/repeat book selections differ");
  }

  return {
    passed: failures.length === 0 && rangeMismatches.length === 0,
    rssThresholdBytes,
    warmedRssDeltaBytes,
    failures,
    rangeMismatches,
    first,
    repeat,
  };
}

export function analyzeMetric(
  events: Array<BurnInEvent>,
  metric: MetricName,
): MetricTrend {
  const values = events
    .filter((event) => event.type === "memory")
    .map((event) => event[metric])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const finalFive = values.slice(-5);
  return {
    samples: values.length,
    baseline: values[0] ?? null,
    end: values.at(-1) ?? null,
    delta:
      values.length > 0
        ? (values.at(-1) as number) - (values[0] as number)
        : null,
    finalFiveDelta:
      finalFive.length >= 2
        ? (finalFive.at(-1) as number) - (finalFive[0] as number)
        : null,
    finalFiveSlope: linearSlope(finalFive),
    monotonicFinalFive:
      finalFive.length === 5 &&
      finalFive.slice(1).every((value, index) => value > finalFive[index]!),
  };
}

export function compareAudioRange(event: BurnInEvent): string | null {
  if (event.type !== "request" || event.endpoint !== "audio") return null;
  if (event.status !== 206) return null;

  const requestHeaders = asRecord(event.requestHeaders);
  const responseHeaders = asRecord(event.headers);
  const requestRange = stringField(requestHeaders, "range");
  const contentRange = stringField(responseHeaders, "content-range");
  const contentLength = stringField(responseHeaders, "content-length");
  const label = `${String(event.method ?? "GET")} ${String(event.url ?? "<unknown>")}`;

  if (!requestRange)
    return `${label}: 206 has no recorded Range request header`;
  if (!contentRange)
    return `${label}: 206 has no Content-Range response header`;

  const responseMatch = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
  if (!responseMatch) return `${label}: invalid Content-Range ${contentRange}`;
  const responseStart = Number(responseMatch[1]);
  const responseEnd = Number(responseMatch[2]);
  const size = Number(responseMatch[3]);
  const requestMatch = /^bytes=(\d*)-(\d*)$/.exec(requestRange.trim());
  if (!requestMatch || requestRange.includes(",")) {
    return `${label}: unsupported single-range syntax ${requestRange}`;
  }

  const startPart = requestMatch[1] ?? "";
  const endPart = requestMatch[2] ?? "";
  let expectedStart: number;
  let expectedEnd: number;
  if (startPart === "") {
    const suffix = Number(endPart);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size <= 0) {
      return `${label}: invalid satisfiable suffix ${requestRange}`;
    }
    expectedStart = Math.max(size - suffix, 0);
    expectedEnd = size - 1;
  } else {
    expectedStart = Number(startPart);
    expectedEnd =
      endPart === "" ? size - 1 : Math.min(Number(endPart), size - 1);
  }

  if (responseStart !== expectedStart || responseEnd !== expectedEnd) {
    return `${label}: requested ${requestRange}, received ${contentRange}, expected bytes ${expectedStart}-${expectedEnd}/${size}`;
  }
  const expectedLength = responseEnd - responseStart + 1;
  if (contentLength !== String(expectedLength)) {
    return `${label}: Content-Length ${contentLength ?? "missing"}, expected ${expectedLength}`;
  }
  return null;
}

function analyzeMetrics(events: Array<BurnInEvent>) {
  return Object.fromEntries(
    METRICS.map((metric) => [metric, analyzeMetric(events, metric)]),
  ) as Record<MetricName, MetricTrend>;
}

function collectRangeMismatches(events: Array<BurnInEvent>, label: string) {
  return events.flatMap((event) => {
    const mismatch = compareAudioRange(event);
    return mismatch ? [`${label}: ${mismatch}`] : [];
  });
}

function collectFailures(events: Array<BurnInEvent>, label: string) {
  const failures = new Set<string>();
  for (const event of events) {
    if (
      event.type === "request-failure" ||
      (event.type === "request" && typeof event.failure === "string")
    ) {
      const failure = String(event.failure ?? "unknown request failure");
      if (!isExpectedAbort(failure)) {
        failures.add(
          `${label}: request ${String(event.url ?? "<unknown>")} — ${failure}`,
        );
      }
    } else if (
      event.type === "browser-console-error" ||
      event.type === "browser-page-error" ||
      event.type === "telemetry-error"
    ) {
      const text = String(event.text ?? "unknown failure");
      if (!isExpectedAbort(text))
        failures.add(`${label}: ${event.type} — ${text}`);
    } else if (event.type === "media-element") {
      const error = asRecord(event.error);
      if (event.audioFound === false)
        failures.add(`${label}: audio element missing`);
      if (error) {
        failures.add(
          `${label}: media error ${String(error.code ?? "unknown")} — ${String(error.message ?? "")}`,
        );
      }
      const seek = asRecord(event.seekResult);
      if (seek?.attempted === true && seek.succeeded !== true) {
        failures.add(`${label}: media seek did not land near its target`);
      }
    }
  }
  return [...failures];
}

function sameSelection(
  firstEvents: Array<BurnInEvent>,
  repeatEvents: Array<BurnInEvent>,
) {
  const first = firstEvents.find((event) => event.type === "selection")?.links;
  const repeat = repeatEvents.find(
    (event) => event.type === "selection",
  )?.links;
  if (!Array.isArray(first) || !Array.isArray(repeat)) return true;
  return JSON.stringify(first) === JSON.stringify(repeat);
}

function linearSlope(values: Array<number>): number | null {
  if (values.length < 2) return null;
  const meanX = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index++) {
    numerator += (index - meanX) * ((values[index] as number) - meanY);
    denominator += (index - meanX) ** 2;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function isExpectedAbort(text: string) {
  return /ERR_(ABORTED|BLOCKED_BY_CLIENT)|NS_BINDING_ABORTED/i.test(text);
}
