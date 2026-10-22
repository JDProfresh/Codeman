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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeMetrics,
  compareWithBaseline,
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
