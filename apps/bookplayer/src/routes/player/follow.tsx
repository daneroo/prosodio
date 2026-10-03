import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { formatDuration } from "#/lib/browse";
import { useNow } from "#/lib/use-now";
import {
  forgetApiKey,
  saveApiKey,
  useFollowSession,
} from "#/lib/follow-session";
import type { Tick } from "#/lib/audiobookshelf-socket";
import type { FollowState } from "#/lib/follow-session";
import { fetchFollowConfig } from "#/server/follow";

export const Route = createFileRoute("/player/follow")({
  loader: () => fetchFollowConfig(),
  component: FollowPage,
});

// Follow mode entry: connect to audiobookshelf with this device's key, wait
// for playback, and open the book it is playing once the identity map
// matches it.
function FollowPage() {
  const config = Route.useLoaderData();
  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 text-white">
      <header className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Link
          to="/"
          className="p-1 text-slate-400 transition-colors hover:text-white"
          aria-label="Back to library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-medium">Follow audiobookshelf</h1>
      </header>
      <main className="mx-auto w-full max-w-md p-6">
        {config.configured ? (
          <FollowConnection url={config.url} />
        ) : (
          <p className="text-sm text-slate-300">
            Follow mode is not configured: the Bookplayer server has no valid
            audiobookshelf URL and API key.
          </p>
        )}
      </main>
    </div>
  );
}

function FollowConnection({ url }: { url: string }) {
  const session = useFollowSession(url);
  const navigate = useNavigate();
  const followedBookId = session.followed?.bookId;
  useEffect(() => {
    if (!followedBookId) return;
    void navigate({
      to: "/player/$bookId",
      params: { bookId: followedBookId },
      search: { follow: "audiobookshelf" },
      replace: true,
    });
  }, [followedBookId, navigate]);
  return (
    <div className="space-y-4">
      <FollowStatusView session={session} />
      {session.hasKey && (
        <button
          type="button"
          onClick={forgetApiKey}
          className="text-xs text-slate-400 underline transition-colors hover:text-slate-300"
        >
          Forget key
        </button>
      )}
    </div>
  );
}

function FollowStatusView({ session }: { session: FollowState }) {
  switch (session.status) {
    case "idle":
      return <Notice>Starting…</Notice>;
    case "no-key":
      return <KeyForm />;
    case "rejected":
      return (
        <>
          <p className="text-sm text-rose-300">
            audiobookshelf rejected the key. Paste a new one.
          </p>
          <KeyForm />
        </>
      );
    case "connecting":
      return <Notice>Connecting to audiobookshelf…</Notice>;
    case "reconnecting":
      return (
        <>
          <Notice>Reconnecting to audiobookshelf…</Notice>
          {session.lastTick && <TickView tick={session.lastTick} />}
        </>
      );
    case "authenticated":
      return session.lastTick ? (
        <>
          <ResolutionNotice session={session} />
          <TickView tick={session.lastTick} />
        </>
      ) : (
        <Notice>Waiting for audiobookshelf playback…</Notice>
      );
  }
}

function ResolutionNotice({ session }: { session: FollowState }) {
  const result = session.resolution?.result;
  if (!result) return <Notice>Finding the book…</Notice>;
  if ("unmatched" in result) {
    return (
      <Notice>
        audiobookshelf is playing{" "}
        <span className="font-medium text-white">{result.title}</span>, which
        isn&apos;t in this library.
      </Notice>
    );
  }
  if ("unknown" in result) {
    return (
      <Notice>
        audiobookshelf is playing an item the Bookplayer server can&apos;t
        identify yet.
      </Notice>
    );
  }
  return <Notice>Opening the book…</Notice>;
}

function KeyForm() {
  const [key, setKey] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveApiKey(key);
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm text-slate-300" htmlFor="follow-api-key">
        audiobookshelf API key for this device
      </label>
      <input
        id="follow-api-key"
        type="password"
        autoComplete="off"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={!key.trim()}
        className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 transition-colors hover:text-white disabled:opacity-50"
      >
        Save key
      </button>
    </form>
  );
}

function TickView({ tick }: { tick: Tick }) {
  const now = useNow(1000);
  const ageSec = Math.max(0, Math.round((now - tick.receivedAt) / 1000));
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
      <dt className="text-slate-400">Item</dt>
      <dd className="truncate" data-testid="follow-item">
        {tick.itemId}
      </dd>
      <dt className="text-slate-400">Audio position</dt>
      <dd data-testid="follow-audio-position">
        {formatDuration(tick.audioPosition)}
      </dd>
      <dt className="text-slate-400">Tick age</dt>
      <dd data-testid="follow-tick-age">{ageSec} s</dd>
    </dl>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-300">{children}</p>;
}
