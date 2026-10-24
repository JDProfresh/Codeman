/**
 * @fileoverview styles.css keeps !important only where specificity cannot do
 * the job (design-system phase 4).
 *
 * 82 declarations used to carry it. What is left falls in five groups, each a
 * case where the rule must beat something a selector cannot reach:
 *   - xterm: its own stylesheet and the inline styles it writes on the helper
 *     textarea and viewport, plus the touch-device user-select lock;
 *   - drag states: `body.*-resizing *` must set the cursor on every element;
 *   - motion kill switches: `prefers-reduced-motion` and the tile entrance hold;
 *   - the settings search/field hides, utilities on arbitrary rows, chips and
 *     sections whose own display rules share their (1,1,0) weight;
 *   - the voice-send gear, a transient JS state over header, phone-toolbar and
 *     skin rules up to (0,4,1) and their :hover.
 * Everything else wins by order or specificity: the opt-in header buttons'
 * marker pairs (nothing writes their display inline), the scoped hides
 * (solo mode, the cron modal, filtered tabs, the home rail), and the active
 * tab, whose competitors (rich rail cards and their state accents, ledger
 * cells, colour stripes, drag-over) skip it with `:where(:not(.active))`, which
 * adds no specificity. !important inside @keyframes is ignored by every
 * browser, so it is never written there. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/web/public/styles.css'), 'utf8');
const ALLOWED: Array<[string, RegExp]> = [
  ['xterm', /xterm/],
  ['drag state', /^body\.(tab-rail-resizing|tile-grid-resizing)/],
  ['motion', /^@\(prefers-reduced-motion|tile--enter-hold/],
  ['settings hide utility', /\.set-(field|hit)-hidden$/],
  ['voice-send state', /^\.voice-send-active(:active)?$/],
];

const important: string[] = [];
const inKeyframes: string[] = [];
postcss.parse(css).walkDecls((d) => {
  if (!d.important) return;
  const media: string[] = [];
  let keyframes = false;
  for (let m = d.parent?.parent; m && m.type !== 'root'; m = m.parent) {
    if (m.type === 'atrule') {
      if (/keyframes/.test((m as postcss.AtRule).name)) keyframes = true;
      else media.push((m as postcss.AtRule).params);
    }
  }
  const sel = d.parent?.type === 'rule' ? (d.parent as postcss.Rule).selector.replace(/\s+/g, ' ') : '';
  (keyframes ? inKeyframes : important).push(`${media.length ? `@${media.join('&')} ` : ''}${sel} | ${d.prop}`);
});

describe('styles.css !important', () => {
  it('every one left belongs to a group specificity cannot cover', () => {
    const stray = important.filter((decl) => !ALLOWED.some(([, re]) => re.test(decl.split(' | ')[0])));
    expect(stray).toEqual([]);
    expect(important.length).toBeLessThanOrEqual(32);
  });

  it('none inside @keyframes (browsers ignore it there)', () => {
    expect(inKeyframes).toEqual([]);
  });

  it('the active tab, the header markers and the scoped hides carry none', () => {
    const off = important.filter(
      (d) =>
        !d.startsWith('@(prefers-reduced-motion') &&
        /session-tab\.active|tab-number|--hidden|solo-mode|#cronModal|offline-overlay|home-sessions|docker-(adopt|create)|tab-filtered-out|tile-hint|header-plan-usage|#(summary|context|respawn|ralph)-tab/.test(
          d
        )
    );
    expect(off).toEqual([]);
  });

  it('competitors skip the active tab without adding specificity', () => {
    expect(css).toMatch(/\.session-tab:where\(:not\(\.active\)\)\[data-color="red"\] \{ border-left/);
    expect(css).toMatch(/\.session-tab\.drag-over-left:where\(:not\(\.active\)\) \{/);
    expect(css).toMatch(/\.tab-rail \.session-tab:where\(:not\(\.active\)\):hover \{/);
    expect(css).toMatch(/tabs-ledger > \.session-tab:where\(:not\(\.active\)\) \{\n {4}border: 1px solid/);
    // The skin's hover sits BEFORE its active rule, so the selected tab keeps its look under the pointer.
    expect(css.indexOf('.session-tab:hover {\n  background: rgba(var(--accent-rgb), 0.06);')).toBeLessThan(
      css.indexOf('.session-tab.active {\n  background: rgba(var(--accent-rgb), 0.13);')
    );
  });
});
