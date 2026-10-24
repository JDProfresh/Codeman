/**
 * @fileoverview mobile.css wins by specificity and order, not !important
 * (design-system phase 4).
 *
 * The phone block used to clamp EVERY `.cm-btn--bar` to 26px with !important,
 * so the home screen's Run and the case sheet needed !important of their own
 * to escape it, Run/gear/Stop/Enter needed it again to tune their padding, and
 * Enter's colours needed it to beat the skin block's (0,2,1) catch-all: 38
 * declarations. The 26px size is now `.toolbar .cm-btn--bar` (the bottom bar is
 * `<footer class="toolbar">`), and per-button rules outrank by specificity
 * (`.toolbar .cm-btn--bar.btn-x` is (0,3,0)).
 *
 * The rest of mobile.css followed: its show/hide rules are later in the cascade
 * than (or more specific than) what they override, and the opt-in header
 * buttons' hidden-marker pairs in styles.css (`.btn-x` / `.btn-x.btn-x--hidden`,
 * never written inline by JS) dropped the !important they used to make the
 * phone rules escalate against. Three declarations keep it, each for a reason
 * specificity cannot cover:
 *   - the 16px input floor (iOS zooms into any field under 16px, so it must beat
 *     every component's font-size, whatever its weight);
 *   - the subagent dropdown's `left` and `transform`, which JS writes INLINE when
 *     it positions the dropdown under its badge. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const FAMILY = /cm-btn--bar|btn-run|btn-shell|btn-stop|btn-enter|btn-voice|mobile-overview-run|btn-case-create/;
const HEADER_MARKERS = /^\.btn-(approvals|readmymind|session-manager|away-digest|file-viewer)\b/;

const importantDecls = (file: string, keep: (sel: string) => boolean) => {
  const left: string[] = [];
  postcss.parse(readFileSync(resolve(PUBLIC, file), 'utf8')).walkDecls((d) => {
    const sel = d.parent?.type === 'rule' ? (d.parent as postcss.Rule).selector.replace(/\s+/g, ' ') : '';
    if (d.important && keep(sel)) left.push(`${sel} { ${d.prop} }`);
  });
  return left;
};

describe('mobile.css without !important', () => {
  it('only the iOS input floor and the JS-positioned dropdown keep !important', () => {
    expect(importantDecls('mobile.css', () => true)).toEqual([
      'input, textarea, select { font-size }',
      '.subagent-dropdown { left }',
      '.subagent-dropdown { transform }',
    ]);
  });

  it('the toolbar family and the header marker pairs in styles.css carry none', () => {
    expect(importantDecls('styles.css', (sel) => FAMILY.test(sel) || HEADER_MARKERS.test(sel))).toEqual([]);
  });

  it('the 26px size is scoped to the bottom toolbar', () => {
    const mobile = readFileSync(resolve(PUBLIC, 'mobile.css'), 'utf8');
    expect(mobile).toMatch(
      /\n {2}\.toolbar \.cm-btn--bar \{\n {4}min-height: 26px;\n {4}max-height: 26px;\n {4}height: 26px;/
    );
    const html = readFileSync(resolve(PUBLIC, 'index.html'), 'utf8');
    expect(html).toContain('<footer class="toolbar">');
  });
});
