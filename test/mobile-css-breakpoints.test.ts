/**
 * @fileoverview mobile.css is breakpoint modifiers, one block per query
 * (design-system phase 4, board S04).
 *
 * The sheet used to grow a fresh `@media (max-width: 599px)` block wherever a
 * feature landed, nest a 599px query inside the 599px block, and split reduced
 * motion across the file, so "what changes on a phone" had no single place to
 * read. This pins the consolidated shape: every top-level query appears once,
 * in the order the file header documents, no block nests its own query, and
 * the kit's dialog parts are left to the kit's own phone modifiers. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type AtRule } from 'postcss';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const root = postcss.parse(readFileSync(resolve(PUBLIC, 'mobile.css'), 'utf8'));
const topMedia = root.nodes.filter((n): n is AtRule => n.type === 'atrule' && n.name === 'media').map((n) => n.params);

/** The order the file header lists. */
const ORDER = [
  '(max-width: 768px)',
  '(max-width: 768px) and (min-width: 600px)',
  '(min-width: 600px) and (max-width: 767px)',
  '(max-width: 599px)',
  '(max-width: 374px)',
  '(max-width: 860px)',
  '(max-width: 700px)',
  '(hover: none) and (pointer: coarse)',
  '(hover: none) and (pointer: coarse) and (prefers-reduced-motion: reduce)',
  '(prefers-reduced-motion: reduce)',
  '(vertical-viewport-segments: 2)',
];

describe('mobile.css breakpoint blocks', () => {
  it('has one top-level block per query', () => {
    const dupes = topMedia.filter((q, i) => topMedia.indexOf(q) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps the documented order, and a new query is added to it on purpose', () => {
    expect(topMedia).toEqual(ORDER);
    const header = root.first?.type === 'comment' ? root.first.text : '';
    expect(header).toContain('test/mobile-css-breakpoints.test.ts');
  });

  it('never nests a query inside a block that already applies it', () => {
    const nested: string[] = [];
    root.walkAtRules('media', (n) => {
      for (let p = n.parent; p && p.type !== 'root'; p = p.parent) {
        if (p.type === 'atrule' && (p as AtRule).name === 'media' && (p as AtRule).params === n.params) {
          nested.push(`${n.params} at line ${n.source?.start?.line}`);
        }
      }
    });
    expect(nested).toEqual([]);
  });

  it('leaves the dialog parts to the kit’s own phone modifiers', () => {
    const own: string[] = [];
    root.walkRules((r) => {
      if (/^\.cm-dialog(--sm|__head|__title|__body|__foot)?$/.test(r.selector.trim())) own.push(r.selector);
    });
    expect(own).toEqual([]);
    const kit = readFileSync(resolve(PUBLIC, 'css/components.css'), 'utf8');
    expect(kit).toMatch(/@media \(max-width: 599px\) \{\s*\.cm-dialog \{/);
  });
});
