import { describe, expect, test } from "bun:test";

import { BLOCKED_SCRIPT_TYPE, neutralizeScripts } from "./epub-sanitize";

describe("neutralizeScripts", () => {
  test("retypes a plain inline script", () => {
    const out = neutralizeScripts("<script>alert(1)</script>");
    expect(out).toBe(`<script type="${BLOCKED_SCRIPT_TYPE}">alert(1)</script>`);
  });

  test("replaces an existing type rather than leaving two", () => {
    const out = neutralizeScripts(
      '<script type="text/javascript" src="a.js"></script>',
    );
    expect(out).not.toContain("text/javascript");
    expect(out.match(/type=/g)).toHaveLength(1);
    expect(out).toContain(`type="${BLOCKED_SCRIPT_TYPE}"`);
    // src is preserved — a blocked type means it is never fetched or run.
    expect(out).toContain('src="a.js"');
  });

  test("handles single-quoted and unquoted type attributes", () => {
    expect(neutralizeScripts("<script type='module'>x</script>")).not.toContain(
      "module",
    );
    expect(neutralizeScripts("<script type=module>x</script>")).not.toContain(
      ">module",
    );
  });

  test("keeps the element count identical — CFI parity depends on it", () => {
    const html = "<p>a</p><script>x</script><p>b</p><script>y</script>";
    const out = neutralizeScripts(html);
    expect(out.match(/<script\b/g)).toHaveLength(2);
    expect(out.match(/<\/script>/g)).toHaveLength(2);
    expect(out.match(/<p>/g)).toHaveLength(2);
  });

  test("preserves a self-closing script's slash", () => {
    const out = neutralizeScripts('<script src="a.js"/>');
    expect(out).toContain(`type="${BLOCKED_SCRIPT_TYPE}"/>`);
  });

  test("strips inline event handlers, quoted or not", () => {
    expect(neutralizeScripts('<p onclick="evil()">t</p>')).toBe("<p>t</p>");
    expect(neutralizeScripts("<p onload='evil()'>t</p>")).toBe("<p>t</p>");
    expect(neutralizeScripts("<img onerror=evil() src=a.png>")).toBe(
      "<img src=a.png>",
    );
  });

  test("defuses javascript: URLs", () => {
    expect(neutralizeScripts('<a href="javascript:evil()">x</a>')).toBe(
      '<a href="blocked:evil()">x</a>',
    );
    expect(neutralizeScripts('<a href="JavaScript:evil()">x</a>')).toContain(
      "blocked:",
    );
  });

  test("leaves ordinary markup untouched", () => {
    const html = '<p class="x">hello <em>world</em></p>';
    expect(neutralizeScripts(html)).toBe(html);
  });

  test("does not mangle words merely containing 'on'", () => {
    const html = '<p data-song="a">only</p>';
    expect(neutralizeScripts(html)).toBe(html);
  });
});
