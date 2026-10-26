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
  it('holds six tranches of feature rules', () => {
    let rules = 0;
    for (const b of blocks) b.walkRules(() => void rules++);
    expect(blocks.length).toBeGreaterThanOrEqual(250);
    expect(rules).toBeGreaterThanOrEqual(1980);
  });

  it('a modifier never sits in the layer while its unlayered base sets the same property', () => {
    // The first tranche layered .home-sessions-row--working (and its siblings) while
    // the base .home-sessions-row stayed unlayered and set border-color too, so a
    // working row lost its green border. A BEM modifier's base rule always reaches
    // the modifier's element: check every pair.
    const layered = new Map<string, Set<string>>();
    const unlayered = new Map<string, Set<string>>();
    const note = (map: Map<string, Set<string>>, cls: string, prop: string) => {
      if (!map.has(cls)) map.set(cls, new Set());
      map.get(cls)!.add(prop);
    };
    styles.walkRules((r) => {
      let inLayer = false;
      let media = false;
      for (let p = r.parent; p && p.type !== 'root'; p = p.parent) {
        if (p.type === 'atrule' && (p as postcss.AtRule).name === 'layer') inLayer = true;
        if (p.type === 'atrule' && (p as postcss.AtRule).name === 'media') media = true;
      }
      if (media) return;
      for (const sel of r.selectors) {
        const m = /^\.([\w-]+)$/.exec(sel.trim());
        if (!m) continue;
        r.walkDecls((d) => note(inLayer ? layered : unlayered, m[1], d.prop));
      }
    });
    const bad: string[] = [];
    for (const [cls, props] of layered) {
      if (!cls.includes('--')) continue;
      const base = unlayered.get(cls.split('--')[0]);
      // compare property families: `border` on the base covers `border-color` on the modifier
      const fam = (p: string) => p.split('-')[0];
      for (const p of props)
        if ([...(base ?? [])].some((q) => fam(q) === fam(p)))
          bad.push(`.${cls} { ${p} } is layered, .${cls.split('--')[0]} is not`);
    }
    expect(bad).toEqual([]);
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

  it('keeps bare hide utilities out of the layer', () => {
    // `#cronModal .hidden` lands on whatever element JS hides, and must beat that
    // element's own display rule, which a layered rule never does.
    const bare: string[] = [];
    for (const b of blocks)
      b.walkRules((r) => {
        for (const sel of r.selectors) {
          const subject =
            sel
              .trim()
              .split(/\s*[ >+~]\s*/)
              .pop() ?? '';
          if (/^(\.hidden|\[hidden\])$/.test(subject)) bare.push(sel);
        }
      });
    expect(bare).toEqual([]);
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
