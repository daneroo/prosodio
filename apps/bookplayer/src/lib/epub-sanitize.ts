/**
 * Neutralize script execution in an EPUB section's serialized HTML, before
 * it becomes the reader iframe's srcdoc.
 *
 * Why this exists: Safari/iPadOS delivers NO events to listeners bound on a
 * sandboxed iframe's document unless `allow-scripts` is set (WebKit bug
 * 218086) — which killed both our word-activate gesture and epub.js's own
 * event forwarding on iPad. The sandbox bit is all-or-nothing, so enabling
 * events also enables the book's scripts. Decision (Daniel, 2026-08-19):
 * that reversal is permitted ONLY to make events work, never to let book
 * scripts run, so what the sandbox can no longer express is enforced here.
 *
 * NEUTRALIZES rather than DELETES. `<script>` keeps its element and its
 * position; only `type` changes to a value no browser will execute.
 * Removing the nodes would shift element indices in the rendered document
 * away from the capture-parse document, and the word-activate bridge maps a
 * rendered point to a CFI and back into that detached parse — divergence
 * there would break the very gesture this enables. Attributes carry no such
 * index, so inline handlers and `javascript:` URLs are removed outright.
 *
 * This is a string transform on serialized markup, not a parser. It is a
 * defense-in-depth layer for a personal, locally-owned corpus — not a
 * sanitizer for hostile input. If the library ever ingests untrusted books,
 * this needs a real parser and a much harder look.
 */

/** Marks a neutralized script. No browser executes an unknown MIME type. */
export const BLOCKED_SCRIPT_TYPE = "application/prosodio-blocked";

export function neutralizeScripts(html: string): string {
  return (
    html
      // Retype every <script>, dropping any existing type= first so ours is
      // the only one. Self-closing and normal forms both match: only the
      // opening tag is touched.
      .replace(
        /(<script\b)([^>]*?)(\/?)>/gi,
        (_match, open: string, attrs: string, selfClose: string) => {
          const withoutType = attrs.replace(
            /\stype\s*=\s*("[^"]*"|'[^']*'|[^\s/>]+)/gi,
            "",
          );
          return `${open}${withoutType} type="${BLOCKED_SCRIPT_TYPE}"${selfClose}>`;
        },
      )
      // Inline handlers: onclick=, onload=, onerror=, … Attributes don't
      // affect element indices, so these go entirely.
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s/>]+)/gi, "")
      // javascript: URLs in href/src/etc.
      .replace(/javascript:/gi, "blocked:")
  );
}
