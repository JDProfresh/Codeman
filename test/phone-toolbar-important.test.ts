/**
 * @fileoverview The phone toolbar sizes and colours its buttons without
 * !important (design-system phase 4).
 *
 * The phone block used to clamp EVERY `.cm-btn--bar` to 26px with !important,
 * so the home screen's Run and the case sheet needed !important of their own
 * to escape it, Run/gear/Stop/Enter needed it again to tune their padding, and
 * Enter's colours needed it to beat the skin block's (0,2,1) catch-all: 38
 * declarations. The 26px size is now `.toolbar .cm-btn--bar` (the bottom bar is
 * `<footer class="toolbar">`), and per-button rules outrank by specificity
 * (`.toolbar .cm-btn--bar.btn-x` is (0,3,0)). Only the mic's and cron's
 * visibility toggles keep theirs (the hidden-marker pattern). Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const FAMILY = /cm-btn--bar|btn-run|btn-shell|btn-stop|btn-enter|btn-voice|mobile-overview-run|btn-case-create/;

describe('phone toolbar without !important', () => {
  it('only the mic and cron visibility toggles keep !important', () => {
    const left: string[] = [];
    for (const f of ['styles.css', 'mobile.css']) {
      postcss.parse(readFileSync(resolve(PUBLIC, f), 'utf8')).walkDecls((d) => {
        const sel = d.parent?.type === 'rule' ? (d.parent as postcss.Rule).selector : '';
        if (d.important && FAMILY.test(sel)) left.push(`${sel.replace(/\s+/g, ' ')} { ${d.prop} }`);
      });
    }
    for (const decl of left) expect(decl).toMatch(/(btn-voice|btn-cron--hidden) \{ display \}$/);
    expect(left.length).toBeLessThanOrEqual(4);
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
