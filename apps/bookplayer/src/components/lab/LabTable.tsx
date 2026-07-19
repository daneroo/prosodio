/**
 * Shared table shell for `/lab` list surfaces (plan
 * thoughts/plans/lab-routes-refined.md, S1b; decisions D9/D10). Extracted
 * from the locate sweep page (lab.locate.index.tsx) so the upcoming Corpora,
 * Audiobooks, Epub, VTT, and Alignment surfaces (S2-S4) all render through
 * one component instead of five copies of the same `<table>`.
 *
 * Deliberately a plain semantic `<table>` — NO virtualization yet. Corpus
 * scale is ~1000 rows of simple cells, which renders acceptably as plain DOM;
 * this component is the single place virtualization (`@tanstack/react-virtual`,
 * already proven in Transcript.tsx) would be added later if a surface
 * outgrows it, so every list page gets that upgrade for free.
 *
 * Expand contract: when `renderDetail` is provided, every row gets a leading
 * chevron cell (ChevronRight collapsed, ChevronDown expanded). Clicking it
 * toggles a full-width detail `<tr><td colSpan=...>` immediately under that
 * row. Expansion state (a `Set` of row keys) lives inside this component —
 * callers never see it.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

export interface LabColumn<T> {
  header: string;
  /** Applied to body `<td>`s for this column only; headers keep the standard
   * header classes. */
  className?: string;
  cell: (row: T) => ReactNode;
}

export interface LabTableProps<T> {
  rows: Array<T>;
  rowKey: (row: T) => string;
  columns: Array<LabColumn<T>>;
  /** Optional per-row detail content. Presence of this prop is what turns on
   * the chevron-expand column — see header comment. */
  renderDetail?: (row: T) => ReactNode;
  /** e.g. "min-w-[820px]" — table width floor before the wrapper scrolls. */
  minWidthClassName?: string;
}

export function LabTable<T>({
  rows,
  rowKey,
  columns,
  renderDetail,
  minWidthClassName,
}: LabTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columnCount = columns.length + (renderDetail ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full ${minWidthClassName ?? ""} border-collapse text-left text-xs`}
      >
        <thead>
          <tr className="border-b border-slate-700 text-slate-500">
            {renderDetail && <th className="py-1 pr-3 font-medium"></th>}
            {columns.map((column) => (
              <th key={column.header} className="py-1 pr-3 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const isExpanded = expanded.has(key);
            return (
              <Fragment key={key}>
                <tr className="border-b border-slate-800">
                  {renderDetail && (
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                        className="text-slate-500 hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      className={`py-1 pr-3 ${column.className ?? ""}`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
                {renderDetail && isExpanded && (
                  <tr className="border-b border-slate-800">
                    <td colSpan={columnCount} className="bg-slate-900/60 p-3">
                      {renderDetail(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
