/**
 * @fileoverview Design-system phase 0-1 guards.
 *
 * - scripts/css-metrics.mjs counts distinct values correctly and the ratchet
 *   only fails on an increase.
 * - The committed baseline matches the current stylesheets (CI also runs
 *   `npm run check:css`, this keeps `npm test` honest on its own).
 * - Open Props and tokens.css load BEFORE styles.css, and the build ships and
 *   hashes both.
 * - tokens.css only declares --cm-* custom properties inside the `tokens`
 *   layer, so it cannot change a pixel by itself.
 * - Phase 2: the skin palettes sit in `@layer skins` and set custom properties
 *   only; the skin component rules close styles.css, :where()-qualified except
 *   one weighted html:not() block whose contents are an explicit allowlist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeMetrics,
  compareWithBaseline,
  hasRawLiteral,
  listStylesheets,
  // @ts-expect-error -- plain .mjs script without type declarations
} from '../scripts/css-metrics.mjs';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('css-metrics counter', () => {
  it('counts distinct normalized values and ignores comments', () => {
    const { counts, values } = computeMetrics([
      '.a{font-size:12px;color:#FFF;padding:4px 8px}/* .x{font-size:99px} */',
      '.b{font-size: 12px !important;background:#ffffff;z-index:10}',
      '@media (max-width: 599px){.c{border-radius:6px;font-size:13px}}',
    ]);
    expect(values.fontSizes).toEqual(['12px', '13px']);
    expect(values.hexColors).toEqual(['#ffffff']);
    expect(counts.paddings).toBe(1);
    expect(counts.zIndexes).toBe(1);
    expect(counts.radii).toBe(1);
    expect(values.widthBreakpoints).toEqual(['599px']);
    expect(counts.important).toBe(1);
  });

  it('does not count values built only from tokens', () => {
    expect(hasRawLiteral('0 var(--cm-space-3)')).toBe(false);
    expect(hasRawLiteral('var(--btn-radius)')).toBe(false);
    expect(hasRawLiteral('0')).toBe(false);
    expect(hasRawLiteral('0.4rem 0.8rem')).toBe(true);
    expect(hasRawLiteral('calc(var(--a) - 2px)')).toBe(true);
    const { counts } = computeMetrics(['.a{padding:0 var(--cm-space-3);font-size:var(--cm-text-sm)}.b{padding:4px}']);
    expect(counts.paddings).toBe(1);
    expect(counts.fontSizes).toBe(0);
  });

  it('fails only when a count goes up or is missing from the baseline', () => {
    const base = { fontSizes: 5, important: 3 };
    expect(compareWithBaseline({ fontSizes: 5, important: 2 }, base).regressions).toEqual([]);
    expect(compareWithBaseline({ fontSizes: 5, important: 2 }, base).improvements).toHaveLength(1);
    expect(compareWithBaseline({ fontSizes: 6, important: 3 }, base).regressions[0].metric).toBe('fontSizes');
    expect(compareWithBaseline({ radii: 1 }, base).regressions[0].metric).toBe('radii');
  });

  it('the committed baseline is not exceeded by the current stylesheets', () => {
    const files: string[] = listStylesheets();
    expect(files.some((f) => f.endsWith('styles.css'))).toBe(true);
    expect(files.some((f) => f.includes('/vendor/'))).toBe(false);
    const { counts } = computeMetrics(files.map((f) => readFileSync(f, 'utf8')));
    const baseline = JSON.parse(read('config/css-metrics.json'));
    expect(compareWithBaseline(counts, baseline).regressions).toEqual([]);
  });
});

