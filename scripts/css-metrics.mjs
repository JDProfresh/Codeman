#!/usr/bin/env node
/**
 * @fileoverview CSS drift counter and ratchet (design-system phase 0).
 *
 * Counts how many DISTINCT values the hand-written stylesheets use for the
 * properties a design system should pin (font sizes, colors, padding, radii,
 * z-index, width breakpoints) plus how many `!important` declarations they
 * carry. The committed baseline in `config/css-metrics.json` is a ceiling:
 * `--check` fails when any count goes UP, so the refactor can only move the
 * numbers down. When a change lowers a count, `--update` rewrites the baseline
 * (and `--check` prints a reminder to do so, without failing).
 *
 * Scope: every `.css` under `src/web/public/` except `vendor/` (generated or
 * third-party) and `gesture/` (a committed bundle built from its own package).
 *
 * Usage:
 *   node scripts/css-metrics.mjs            print the counts
 *   node scripts/css-metrics.mjs --check    fail if any count exceeds the baseline
 *   node scripts/css-metrics.mjs --update   write the current counts as the baseline
 *   node scripts/css-metrics.mjs --values fontSizes   list one metric's distinct values
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'src/web/public');
const BASELINE_PATH = join(ROOT, 'config/css-metrics.json');
const SKIP_DIRS = new Set(['vendor', 'gesture']);

/** Lists the stylesheets in scope, sorted for stable output. */
export function listStylesheets(dir = PUBLIC_DIR) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(d, entry.name));
      } else if (entry.name.endsWith('.css')) {
        out.push(join(d, entry.name));
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** Strips comments so commented-out rules do not count. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Normalizes a declared value: lowercase, no `!important`, collapsed whitespace. */
function normalizeValue(value) {
  return value
    .replace(/!\s*important/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Expands `#abc` / `#abcd` to six / eight digits so equal colors count once. */
function normalizeHex(hex) {
  const h = hex.slice(1).toLowerCase();
  if (h.length === 3 || h.length === 4) return '#' + [...h].map((c) => c + c).join('');
  return '#' + h;
}

/**
 * Computes the metric sets for a list of CSS sources.
 * Returns `{ values: { metric: string[] }, counts: { metric: number } }`.
 */
export function computeMetrics(sources) {
  const sets = {
    fontSizes: new Set(),
    hexColors: new Set(),
    paddings: new Set(),
    radii: new Set(),
    zIndexes: new Set(),
    widthBreakpoints: new Set(),
  };
  let important = 0;
  const declaration = (prop) => new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'gi');
  const props = [
    ['fontSizes', declaration('font-size')],
    ['paddings', declaration('padding')],
    ['radii', declaration('border-radius')],
    ['zIndexes', declaration('z-index')],
  ];
  for (const raw of sources) {
    const css = stripComments(raw);
    for (const [metric, re] of props) {
      for (const m of css.matchAll(re)) sets[metric].add(normalizeValue(m[1]));
    }
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const len = m[0].length - 1;
      if (len === 3 || len === 4 || len === 6 || len === 8) sets.hexColors.add(normalizeHex(m[0]));
    }
    for (const m of css.matchAll(/@media[^{]*/g)) {
      for (const w of m[0].matchAll(/(?:min|max)-width\s*:\s*([\d.]+px)/g)) sets.widthBreakpoints.add(w[1]);
    }
    important += (css.match(/!\s*important/gi) || []).length;
  }
  const values = {};
  const counts = {};
  for (const [metric, set] of Object.entries(sets)) {
    values[metric] = [...set].sort();
    counts[metric] = set.size;
  }
  counts.important = important;
  return { values, counts };
}

/**
 * Compares counts with a baseline. Returns `{ regressions, improvements }`,
 * each a list of `{ metric, baseline, current }`. A metric missing from the
 * baseline is a regression, so a new metric needs an explicit `--update`.
 */
export function compareWithBaseline(counts, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [metric, current] of Object.entries(counts)) {
    const base = baseline[metric];
    if (typeof base !== 'number' || current > base) regressions.push({ metric, baseline: base, current });
    else if (current < base) improvements.push({ metric, baseline: base, current });
  }
  return { regressions, improvements };
}

function main(argv) {
  const files = listStylesheets();
  const { values, counts } = computeMetrics(files.map((f) => readFileSync(f, 'utf8')));
  const valuesIdx = argv.indexOf('--values');
  if (valuesIdx !== -1) {
    const metric = argv[valuesIdx + 1];
    if (!values[metric]) {
      console.error(`Unknown metric "${metric}". One of: ${Object.keys(values).join(', ')}`);
      return 1;
    }
    console.log(values[metric].join('\n'));
    return 0;
  }
  console.log(`CSS metrics over ${files.map((f) => relative(ROOT, f)).join(', ')}`);
  for (const [metric, n] of Object.entries(counts)) console.log(`  ${metric.padEnd(18)} ${n}`);
  if (argv.includes('--update')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + '\n');
    console.log(`Baseline written to ${relative(ROOT, BASELINE_PATH)}`);
    return 0;
  }
  if (argv.includes('--check')) {
    if (!existsSync(BASELINE_PATH)) {
      console.error(`No baseline at ${relative(ROOT, BASELINE_PATH)}; run with --update first.`);
      return 1;
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const { regressions, improvements } = compareWithBaseline(counts, baseline);
    for (const r of improvements) {
      console.log(`  ↓ ${r.metric} ${r.baseline} → ${r.current}: run \`npm run check:css -- --update\` to lock it in`);
    }
    if (regressions.length) {
      for (const r of regressions) console.error(`  ✗ ${r.metric} ${r.baseline ?? 'missing'} → ${r.current}`);
      console.error(
        'CSS drift went up. Use an existing value or a --cm-* token (src/web/public/css/tokens.css) instead of a new one.'
      );
      return 1;
    }
    console.log('✓ CSS metrics at or below the baseline');
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
