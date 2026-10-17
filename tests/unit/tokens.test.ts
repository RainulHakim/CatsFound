import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.1 AA contrast for every foreground/background token pair we use,
 * in both themes. Parses app/globals.css so the CSS stays the source of truth.
 */

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

function block(startPattern: RegExp): string {
  const start = css.search(startPattern);
  if (start < 0) throw new Error(`block not found: ${startPattern}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

function colors(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

const light = colors(block(/@theme\s*\{/));
const darkMedia = colors(block(/:root:not\(\[data-theme="light"\]\)\s*\{/));
const darkExplicit = colors(block(/:root\[data-theme="dark"\]\s*\{/));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]
const TEXT = 4.5;
const UI = 3; // non-text: borders of inputs, focus rings, button boundaries
const pairs: [string, string, number][] = [
  ["text", "bg", TEXT],
  ["text", "surface", TEXT],
  ["text", "surface-2", TEXT],
  ["muted", "bg", TEXT],
  ["muted", "surface", TEXT],
  ["muted", "surface-2", TEXT],
  ["on-primary", "primary", TEXT],
  ["on-primary", "primary-hover", TEXT],
  ["on-accent", "accent", TEXT],
  ["on-danger", "danger", TEXT],
  ["primary", "bg", TEXT], // links
  ["primary", "surface", TEXT],
  ["danger", "bg", TEXT], // error messages
  ["danger", "surface", TEXT],
  ["success", "surface", TEXT],
  ["success", "bg", TEXT],
  ["border-strong", "surface", UI],
  ["border-strong", "bg", UI],
  ["focus", "bg", UI],
  ["focus", "surface", UI],
  ["primary", "bg", UI],
];

describe.each([
  ["light", light],
  ["dark", darkMedia],
])("%s theme", (_name, palette) => {
  it.each(pairs)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(palette[fg], `missing --color-${fg}`).toBeDefined();
    expect(palette[bg], `missing --color-${bg}`).toBeDefined();
    expect(contrast(palette[fg]!, palette[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

describe("dark mode definitions", () => {
  it("system-dark and explicit-dark blocks are identical", () => {
    expect(darkExplicit).toEqual(darkMedia);
  });

  it("dark redefines every light colour token", () => {
    const lightKeys = Object.keys(light).filter((k) => light[k]!.startsWith("#"));
    expect(Object.keys(darkMedia).sort()).toEqual(lightKeys.sort());
  });
});
