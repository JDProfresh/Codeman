/**
 * @fileoverview Feature rules in styles.css move into @layer features
 * (design-system phase 4).
 *
 * The layer order is `openprops, tokens, skins, base, components, layout,
 * features`, and everything unlayered still beats every layer. So a rule wrapped
 * in `@layer features { … }` keeps beating the kit, the shell and the resets, but
 * now LOSES to every unlayered rule, whatever its specificity: the rest of
 * styles.css, the skin overrides at its end, and all of mobile.css. That is the
 * point (an override no longer needs to out-weigh the feature it adjusts), and it
 * is also the rule for moving more: a block may only move when nothing unlayered
 * that it currently beats can reach its elements, which the first tranche checked
 * per declaration family against every unlayered rule, then confirmed with
 * `css:diff --viewports all`.
 *
 * ⚠️ Never `!important` inside a layer: a layered !important beats every
 * unlayered !important (the order flips for important declarations), so it would
 * win over the very overrides the layer exists to lose to. mobile.css stays
 * unlayered: it is the override sheet. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const styles = postcss.parse(readFileSync(resolve(PUBLIC, 'styles.css'), 'utf8'));
const blocks: postcss.AtRule[] = [];
styles.walkAtRules('layer', (a) => {
  if (a.params === 'features' && a.nodes) blocks.push(a);
});

describe('@layer features', () => {
  it('holds the first tranche of feature rules', () => {
    const rules = blocks.reduce((n, b) => n + b.nodes!.filter((x) => x.type === 'rule').length, 0);
    expect(blocks.length).toBeGreaterThanOrEqual(60);
    expect(rules).toBeGreaterThanOrEqual(900);
  });

  it('never carries !important, keyframes or global selectors', () => {
    const bad: string[] = [];
    for (const b of blocks) {
      b.walkDecls((d) => {
        if (d.important) bad.push(`!important: ${(d.parent as postcss.Rule).selector} { ${d.prop} }`);
      });
      b.walkAtRules((a) => {
        if (/keyframes|font-face/.test(a.name)) bad.push(`@${a.name} ${a.params}`);
      });
      b.walkRules((r) => {
        for (const s of r.selectors) if (/^(:root|html|body|\*)$/.test(s.trim())) bad.push(`global: ${s}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('sits in the declared layer order, and mobile.css stays unlayered', () => {
    const tokens = readFileSync(resolve(PUBLIC, 'css/tokens.css'), 'utf8');
    expect(tokens).toContain('@layer openprops, tokens, skins, base, components, layout, features;');
    expect(readFileSync(resolve(PUBLIC, 'mobile.css'), 'utf8')).not.toMatch(/@layer features/);
  });

  it('each block closes with its label', () => {
    const text = readFileSync(resolve(PUBLIC, 'styles.css'), 'utf8');
    expect(text.match(/^@layer features \{$/gm)?.length ?? 0).toBe(
      text.match(/^\} \/\* @layer features \*\/$/gm)?.length
    );
  });
});