describe('design tokens wiring', () => {
  it('index.html loads open-props, then tokens, then styles.css', () => {
    const html = read('src/web/public/index.html');
    const op = html.indexOf('href="vendor/open-props.css"');
    const tokens = html.indexOf('href="css/tokens.css"');
    const styles = html.indexOf('href="styles.css"');
    expect(op).toBeGreaterThan(-1);
    expect(op).toBeLessThan(tokens);
    expect(tokens).toBeLessThan(styles);
  });

  it('the build generates, minifies and hashes both files', () => {
    const build = read('scripts/build.mjs');
    expect(build).toContain('prepare-open-props.mjs dist/web/public/vendor');
    expect(build).toContain("'vendor/open-props.css',");
    expect(build).toContain("'css/tokens.css',");
    expect(build).toContain('dist/web/public/css/tokens.css --minify');
  });

  it('tokens.css declares only --cm-* properties inside the tokens layer, in the shared layer order', () => {
    const css = read('src/web/public/css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const prep = read('scripts/prepare-open-props.mjs');
    const order = '@layer openprops, tokens, skins, base, components, layout, features;';
    expect(css).toContain(order);
    expect(prep).toContain(order);
    const decls = [...css.matchAll(/([a-z0-9-]+)\s*:[^;{}]+;/g)].map((m) => m[1]);
    expect(decls.length).toBeGreaterThan(50);
    expect(decls.filter((d) => !d.startsWith('--cm-'))).toEqual([]);
    expect(css.replace(order, '').trimStart().startsWith('@layer tokens {')).toBe(true);
  });

  it('muted text meets 4.5:1 on the default surfaces', () => {
    const styles = read('src/web/public/styles.css');
    expect(styles).not.toContain('--text-muted: #717b8c');
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    };
    const ratio = (a: string, b: string) => (lum(a) + 0.05) / (lum(b) + 0.05);
    for (const bg of ['#11151c', '#1b222c', '#202833']) expect(ratio('#8b95a6', bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('skins (design-system phase 2)', () => {
  const styles = read('src/web/public/styles.css');
  const code = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  const blockAt = (text: string, open: number) => {
    let depth = 0;
    for (let i = text.indexOf('{', open); i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
    }
    throw new Error('unbalanced block');
  };

  it('keeps every skin palette in @layer skins, as custom properties only', () => {
    const layer = blockAt(code, code.indexOf('@layer skins {'));
    for (const skin of [
      'og',
      'daylight-green',
      'daylight-blue',
      'paper-gray',
      'solarized-light',
      'catppuccin-latte',
      'rose-pine-dawn',
    ]) {
      expect(layer).toContain(`html[data-skin="${skin}"] {`);
    }
    expect(layer).toContain(':root {');
    const props = [...layer.matchAll(/([a-z0-9-]+)\s*:[^;{}]+;/g)].map((m) => m[1]);
    expect(props.filter((p) => !p.startsWith('--') && p !== 'color-scheme')).toEqual([]);
    // No palette block left outside the layer.
    expect(code.replace(layer, '').match(/^html\[data-skin="[a-z-]+"\] \{/m)).toBeNull();
  });

  it('closes the file with the skin component rules, light first, then the weighted block', () => {
    const light = code.search(/^:where\(html:not\(\[data-skin="og"\]\)\) \{/m);
    const weighted = [...code.matchAll(/^html:not\(\[data-skin="og"\]\) \{/gm)];
    expect(light).toBeGreaterThan(-1);
    expect(weighted).toHaveLength(1);
    expect(weighted[0].index!).toBeGreaterThan(light);
    // Nothing but the weighted block follows it.
    expect(blockAt(code, weighted[0].index!).length + weighted[0].index!).toBe(code.trimEnd().length);
    // Every light-skin component rule is :where()-qualified.
    const lightSkins =
      'html:is([data-skin="paper-gray"], [data-skin="solarized-light"], [data-skin="catppuccin-latte"], [data-skin="rose-pine-dawn"])';
    expect(code.split(lightSkins).length).toBe(code.split(':where(' + lightSkins + ')').length);
  });

  const splitTop = (list: string) => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    return [...out, cur.trim()];
  };

  it('weights only the allowlisted rules, and the catch-all skips the semantic buttons', () => {
    const weighted = [...code.matchAll(/^html:not\(\[data-skin="og"\]\) \{/gm)][0];
    const body = blockAt(code, weighted.index!);
    const selectors = [...body.slice(body.indexOf('{') + 1).matchAll(/([^{};]+)\{/g)].flatMap((m) => splitTop(m[1]));
    for (const sel of selectors) {
      expect(sel, sel).toMatch(
        /^(\.btn-toolbar(\.btn-(run|run-gear|shell|stop)\b|:where\(:not\(\.btn-primary, \.btn-danger, \.btn-success, \.btn-run, \.btn-run-gear\)\))|:focus-visible$)/
      );
    }
    expect(selectors).toContain(
      '.btn-toolbar:where(:not(.btn-primary, .btn-danger, .btn-success, .btn-run, .btn-run-gear))'
    );
  });
});

describe('component kit (design-system phase 3)', () => {
  const css = read('src/web/public/css/components.css');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('loads after tokens.css and before styles.css, and the build ships it', () => {
    const html = read('src/web/public/index.html');
    const tokens = html.indexOf('href="css/tokens.css"');
    const kit = html.indexOf('href="css/components.css"');
    expect(kit).toBeGreaterThan(tokens);
    expect(kit).toBeLessThan(html.indexOf('href="styles.css"'));
    const build = read('scripts/build.mjs');
    expect(build).toContain("'css/components.css',");
    expect(build).toContain('dist/web/public/css/components.css --minify');
  });

  it('lives entirely in @layer components, with no !important', () => {
    expect(code).toContain('@layer openprops, tokens, skins, base, components, layout, features;');
    const rest = code.replace('@layer openprops, tokens, skins, base, components, layout, features;', '').trim();
    expect(rest.startsWith('@layer components {')).toBe(true);
    expect(rest.endsWith('}')).toBe(true);
    expect(code).not.toMatch(/!important/);
  });

  it('styles only .cm-* parts (legacy classes join a part only when their old rules are deleted)', () => {
    const selectors = [...code.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@'));
    const bad = selectors.filter((s) => !/\.cm-[a-z]/.test(s) && !/^(from|to|\d+%)$/.test(s));
    expect(bad).toEqual([]);
  });

  it('reads tokens, not raw values, for type, space and radius', () => {
    const decls = [...code.matchAll(/(font-size|padding|gap|border-radius)\s*:\s*([^;]+);/g)];
    const raw = decls.filter(([, , v]) => hasRawLiteral(v.trim()));
    expect(raw.map((d) => d[0])).toEqual([]);
  });
});
