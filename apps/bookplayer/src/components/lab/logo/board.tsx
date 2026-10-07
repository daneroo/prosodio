/**
 * Shared frame for the /lab/logo boards: the Claude Design source's page look
 * (cream page, white cards, mono labels).
 */
import type { CSSProperties, ReactNode } from "react";

export const MONO = "'JetBrains Mono',ui-monospace,monospace";

export const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  boxShadow: "0 0 0 1px rgba(0,0,0,.05)",
};

/** The page the boards sit on. */
export function BoardPage({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-10 rounded-lg p-8"
      style={{ background: "#f3f1ec", color: "#1c1d26" }}
    >
      {children}
    </div>
  );
}

/** One board: its number and title, then its content. */
export function Board({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div
        className="text-xs tracking-[.06em] text-[#6b6a72] uppercase"
        style={{ fontFamily: MONO }}
      >
        Board {number} · {title}
      </div>
      {children}
    </div>
  );
}
