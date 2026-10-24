/**
 * @fileoverview Small icon buttons are the kit's .cm-btn--icon (design-system
 * phase 3; owner decision 2026-10-24, option D of the four compared).
 *
 * The legacy `.btn-icon-sm` was a 17×24px hit area in the browser's default
 * button font. Every panel, preview and drawer toolbar now uses
 * `.cm-btn.cm-btn--icon.cm-btn--ghost`: a 32px square with a mouse that grows to
 * the 44px touch size under a coarse pointer (the `--cm-control` token), with a
 * 16px glyph. Text toggles in a toolbar (the file preview's MD and Page) are
 * `.cm-btn--sm.cm-btn--ghost`, never fixed squares. A pressed toggle
 * (`aria-pressed="true"`) stays accent under the pointer.
 *
 * ⚠️ `.cm-btn` sets `display`, so it must re-assert `[hidden]`: the file
 * preview's prev/next/Page/Lines buttons are `hidden` until they apply, and
 * without the rule they all showed. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(resolve(PUBLIC, f), 'utf8');
const kit = read('css/components.css');

describe('icon buttons on the kit', () => {
  it('no markup, builder or rule uses .btn-icon-sm any more', () => {
    for (const f of ['index.html', 'panels-ui.js', 'styles.css', 'mobile.css']) {
      expect(read(f), f).not.toMatch(/btn-icon-sm/);
    }
    expect(read('index.html').match(/class="cm-btn cm-btn--icon cm-btn--ghost/g)?.length ?? 0).toBeGreaterThan(25);
  });

  it('text toggles are small ghost buttons, not squares', () => {
    const html = read('index.html');
    for (const id of ['filePreviewMdBtn', 'filePreviewPageBtn']) {
      expect(html).toMatch(new RegExp(`class="cm-btn cm-btn--sm cm-btn--ghost file-preview-pill" id="${id}"`));
    }
  });

  it('the icon size is the control token (32px, 44px on touch) with a 16px glyph', () => {
    expect(kit).toMatch(
      /\.cm-btn--icon \{\s*width: var\(--cm-control\);\s*padding: 0;\s*font-size: var\(--cm-text-md\);/
    );
    const tokens = read('css/tokens.css');
    expect(tokens).toMatch(/--cm-control: 32px;/);
    expect(tokens).toMatch(/@media \(pointer: coarse\) \{\s*:root \{\s*--cm-control: var\(--cm-control-touch\);/);
  });

  it('honours [hidden], and a pressed toggle keeps its accent on hover', () => {
    expect(kit).toMatch(/\.cm-btn\[hidden\] \{\s*display: none;/);
    const hover = kit.indexOf('.cm-btn--ghost:hover {');
    const pressed = kit.indexOf(".cm-btn--ghost[aria-pressed='true']:hover");
    expect(pressed).toBeGreaterThan(hover);
  });
});
