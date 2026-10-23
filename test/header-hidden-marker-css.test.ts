// test/header-hidden-marker-css.test.ts
// Port: none (pure static analysis — runs in CI, no browser/server).
//
// Every opt-in header button follows a marker-class pattern: the base rule is
// `display:inline-flex !important` and a more-specific
// `.btn-x.btn-x--hidden { display: none !important; }` rule hides it
// (`.btn-multimonitor--hidden` etc. in styles.css). This guard was born as the
// regression test for the (since removed) Split button, which shipped its
// `--hidden` marker with no CSS rule and so rendered VISIBLE to every user
// regardless of its setting; it fails loudly for the NEXT such class instead.
// Same static-parse shape as test/mobile-header-buttons-policy.test.ts (read
// first for the parsing conventions this file reuses).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postcss from 'postcss';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(HERE, '../src/web/public');

/** Every distinct `*--hidden` class token referenced anywhere in index.html. */
function loadHiddenMarkerClasses(): Set<string> {
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
  const classes = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const token of m[1].split(/\s+/)) {
      if (token.endsWith('--hidden')) classes.add(token);
    }
  }
  return classes;
}

/**
 * Every `*--hidden` class that has a CSS rule (anywhere — top-level or inside
 * any at-rule, e.g. a phone-only @media block) whose selector targets that
 * exact class and whose declarations set `display: none` (with or without
 * `!important`).
 */
function loadCssHiddenClasses(cssFile: string): Set<string> {
  const css = readFileSync(join(PUBLIC, cssFile), 'utf-8');
  const hidden = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    let hides = false;
    rule.walkDecls('display', (decl) => {
      if (decl.value.replace(/!important/i, '').trim() === 'none') hides = true;
    });
    if (!hides) return;
    for (const token of rule.selector.match(/\.[a-z0-9-]*--hidden\b/gi) || []) {
      hidden.add(token.slice(1));
    }
  });
  return hidden;
}

describe('Every "*--hidden" marker class has a matching CSS hide rule (static guard)', () => {
  const markerClasses = loadHiddenMarkerClasses();
  const cssHidden = new Set([...loadCssHiddenClasses('styles.css'), ...loadCssHiddenClasses('mobile.css')]);

  it('finds at least one *--hidden marker class in index.html (sanity)', () => {
    // If this drops to 0 the parser/markup drifted — fix the parser, don't delete the test.
    expect(markerClasses.size).toBeGreaterThan(0);
  });

  it('every "*--hidden" class in index.html has a `display: none` rule in styles.css or mobile.css', () => {
    for (const cls of markerClasses) {
      expect(
        cssHidden.has(cls),
        `index.html references class "${cls}" (an opt-in-hide marker) but no rule in styles.css or ` +
          `mobile.css sets "display: none" for it — the element it marks ships VISIBLE regardless of the ` +
          `setting that is supposed to gate it. Add ".${cls} { display: none !important; }" (see the sibling ` +
          `.btn-multimonitor--hidden / .btn-redraw-terminal--hidden rules in styles.css for the pattern).`
      ).toBe(true);
    }
  });
});
