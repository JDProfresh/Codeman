#!/usr/bin/env node
/**
 * @fileoverview Plan (and optionally write) the next tranche of styles.css rules
 * to move into `@layer features` (design-system phase 4, docs/design-system.md).
 *
 * A layered rule loses to EVERY unlayered rule, whatever its specificity. So a
 * rule can move without changing a pixel only when no unlayered rule it beats
 * today (on the same property family, for an element both can match) is left
 * behind, and when it still beats every rule already in the layer that it beats
 * today. This script checks exactly that, per declaration:
 *
 *  - Candidates: unlayered styles.css rules before the skin component section,
 *    with no !important (a layered !important would beat every unlayered one),
 *    no :root/html/body/* subject, not inside @supports/@keyframes/@font-face.
 *  - "Can match the same element": both selectors (pseudo-classes stripped) are
 *    matched against a running server's DOM in several states (desktop, phone,
 *    every modal and panel open, the rail and sidebar layouts). When both match
 *    something and share an element, they reach each other. Otherwise the source
 *    decides: subjects reach when they share an identity class or two of their
 *    classes are listed together in one class string (`${...}` makes a prefix
 *    wildcard). A class JS adds at runtime is not an identity: a BEM `X--y` sits
 *    on `.X`, the rest are mapped in RUNTIME_ON (read off the code that adds
 *    them), and an unmapped one reaches anything. An element-wide rule scoped by
 *    an ancestor class reaches only selectors naming it; a bare tag rule reaches
 *    only that tag (the class->tag map from the samples, and the tags the markup
 *    ever gives a class).
 *  - Property families: shorthands with their longhands (border, background,
 *    font incl. line-height, inset/top/left, gap, place/align/justify, ...).
 *  - A fixpoint drops every candidate that would lose, then runs shorter than
 *    --min-run consecutive rules (so the file gets readable blocks, not one
 *    wrapper per rule), and repeats until stable.
 *
 * The analysis picks candidates; `npm run css:diff -- --viewports all` (plus a
 * look at JS-built UI the samples cannot show) is still the proof.
 *
 * Usage (a server running this tree on --url, e.g. CODEMAN_INSTANCE=diffcand on 3173):
 *   node scripts/css-layer-plan.mjs --url http://127.0.0.1:3173 [--min-run 8] [--reasons] [--runtime-only] [--write]
 * --reasons tallies what blocks the rest; --runtime-only lists the unmapped
 * runtime classes doing it (each wants a RUNTIME_ON entry).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const sp = require('postcss-selector-parser');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const URL_ = opt('url', 'http://127.0.0.1:3173');
const MIN_RUN = Number(opt('min-run', '8'));
const PUB = resolve(dirname(fileURLToPath(import.meta.url)), '../src/web/public') + '/';

// ---- property families --------------------------------------------------------
const SHORT = ['border', 'background', 'margin', 'padding', 'font', 'outline', 'flex', 'grid', 'transition',
  'animation', 'overflow', 'inset', 'list-style', 'text-decoration', 'gap', 'place', 'columns', 'mask',
  'scroll-margin', 'scroll-padding'];
function fam(p) {
  if (p.startsWith('--')) return p;
  if (p.startsWith('-webkit-') && !p.startsWith('-webkit-user')) return fam(p.slice(8));
  if (['top', 'right', 'bottom', 'left'].includes(p)) return 'inset';
  if (p === 'line-height') return 'font';
  if (/^(row-gap|column-gap)$/.test(p)) return 'gap';
  if (/^(column-count|column-width)$/.test(p)) return 'columns';
  if (/^(align|justify)-(items|content|self)$/.test(p)) return 'place';
  return SHORT.find((s) => p === s || p.startsWith(s + '-')) || p;
}

// ---- selectors ------------------------------------------------------------------
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
function analyse(sel) {
  const out = [];
  sp((root) =>
    root.each((s) => {
      let a = 0, b = 0, c = 0;
      s.walk((n) => {
        if (n.type === 'id') a++;
        else if (n.type === 'class' || n.type === 'attribute') b++;
        else if (n.type === 'tag') c++;
        else if (n.type === 'pseudo') {
          if (n.value === ':where') return false;
          if ([':not', ':is', ':has'].includes(n.value)) {
            let best = [0, 0, 0];
            n.nodes.forEach((arg) => {
              const r = analyse(arg.toString())[0];
              if (r && cmp(r.spec, best) > 0) best = r.spec;
            });
            a += best[0]; b += best[1]; c += best[2];
            return false;
          }
          if (n.value.startsWith('::') || [':before', ':after', ':first-line', ':first-letter'].includes(n.value)) c++;
          else b++;
        }
      });
      const subject = [];
      for (let i = s.nodes.length - 1; i >= 0 && s.nodes[i].type !== 'combinator'; i--) subject.unshift(s.nodes[i]);
      const toks = new Set(), all = new Set();
      let tag = '', pseudoEl = '';
      s.walk((m) => {
        if (m.type === 'class') all.add('.' + m.value);
        if (m.type === 'id') all.add('#' + m.value);
      });
      for (const n of subject) {
        if (n.type === 'tag') tag = n.value.toLowerCase();
        if (n.type === 'class') toks.add('.' + n.value);
        if (n.type === 'id') toks.add('#' + n.value);
        if (n.type === 'pseudo' && (n.value.startsWith('::') || [':before', ':after'].includes(n.value)))
          pseudoEl = n.value.replace(/^::?/, '');
        if (n.type === 'pseudo' && n.value === ':is')
          n.walk((m) => {
            if (m.type === 'class') toks.add('.' + m.value);
            if (m.type === 'id') toks.add('#' + m.value);
          });
      }
      const ctxToks = new Set([...all].filter((t) => !toks.has(t)));
      out.push({ spec: [a, b, c], toks, tag, ctxToks, pseudoEl, generic: toks.size === 0, text: s.toString().trim() });
    })
  ).processSync(sel);
  return out;
}
const atContext = (node) => {
  const m = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') m.push(`${p.name} ${p.params}`);
  return m;
};
function leafRules(root, file, offset) {
  const rules = [];
  let order = offset;
  root.walkRules((r) => {
    const c = atContext(r);
    if (c.some((x) => /^(keyframes|-webkit-keyframes|font-face)/.test(x))) return;
    const layers = c.filter((x) => x.startsWith('layer')).map((x) => x.slice(6));
    rules.push({ r, file, order: order++, layer: layers[0] || null, sels: analyse(r.selector),
      decls: r.nodes.filter((n) => n.type === 'decl'), media: c });
  });
  return rules;
}

// ---- DOM samples ----------------------------------------------------------------
const stylesRoot = postcss.parse(fs.readFileSync(PUB + 'styles.css', 'utf8'));
const mobileRoot = postcss.parse(fs.readFileSync(PUB + 'mobile.css', 'utf8'));
const S = leafRules(stylesRoot, 'styles', 0);
const M = leafRules(mobileRoot, 'mobile', 1e6);
const strip = (s) =>
  s
    .replace(/::?(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)\b(\([^)]*\))?/g, '')
    .replace(/:(hover|focus-visible|focus-within|focus|active|visited|checked|disabled|enabled|empty|placeholder-shown|target|indeterminate|invalid|valid|read-only|user-invalid|autofill)\b/g, '')
    .replace(/\s+>\s*$/, '')
    .trim() || '*';
const STATES = {
  desk: [1440, ''],
  deskOpen: [1440, `document.querySelectorAll('.modal').forEach(m => m.classList.add('active')); document.querySelectorAll('[class*="--hidden"]').forEach(e => e.className = e.className.replace(/\\b\\S+--hidden\\b/g, ''))`],
  deskPanels: [1440, `document.querySelectorAll('.monitor-panel,.subagents-panel,.file-browser-panel,.project-insights-panel').forEach(p => p.classList.add('open','visible')); document.querySelectorAll('[hidden]').forEach(e => e.hidden = false)`],
  rail: [1440, `Object.assign(document.documentElement.dataset, { tabOrientation: 'vertical', tabRailDetail: 'rich' })`],
  sidebar: [1440, `document.documentElement.dataset.sessionList = 'sidebar'`],
  phone: [393, ''],
  phoneOpen: [393, `document.querySelectorAll('.modal').forEach(m => m.classList.add('active')); document.querySelectorAll('[hidden]').forEach(e => e.hidden = false)`],
};
const allSels = [...new Set([...S, ...M].flatMap((x) => x.sels.map((s) => s.text)))];
const sample = new Map();
const TAGS = new Map();
const browser = await chromium.launch(existsPw() ? {} : { executablePath: '/opt/pw-browsers/chromium' });
for (const [name, [w, code]] of Object.entries(STATES)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 800, isMobile: w < 800 });
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const res = await page.evaluate(
    ([code, list]) => {
      if (code) new Function(code)();
      const all = [...document.querySelectorAll('*')];
      const idx = new Map(all.map((e, i) => [e, i]));
      const tags = {};
      for (const e of all) {
        const t = e.tagName.toLowerCase();
        for (const c of e.classList) (tags['.' + c] ||= {})[t] = 1;
        if (e.id) (tags['#' + e.id] ||= {})[t] = 1;
      }
      const hits = {};
      for (const [orig, s] of list) {
        try {
          const m = [...document.querySelectorAll(s)].map((e) => idx.get(e));
          if (m.length) hits[orig] = m;
        } catch {
          // a selector the browser cannot query: no sample, static fallback
        }
      }
      return { hits, tags };
    },
    [code, allSels.map((s) => [s, strip(s)])]
  );
  for (const [s, m] of Object.entries(res.hits)) {
    if (!sample.has(s)) sample.set(s, new Set());
    for (const i of m) sample.get(s).add(`${name}:${i}`);
  }
  for (const [t, set] of Object.entries(res.tags)) {
    if (!TAGS.has(t)) TAGS.set(t, new Set());
    for (const tag of Object.keys(set)) TAGS.get(t).add(tag);
  }
  await ctx.close();
}
await browser.close();
function existsPw() {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

const SRC = fs.readdirSync(PUB).filter((f) => /\.(js|html)$/.test(f)).map((f) => fs.readFileSync(PUB + f, 'utf8')).join('\n');
const CLASSED_TAGS = new Set([...SRC.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*\bclass\s*=/g)].map((m) => m[1].toLowerCase()));
for (const m of SRC.matchAll(/createElement(?:NS)?\(\s*(?:[^,)]*,\s*)?['"]([\w-]+)['"]/g)) CLASSED_TAGS.add(m[1].toLowerCase());

// Which classes can sit on one element, from the source: every string literal that
// lists two or more classes (a `${...}` suffix makes its prefix a wildcard), plus
// the classes JS adds to an existing element (classList.add/toggle, className +=),
// which can meet any class.
const CO = new Map(); // token -> Set(token | 'prefix*')
const ADDED = new Set();
const note = (a, b) => {
  if (!CO.has(a)) CO.set(a, new Set());
  CO.get(a).add(b);
};
for (const m of SRC.matchAll(/(["'`])((?:(?!\1)[^\n\\])*)\1/g)) {
  const body = m[2].replace(/\$\{[^}]*\}/g, '*');
  const parts = body.split(/\s+/).filter((t) => /^[a-zA-Z][\w-]*\*?$/.test(t) || /^[a-zA-Z][\w-]*-\*$/.test(t));
  if (parts.length < 2 || parts.length !== body.trim().split(/\s+/).length) continue;
  for (const x of parts) for (const y of parts) if (x !== y) note('.' + x.replace(/\*$/, ''), y.endsWith('*') ? '.' + y : '.' + y);
}
for (const m of SRC.matchAll(/classList\.(?:add|toggle|replace)\(([^)]*)\)|className\s*\+=\s*([^;\n]+)/g))
  for (const t of (m[1] || m[2]).matchAll(/['"`]([a-zA-Z][\w-]*)/g)) ADDED.add('.' + t[1]);
const coOccur = (x, y) => {
  for (const [p, q] of [[x, y], [y, x]]) {
    const set = CO.get(p);
    if (!set) continue;
    if (set.has(q)) return true;
    for (const w of set) if (w.endsWith('*') && q.startsWith(w.slice(0, -1))) return true;
  }
  return false;
};

// Identity classes are the ones markup gives an element; classes JS adds at runtime
// (state modifiers like .active) say nothing about WHICH element, unless we know
// it: a BEM modifier X--y sits on .X, and these were read off the code that adds them.
const RUNTIME_ON = {
  '.worktree-status-error': ['.worktree-status'], // session-ui.js _setWorktreeStatus
  '.voice-send-active': ['.btn-settings', '.btn-settings-mobile', '.btn-icon-header'], // voice-input.js
  '.tile-hint-note': ['.tile-hint-line'], // tile-grid.js tile hint rows
  '.tile-hint-keys': ['.tile-hint-line'],
  '.set-preview-ico': [], // settings-ui.js: a cloned icon carrying no other class
  '.tab-glow': ['.session-tab'], // app.js / tile-grid.js
  '.tab-layout-dragging': ['.session-tab', '.tab-layout-group-header', '.tab-layout-group-toggle'], // app.js drag origin
  '.tab-layout-drag-active': ['.session-tabs', '.session-tabs--grouped'], // app.js drag container
};
function identities(sel) {
  const out = [];
  let unknown = false;
  for (const t of sel.toks) {
    if (!ADDED.has(t)) out.push(t);
    else if (RUNTIME_ON[t]) out.push(t, ...RUNTIME_ON[t]);
    else if (t.includes('--')) out.push(t, t.split('--')[0]);
    else unknown = true;
  }
  return out.length ? out : unknown ? null : out;
}

function reach(a, b) {
  if (a.pseudoEl !== b.pseudoEl) return false;
  const sa = sample.get(a.text), sb = sample.get(b.text);
  if (sa && sb) {
    for (const e of sa) if (sb.has(e)) return true;
    if (a.generic || b.generic) return false; // a sampled element-wide rule: its sample is the answer
  }
  if (!a.generic && !b.generic) {
    const ia = identities(a), ib = identities(b);
    if (ia && ib) return ia.some((t) => ib.includes(t)) || ia.some((t) => ib.some((u) => coOccur(t, u)));
    // a runtime-only subject with no known element: judge it by its ancestors or tag
    const [g, x] = ia ? [b, a] : [a, b];
    if (!ia && !ib) return true;
    if (g.ctxToks.size) return [...g.ctxToks].some((t) => x.text.includes(t));
    if (g.tag) return x.tag ? x.tag === g.tag : true;
    return true;
  }
  if (a.generic && b.generic) return true;
  const [g, x] = a.generic ? [a, b] : [b, a];
  if (g.ctxToks.size) return [...g.ctxToks].some((t) => x.text.includes(t));
  if (!g.tag) return true;
  if (x.tag) return x.tag === g.tag;
  const seen = [...x.toks].map((t) => TAGS.get(t)).filter(Boolean);
  if (seen.length) return seen.some((set) => set.has(g.tag));
  return !['body', 'html'].includes(g.tag) && CLASSED_TAGS.has(g.tag);
}

// ---- plan -------------------------------------------------------------------------
const skinStart = stylesRoot.toString().indexOf('Skin component rules (design-system phase 2)');
const isGlobal = (x) => x.sels.some((s) => /^(:root|html|body|\*)$/.test(s.text) || (/^(html|body|:root)(\[|\.|:|$)/.test(s.text) && !s.toks.size));
const cand = S.filter((x) => !x.layer && x.r.source.start.offset < skinStart && x.decls.length &&
  !x.decls.some((d) => d.important) && !isGlobal(x) && !x.media.some((m) => m.startsWith('supports')));
const byFam = new Map();
for (const x of [...S, ...M].filter((y) => !y.layer || y.layer === 'features'))
  for (const d of x.decls) {
    if (d.important) continue; // a normal declaration never beat it, moved or not
    const f = fam(d.prop);
    if (!byFam.has(f)) byFam.set(f, []);
    byFam.get(f).push(x);
  }
const ruleOf = new Map(cand.map((x) => [x.r, x]));
const moved = new Set(cand);
const reasons = new Map();
const blockers = new Map();
function conflict(x) {
  for (const d of x.decls)
    for (const y of byFam.get(fam(d.prop)) || []) {
      if (y === x || moved.has(y)) continue;
      for (const sx of x.sels)
        for (const sy of y.sels) {
          if (!reach(sx, sy)) continue;
          const c = cmp(sx.spec, sy.spec);
          const xWinsInside = c > 0 || (c === 0 && x.order > y.order);
          // unlayered y: x beats it today (by weight) and would lose after the move.
          // y already in features: x beats it today (unlayered) and must still win inside the layer.
          if (y.layer === 'features' ? !xWinsInside : xWinsInside) {
            blockers.set(x, sy);
            return `${d.prop} vs ${y.file}:${y.r.source.start.line} ${sy.text.slice(0, 70)}`;
          }
        }
    }
  return null;
}
function runs() {
  const out = [];
  for (const parent of new Set([...moved].map((x) => x.r.parent))) {
    let run = [];
    for (const n of parent.nodes) {
      if (n.type === 'comment') continue;
      if (n.type === 'rule' && moved.has(ruleOf.get(n))) run.push(ruleOf.get(n));
      else {
        if (run.length) out.push(run);
        run = [];
      }
    }
    if (run.length) out.push(run);
  }
  return out;
}
for (let pass = 0; pass < 50; pass++) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const x of [...moved]) {
      const why = conflict(x);
      if (why) {
        moved.delete(x);
        reasons.set(x, why);
        changed = true;
      }
    }
  }
  const short = runs().filter((r) => r.length < MIN_RUN);
  if (!short.length) break;
  for (const r of short) for (const x of r) moved.delete(x);
}
const count = (arr) => arr.reduce((n, x) => n + x.decls.length, 0);
console.log(`candidates ${cand.length} rules (${count(cand)} decls); movable in runs of >= ${MIN_RUN}: ${moved.size} rules (${count([...moved])} decls), ${runs().length} blocks`);
if (args.includes('--runtime-only')) {
  // runtime-only subjects that block a move, with how many rules each blocks
  const tally = new Map();
  for (const r of blockers.values())
    if (r.toks.size && [...r.toks].every((t) => ADDED.has(t))) tally.set([...r.toks].join(''), (tally.get([...r.toks].join('')) || 0) + 1);
  for (const [k, n] of [...tally].sort((p, q) => q[1] - p[1])) console.log(String(n).padStart(5), k);
}
if (args.includes('--reasons')) {
  const tally = new Map();
  for (const why of reasons.values()) {
    const k = why.replace(/^\S+ vs /, '');
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  for (const [k, n] of [...tally].sort((p, q) => q[1] - p[1]).slice(0, 40)) console.log(String(n).padStart(5), k);
}
if (args.includes('--write')) {
  for (const run of runs()) {
    const layer = postcss.atRule({ name: 'layer', params: 'features', raws: { afterName: ' ', between: ' ', after: '\n' } });
    const first = run[0].r;
    const nodes = first.parent.nodes;
    const from = nodes.indexOf(first), to = nodes.indexOf(run[run.length - 1].r);
    const span = nodes.slice(from, to + 1);
    first.before(layer);
    for (const n of span) layer.append(n);
  }
  const text = stylesRoot.toString().replace(/@layer features \{\n\n/g, '@layer features {\n');
  fs.writeFileSync(PUB + 'styles.css', labelClosers(text));
  console.log('written');
}
function labelClosers(text) {
  // Label each block's closing brace so a reader sees where the layer ends.
  const root = postcss.parse(text);
  root.walkAtRules('layer', (a) => {
    if (a.params === 'features' && a.nodes && !(a.next()?.type === 'comment' && a.next().text === '@layer features'))
      a.after(postcss.comment({ text: '@layer features', raws: { before: ' ' } }));
  });
  return root.toString().replace(/\n\}\s*\/\* @layer features \*\//g, '\n} /* @layer features */');
}
