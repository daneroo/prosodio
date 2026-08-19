import {
  HeadContent,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";

import { READER_THEME_ATTR, READER_THEME_KEY } from "#/lib/reader-theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BookPlayer" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

/**
 * Stamp the stored reading theme on <html> before the browser paints.
 *
 * The theme lives in localStorage, which the server cannot read, so anything
 * that renders it from React state disagrees with the server markup — and
 * React makes no guarantee that attribute mismatches are patched up during
 * hydration (react.dev/reference/react-dom/client/hydrateRoot). The server's
 * light background therefore survived into a dark session. This is the
 * documented fix for exactly that class of bug: an inline script that runs
 * synchronously as the browser parses the HTML
 * (nextjs.org/docs/app/guides/preventing-flash-before-hydration).
 *
 * `ScriptOnce` is TanStack's primitive for it — server-only, and the emitted
 * script removes itself once run, so nothing is left for React to hydrate.
 * Kept deliberately tiny and failure-tolerant: it runs before everything, so a
 * throw here would take the page with it. A missing or unreadable value just
 * means the default surface, which is correct rather than broken.
 */
function ReaderThemeScript() {
  return (
    <ScriptOnce>
      {`try{var t=localStorage.getItem(${JSON.stringify(READER_THEME_KEY)});if(t==="dark"||t==="light")document.documentElement.setAttribute(${JSON.stringify(READER_THEME_ATTR)},t)}catch(e){}`}
    </ScriptOnce>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required on <html> and only here: the script
    // above sets an attribute on this element before React hydrates, which is
    // by definition a server/client difference. React documents this prop as
    // the escape hatch for exactly that
    // (react.dev/reference/react-dom/components/common); it applies one level
    // deep, so it cannot mask mismatches anywhere else in the tree.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ReaderThemeScript />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
