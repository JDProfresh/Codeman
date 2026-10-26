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
 *  - A BEM modifier `X--y` always carries its base `.X`; two different tags never
 *    meet; `:focus-visible` and `:not(:focus-visible)` never hold at once; a
 *    conflict that only matters in a state X needs (:focus-visible, :hover...) is
 *    masked when an unmoved unlayered rule written as Y plus that state outweighs X
 *    and sets every property Y sets.
 *  - A compound subject's element carries all the classes chained on it (never the
 *    alternatives of an `:is()`), so two subjects meet only if every pair of those
 *    (non-runtime) classes can share an element;
 *    a context class matches only whole (`.session-tab` is not `.session-tabs`).
 *  - Two different `[type="…"]` values never meet, and a typed subject never meets
 *    a sampled input of another type when no script builds more of those inputs or
 *    rewrites their type. An attribute JS writes on known elements only (ATTR_ON,
 *    e.g. `[data-docked]`) stands for those elements, and an id meets every class
 *    its sampled element carries. `.active` and
 *    `:not(.active)` never meet.
 *
 * Usage (a server running this tree on --url, e.g. CODEMAN_INSTANCE=diffcand on 3173):
 *   node scripts/css-layer-plan.mjs --url http://127.0.0.1:3173 [--min-run 8] [--reasons] [--runtime-only] [--write]
 *   node scripts/css-layer-plan.mjs --url ... --why '<selector text>'   follow one blocker chain
 *   node scripts/css-layer-plan.mjs --url ... --audit | --fix-audit       re-check what is layered
 *   node scripts/css-layer-plan.mjs --url ... --hoist --write           see below
 *   node scripts/css-layer-plan.mjs --url ... --hoist --chains | --apply-chains
 * --reasons tallies what blocks the rest; --runtime-only lists the unmapped
 * runtime classes doing it (each wants a RUNTIME_ON entry). --hoist lets a run
 * continue past an unmovable rule and moves that rule to just after the block
 * (it crosses only rules that become layered, so no unlayered rule changes order
 * against another); a run still ends at any at-rule and at a section banner. --fix-audit takes a
 * failing layered rule back out (splitting its block); run it until the audit
 * reports 0, since a rule leaving the layer can now beat others in it.
 * --chains lists the `:where(:not(:<state>))` edits that would free a state rule
 * (`:hover`, `:focus`, `:focus-visible`, `:active`, or the `.active` class, which
 * gets `:where(:not(.active))`) blocked only by unlayered
 * competitors naming the SAME element; --apply-chains writes them, moving just the
 * declarations the state rule overrides into a split-off rule, then exits:
 * re-run with --write to place what they freed. Conflicts (and the audit) compare
 * longhands via overlap(): `border-left` meets `border-color`, `border-radius` never does.
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

// Do two properties set any of the same longhands? A family groups candidates;
// this decides, by expanding both to longhands: `border-left` and `border-color`
// share border-left-color, `border` never touches border-radius, `font` covers
// line-height. Logical sides (block/inline) count as both of their physical ones.
const SIDES = { top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'],
  block: ['top', 'bottom'], inline: ['left', 'right'], 'block-start': ['top', 'bottom'], 'block-end': ['top', 'bottom'],
  'inline-start': ['left', 'right'], 'inline-end': ['left', 'right'] };
const ALL4 = ['top', 'right', 'bottom', 'left'];
function longhands(prop) {
  const p = prop.replace(/^-webkit-(?!user)/, '');
  let m;
  if (p === 'border') return ALL4.flatMap((sd) => ['color', 'width', 'style'].map((k) => `border-${sd}-${k}`));
  if ((m = /^border-(color|width|style)$/.exec(p))) return ALL4.map((sd) => `border-${sd}-${m[1]}`);
  if ((m = /^border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)$/.exec(p)))
    return SIDES[m[1]].flatMap((sd) => ['color', 'width', 'style'].map((k) => `border-${sd}-${k}`));
  if ((m = /^border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)-(color|width|style)$/.exec(p)))
    return SIDES[m[1]].map((sd) => `border-${sd}-${m[2]}`);
  if (p === 'border-radius') return ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => `border-${c}-radius`);
  if ((m = /^(margin|padding|scroll-margin|scroll-padding)$/.exec(p))) return ALL4.map((sd) => `${m[1]}-${sd}`);
  if ((m = /^(margin|padding|scroll-margin|scroll-padding)-(block|inline|block-start|block-end|inline-start|inline-end)$/.exec(p)))
    return SIDES[m[2]].map((sd) => `${m[1]}-${sd}`);
  if (p === 'inset') return ALL4;
  if ((m = /^inset-(block|inline|block-start|block-end|inline-start|inline-end)$/.exec(p))) return SIDES[m[1]];
  if (p === 'outline') return ['outline-color', 'outline-width', 'outline-style'];
  if (p === 'gap' || p === 'grid-gap') return ['row-gap', 'column-gap'];
  if ((m = /^place-(items|content|self)$/.exec(p))) return [`align-${m[1]}`, `justify-${m[1]}`];
  if (p === 'flex') return ['flex-grow', 'flex-shrink', 'flex-basis'];
  if (p === 'flex-flow') return ['flex-direction', 'flex-wrap'];
  if (p === 'font') return ['font-*', 'line-height'];
  if (/^(background|transition|animation|grid|grid-template|overflow|text-decoration|list-style|columns|mask|text-emphasis)$/.test(p)) return [`${p}-*`, p];
  return [p];
}
function overlap(p, q) {
  if (p === q) return true;
  const a = longhands(p), b = longhands(q);
  const hit = (x, y) => x === y || (x.endsWith('-*') && (y.startsWith(x.slice(0, -1)) || y === x.slice(0, -2))) ;
  return a.some((x) => b.some((y) => hit(x, y) || hit(y, x)));
}

// ---- selectors ------------------------------------------------------------------
// Attributes JS writes on known elements only: a subject carrying one is that
// element (read off the code that writes it).
const ATTR_ON = {
  'data-docked': ['#fileBrowserPanel', '#approvalsDrawer', '#subagentsPanel', '#monitorPanel'], // panel-dock.js DOCK_PANELS
};
// the last compound of a selector, as text
const subjectText = (x) => x.text.split(/\s*[ >+~]\s*(?![^(]*\))/).pop();
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
function analyse(sel) {
  const out = [];
  sp((root) =>
    root.each((s) => {
      let a = 0, b = 0, c = 0;
      // Top-level nodes only: a pseudo function's arguments are counted by recursion.
      // (Never s.walk with `return false`: that stops the WHOLE walk, so everything
      // after a :where/:is/:not went uncounted.)
      s.nodes.forEach((n) => {
        if (n.type === 'id') a++;
        else if (n.type === 'class' || n.type === 'attribute') b++;
        else if (n.type === 'tag') c++;
        else if (n.type === 'pseudo') {
          if (n.value === ':where') return;
          if ([':not', ':is', ':has'].includes(n.value)) {
            let best = [0, 0, 0];
            n.nodes.forEach((arg) => {
              const r = analyse(arg.toString())[0];
              if (r && cmp(r.spec, best) > 0) best = r.spec;
            });
            a += best[0]; b += best[1]; c += best[2];
            return;
          }
          if (n.value.startsWith('::') || [':before', ':after', ':first-line', ':first-letter'].includes(n.value)) c++;
          else b++;
        }
      });
      const subject = [];
      for (let i = s.nodes.length - 1; i >= 0 && s.nodes[i].type !== 'combinator'; i--) subject.unshift(s.nodes[i]);
      const toks = new Set(), all = new Set(), conj = new Set(); // conj: classes chained on the subject itself (not :is alternatives)
      let tag = '', pseudoEl = '', typeVal = '';
      s.walk((m) => {
        if (m.type === 'class') all.add('.' + m.value);
        if (m.type === 'id') all.add('#' + m.value);
      });
      for (const n of subject) {
        if (n.type === 'tag') tag = n.value.toLowerCase();
        if (n.type === 'class') toks.add('.' + n.value), conj.add('.' + n.value);
        if (n.type === 'id') toks.add('#' + n.value);
        if (n.type === 'attribute' && ATTR_ON[n.attribute]) for (const t of ATTR_ON[n.attribute]) toks.add(t);
        if (n.type === 'attribute' && n.attribute === 'type' && n.operator === '=') typeVal = n.value.replace(/^['"]|['"]$/g, '');
        if (n.type === 'pseudo' && (n.value.startsWith('::') || [':before', ':after'].includes(n.value)))
          pseudoEl = n.value.replace(/^::?/, '');
        if (n.type === 'pseudo' && n.value === ':is')
          n.walk((m) => {
            if (m.type === 'class') toks.add('.' + m.value);
            if (m.type === 'id') toks.add('#' + m.value);
          });
      }
      const ctxToks = new Set([...all].filter((t) => !toks.has(t)));
      out.push({ spec: [a, b, c], toks, conj, tag, ctxToks, pseudoEl, typeVal, generic: toks.size === 0, text: s.toString().trim() });
    })
  ).processSync(sel);
  return out;
}
const atContext = (node) => {
  const m = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') m.push(`${p.name} ${p.params}`);
  return m;
};
// A nested rule's real selector: `&` stands for the parent, else it is a descendant.
function resolvedSelector(r) {
  if (r.parent?.type !== 'rule') return r.selector;
  const parent = resolvedSelector(r.parent);
  return r.selectors.map((c) => (c.includes('&') ? c.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${c}`)).join(', ');
}
function leafRules(root, file, offset) {
  const rules = [];
  let order = offset;
  root.walkRules((r) => {
    const c = atContext(r);
    if (c.some((x) => /^(keyframes|-webkit-keyframes|font-face)/.test(x))) return;
    const layers = c.filter((x) => x.startsWith('layer')).map((x) => x.slice(6));
    rules.push({ r, file, order: order++, layer: layers[0] || null, sels: analyse(resolvedSelector(r)),
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
const TYPE_OF = new Map(); // sampled <input> -> [type, id]
const ID_CLASSES = []; // [#id, .class] pairs seen on one sampled element
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
      const types = {};
      for (const e of all) if (e.tagName === 'INPUT') types[idx.get(e)] = [(e.getAttribute('type') || 'text').toLowerCase(), e.id];
      const ids = {};
      for (const e of all) if (e.id) for (const c of e.classList) (ids['#' + e.id] ||= {})['.' + c] = 1;
      const hits = {};
      for (const [orig, s] of list) {
        try {
          const m = [...document.querySelectorAll(s)].map((e) => idx.get(e));
          if (m.length) hits[orig] = m;
        } catch {
          // a selector the browser cannot query: no sample, static fallback
        }
      }
      return { hits, tags, types, ids };
    },
    [code, allSels.map((s) => [s, strip(s)])]
  );
  for (const [s, m] of Object.entries(res.hits)) {
    if (!sample.has(s)) sample.set(s, new Set());
    for (const i of m) sample.get(s).add(`${name}:${i}`);
  }
  for (const [i, t] of Object.entries(res.types)) TYPE_OF.set(`${name}:${i}`, t);
  for (const [id, cls] of Object.entries(res.ids)) for (const c of Object.keys(cls)) ID_CLASSES.push([id, c]);
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
// class -> tags it is given in the source: <tag class="a b"> in markup and templates,
// and `x = document.createElement('tag')` followed by `x.className = 'a b'`.
const SRC_TAGS = new Map();
const addTag = (cls, tag) => {
  for (const c of cls.split(/\s+/)) {
    if (!/^[a-zA-Z][\w-]*$/.test(c)) continue;
    if (!SRC_TAGS.has('.' + c)) SRC_TAGS.set('.' + c, new Set());
    SRC_TAGS.get('.' + c).add(tag.toLowerCase());
  }
};
for (const m of SRC.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\bclass\s*=\s*["']([^"'$<>]*)/g)) addTag(m[2], m[1]);
for (const m of SRC.matchAll(/(?:const|let|var)?\s*([\w$.]+)\s*=\s*document\.createElement(?:NS)?\(\s*(?:[^,)]*,\s*)?['"]([\w-]+)['"]\s*\)[;\s]*\n(?:[^\n]*\n){0,3}?\s*\1\.className\s*=\s*['"`]([^'"`$]*)/g))
  addTag(m[3], m[2]);

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
// An id and the classes its element carries meet (`#subagentsPanel` is `.subagents-panel`).
for (const [id, c] of ID_CLASSES) {
  note(id, c);
  note(c, id);
}
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
  '.tab-glow': ['.session-tab'], // app.js / tile-grid.js flash on the active tab
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
    if (!ADDED.has(t)) out.push(t, ...(t.includes('--') ? [t.split('--')[0]] : []));
    else if (RUNTIME_ON[t]) out.push(t, ...RUNTIME_ON[t]);
    else if (t.includes('--')) out.push(t, t.split('--')[0]);
    else unknown = true;
  }
  return out.length ? out : unknown ? null : out;
}

const EXCL_STATES = ['focus-visible', 'focus-within', 'focus', 'hover', 'active', 'checked', 'disabled'];
function exclusiveStates(x, y) {
  // `.active` and `:not(.active)` (the selected-tab convention) never meet either.
  const neg = /:not\(\.active\)/, negAll = /:not\(\.active\)/g, pos = /\.active(?![\w-])/;
  if ((neg.test(x) && pos.test(y.replace(negAll, ''))) || (neg.test(y) && pos.test(x.replace(negAll, '')))) return true;
  for (const st of EXCL_STATES) {
    const neg = new RegExp(`:not\\(:${st}\\)`);
    const pos = new RegExp(`:${st}(?![\\w-])`);
    if (neg.test(x) && pos.test(y.replace(new RegExp(neg.source, 'g'), ''))) return true;
    if (neg.test(y) && pos.test(x.replace(new RegExp(neg.source, 'g'), ''))) return true;
  }
  return false;
}
// Does selector text name token t (a whole class or id, not a prefix of a longer one)?
const hasTok = (text, t) => new RegExp(`${t.replace(/[.#]/, '\\$&')}(?![\\w-])`).test(text);
function reach(a, b) {
  if (a.pseudoEl !== b.pseudoEl) return false;
  if (a.tag && b.tag && a.tag !== b.tag) return false; // two different elements
  // :X and :not(:X) never hold at once on one element (X a state: hover, focus...)
  if (exclusiveStates(subjectText(a), subjectText(b))) return false;
  const sa = sample.get(a.text), sb = sample.get(b.text);
  if (a.typeVal && b.typeVal && a.typeVal !== b.typeVal) return false; // one element, one type at a time
  if (typeMismatch(a, sb, b) || typeMismatch(b, sa, a)) return false;
  if (sa && sb) {
    for (const e of sa) if (sb.has(e)) return true;
    if (a.generic || b.generic) return false; // a sampled element-wide rule: its sample is the answer
  }
  if (!a.generic && !b.generic) {
    const ia = identities(a), ib = identities(b);
    // A compound subject's element carries ALL its markup classes, so every pair
    // across the two subjects must be able to share one element.
    const own = (x) => [...x.conj].filter((t) => !ADDED.has(t));
    const pairOk = (t, u) => t === u || t.split('--')[0] === u.split('--')[0] || coOccur(t, u);
    if (own(a).some((t) => own(b).some((u) => !pairOk(t, u)))) return false;
    if (ia && ib) return ia.some((t) => ib.includes(t)) || ia.some((t) => ib.some((u) => coOccur(t, u)));
    // a runtime-only subject with no known element: judge it by its ancestors or tag
    const [g, x] = ia ? [b, a] : [a, b];
    if (!ia && !ib) return true;
    // ⚠️ Assumption, not proof: a rule scoped by an ancestor reaches only selectors
    // that name it. Without it nothing scoped could ever move (every `.x span`
    // would meet every span on the page); with it, a scoped rule on a runtime class
    // can miss a generic rule inside that scope, which is why hide utilities never
    // move (HIDE_UTILITY) and the probes stay the backstop.
    if (g.ctxToks.size) return [...g.ctxToks].some((t) => hasTok(x.text, t));
    if (g.tag) return tagMayBe(x, g.tag);
    return true;
  }
  if (a.generic && b.generic) return true;
  const [g, x] = a.generic ? [a, b] : [b, a];
  if (g.ctxToks.size) return [...g.ctxToks].some((t) => hasTok(x.text, t)); // see the assumption above
  if (!g.tag) return true;
  return tagMayBe(x, g.tag);
}
// `input[type="password"]` never meets a static input of another type: true when
// x names a type, y's sample is complete (y's classes appear in no JS markup, so
// nothing creates more of its elements), and every input y matched has another
// type that no script rewrites.
const JS_SRC = fs.readdirSync(PUB).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(PUB + f, 'utf8')).join('\n');
const JS_MARKUP_CLASSES = new Set(
  [...JS_SRC.matchAll(/class(?:Name)?\s*[=:]\s*\\?['"`]([^'"`]*)/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean).map((c) => '.' + c))
);
const TYPE_REWRITTEN = new Set(
  [...JS_SRC.matchAll(/(\w+)\.type\s*=\s*['"](?!button)/g)].flatMap((m) =>
    [...JS_SRC.matchAll(new RegExp(`\\b${m[1]}\\s*=\\s*document\\.getElementById\\(['"]([\\w-]+)`, 'g'))].map((n) => n[1])
  )
);
function typeMismatch(x, sy, y) {
  if (!x.typeVal || !sy || x.typeVal === y.typeVal) return false;
  if ([...y.toks, ...y.ctxToks].some((t) => ADDED.has(t) || JS_MARKUP_CLASSES.has(t))) return false;
  for (const e of sy) {
    const t = TYPE_OF.get(e);
    if (!t || t[0] === x.typeVal || TYPE_REWRITTEN.has(t[1])) return false;
  }
  return true;
}
// Can an element x's selector matches be a <tag>? From x's own tag, else the tags its
// classes are seen on (samples, then source), else any tag the markup gives a class.
function tagMayBe(x, tag) {
  if (x.tag) return x.tag === tag;
  const seen = [...new Set([...x.toks, ...(identities(x) || [])])].map((t) => TAGS.get(t) || SRC_TAGS.get(t)).filter(Boolean);
  if (seen.length) return seen.some((set) => set.has(tag));
  return !['body', 'html'].includes(tag) && CLASSED_TAGS.has(tag);
}

// ---- plan -------------------------------------------------------------------------
const skinStart = stylesRoot.toString().indexOf('Skin component rules (design-system phase 2)');
// Global = the selector IS the root/body/everything (`html[data-x]`, `*`); a
// `*` or `body` under a parent (`.menu > *`) is just a child selector.
const isGlobal = (x) => x.sels.some((s) => subjectText(s) === s.text.trim() && /^(:root|html|body|\*)([.:[]|$)/.test(s.text.trim()));
// A hide utility has to beat whatever component rule its element carries, so it
// stays unlayered.
// Only a bare one: `#cronModal .hidden` lands on any element in its scope; a
// `.x[hidden]` or `.x.hidden` is tied to its element and is checked like any rule.
const HIDE_UTILITY = (x) =>
  x.sels.some((t) => /^(\.hidden|\[hidden\])$/.test(subjectText(t))) && x.decls.some((d) => d.prop === 'display');
const cand = S.filter((x) => !x.layer && !HIDE_UTILITY(x) && x.r.source.start.offset < skinStart && x.decls.length &&
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
// X only applies in a state (:focus-visible, :hover...) that Y does not name. If an
// unmoved unlayered rule Z is exactly Y plus that state, outweighs X and sets every
// property Y sets in the family, Z wins that state before and after the move, so the
// X-vs-Y contest never decides anything.
const STATE = /:(focus-visible|focus|hover|active)\b/;
function masked(x, f, sx, y, sy) {
  const px = subjectText(sx).match(STATE);
  if (!px || STATE.test(subjectText(sy))) return false;
  const want = px[1] === 'focus-visible' ? ['focus', 'focus-visible'] : [px[1]];
  const yProps = new Set(y.decls.filter((d) => fam(d.prop) === f).map((d) => d.prop));
  for (const z of byFam.get(f) || []) {
    if (z.layer || moved.has(z)) continue;
    const zProps = new Set(z.decls.filter((d) => fam(d.prop) === f).map((d) => d.prop));
    if (![...yProps].every((p) => zProps.has(p))) continue;
    for (const sz of z.sels) {
      const m = subjectText(sz).match(STATE);
      if (!m || !want.includes(m[1]) || sz.text.replace(STATE, '') !== sy.text) continue;
      const c = cmp(sz.spec, sx.spec);
      if (c > 0 || (c === 0 && z.order > x.order)) return true;
    }
  }
  return false;
}
// --chains: a conflict that only exists in a state X needs (X `.a:hover` beats a
// stateless unlayered Y `.a`) is fixable without a visual change: Y's conflicting
// properties skip that state (`:where(:not(:hover))`, no specificity), and X
// already wins there today. Such conflicts no longer block; the edits they need
// are collected by stateFix() and applied with --apply-chains.
const CHAINS = args.includes('--chains') || args.includes('--apply-chains');
const FIX_STATE = /:(hover|focus-visible|focus|active)(?![\w-])/;
function stateFix(x, sx, y, sy) {
  if (!CHAINS || y.layer || y.decls.some((d) => d.important)) return null;
  // A pseudo state, or `.active`: the selected-item class competitors of the active
  // tab already skip with `:where(:not(.active))`.
  const own = (t) => t.replace(/:(not|where|is|has)\((?:[^()]|\([^()]*\))*\)/g, '');
  const m = subjectText(sx).match(FIX_STATE) || (/\.active(?![\w-])/.test(own(subjectText(sx))) ? [0, '.active'] : null);
  if (!m || STATE.test(own(subjectText(sy))) || sy.pseudoEl) return null;
  if (m[1] === '.active' && /\.active(?![\w-])/.test(subjectText(sy))) return null;
  // The edit takes Y off the element while X's state holds, so X must really be
  // styling Y's element then: reach() errs toward "may meet", which is safe for
  // blocking a move and wrong here. Require the two subjects to name the same
  // element: a shared class or id (a BEM modifier or runtime class counts as its
  // base), or the same tag.
  const toks = (t) => {
    const own = t.replace(/:(not|where|is|has)\((?:[^()]|\([^()]*\))*\)/g, '');
    const out = new Set(own.match(/[.#][\w-]+/g) || []);
    for (const c of [...out]) {
      if (c.includes('--')) out.add(c.split('--')[0]);
      for (const b of RUNTIME_ON[c] || []) out.add(b);
    }
    const tag = /^[a-z][\w-]*/.exec(own);
    if (tag) out.add(tag[0]);
    return out;
  };
  const tx = toks(subjectText(sx));
  if (![...toks(subjectText(sy))].some((t) => tx.has(t))) return null;
  return m[1];
}
function conflict(x, fixes) {
  for (const d of x.decls)
    for (const y of byFam.get(fam(d.prop)) || []) {
      if (y === x || moved.has(y)) continue;
      if (!y.decls.some((q) => !q.important && overlap(d.prop, q.prop))) continue;
      for (const sx of x.sels)
        for (const sy of y.sels) {
          if (!reach(sx, sy)) continue;
          const c = cmp(sx.spec, sy.spec);
          const xWinsInside = c > 0 || (c === 0 && x.order > y.order);
          // unlayered y: x beats it today (by weight) and would lose after the move.
          // y already in features: x beats it today (unlayered) and must still win inside the layer.
          if (y.layer === 'features' ? !xWinsInside : xWinsInside && !masked(x, fam(d.prop), sx, y, sy)) {
            const st = y.layer ? null : stateFix(x, sx, y, sy);
            if (st) {
              fixes?.push({ y, sel: y.sels.indexOf(sy), state: st, prop: d.prop });
              continue;
            }
            blockers.set(x, sy);
            return `${d.prop} vs ${y.file}:${y.r.source.start.line} ${sy.text.slice(0, 70)}`;
          }
        }
    }
  return null;
}
// --hoist: an unmovable rule no longer ends a run. It is moved to just after the
// block instead, so it crosses only rules that became layered (which it beats
// wherever it sits), and no unlayered rule changes order against another. Any
// at-rule (@media, @keyframes...) still ends a run: nothing crosses one.
const HOIST = args.includes('--hoist');
const BANNER = /={3,}|─{3,}|-{4,}|═{3,}/;
function runs() {
  const out = [];
  for (const parent of new Set([...moved].map((x) => x.r.parent))) {
    let run = [];
    for (const n of parent.nodes) {
      // with --hoist a section banner ends a run, so a block stays in its topic
      if (n.type === 'comment' && !(HOIST && BANNER.test(n.text))) continue;
      if (n.type === 'rule' && moved.has(ruleOf.get(n))) run.push(ruleOf.get(n));
      else if (HOIST && n.type === 'rule') continue;
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
const FIXES = [];
if (CHAINS) for (const x of moved) conflict(x, FIXES);
const count = (arr) => arr.reduce((n, x) => n + x.decls.length, 0);
console.log(`candidates ${cand.length} rules (${count(cand)} decls); movable in runs of >= ${MIN_RUN}: ${moved.size} rules (${count([...moved])} decls), ${runs().length} blocks`);
const auditBad = new Set();
if (args.includes('--audit') || args.includes('--fix-audit')) {
  // Every rule already in @layer features: does an unlayered rule now win over a
  // declaration it would lose to if the two were in the same cascade?
  let bad = 0;
  for (const x of S.filter((r) => r.layer === 'features' && HIDE_UTILITY(r))) {
    bad++;
    auditBad.add(x);
    console.log(`AUDIT ${x.file}:${x.r.source.start.line} ${x.r.selector.slice(0, 70)} is a hide utility; it must stay unlayered`);
  }
  for (const x of S.filter((r) => r.layer === 'features'))
    for (const d of x.decls)
      for (const y of byFam.get(fam(d.prop)) || []) {
        if (y.layer) continue;
        if (!y.decls.some((q) => !q.important && overlap(d.prop, q.prop))) continue;
        for (const sx of x.sels)
          for (const sy of y.sels) {
            if (!reach(sx, sy)) continue;
            const c = cmp(sx.spec, sy.spec);
            if ((c > 0 || (c === 0 && x.order > y.order)) && !masked(x, fam(d.prop), sx, y, sy)) {
              bad++;
              auditBad.add(x);
              console.log(`AUDIT ${x.file}:${x.r.source.start.line} ${sx.text.slice(0, 70)} { ${d.prop} } now loses to ${y.file}:${y.r.source.start.line} ${sy.text.slice(0, 70)}`);
            }
          }
      }
  console.log(`audit: ${bad} conflict(s)`);
}
const WHY = opt('why', null);
if (WHY) {
  // Follow the chain: why can this rule not move, and why can its blocker not move?
  const seen = new Set();
  let cur = S.find((x) => x.sels.some((t) => t.text.includes(WHY)));
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const isCand = cand.includes(cur);
    const why = !isCand ? 'not a candidate (layered, skin section, !important, global, @supports or mobile.css)' : moved.has(cur) ? 'MOVABLE' : reasons.get(cur) || 'short run (its neighbours cannot move)';
    console.log(`${cur.file}:${cur.r.source.start.line} ${cur.r.selector.replace(/\s+/g, ' ').slice(0, 80)}\n    -> ${why}`);
    const b = blockers.get(cur);
    if (!b || moved.has(cur)) break;
    cur = [...S, ...M].find((x) => x.sels.includes(b));
  }
}
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
if (CHAINS) {
  const edits = new Map(); // y -> Map(selector index -> Map(state -> Set(family)))
  for (const f of FIXES) {
    if (!edits.has(f.y)) edits.set(f.y, new Map());
    const bySel = edits.get(f.y);
    if (!bySel.has(f.sel)) bySel.set(f.sel, new Map());
    const byState = bySel.get(f.sel);
    if (!byState.has(f.state)) byState.set(f.state, new Set());
    byState.get(f.state).add(f.prop);
  }
  console.log(`state edits needed: ${[...edits.values()].reduce((n, m) => n + m.size, 0)} selector(s) in ${edits.size} rule(s)`);
  for (const [y, bySel] of edits)
    for (const [i, byState] of bySel)
      console.log(`  ${y.file}:${y.r.source.start.line} ${y.r.selectors[i].replace(/\s+/g, ' ').slice(0, 70)} skips ${[...byState].map(([st, fs]) => `:${st} for ${[...fs].join('/')}`).join(', ')}`);
  if (args.includes('--apply-chains')) {
    for (const [y, bySel] of edits) {
      const r = y.r;
      const sels = r.selectors;
      const decls = r.nodes.filter((n) => n.type === 'decl');
      const out = [];
      const rest = sels.filter((_, i) => !bySel.has(i));
      if (rest.length) out.push({ sels: rest, decls });
      for (const [i, byState] of bySel) {
        // group this selector's declarations by the states they must skip
        const groups = new Map();
        for (const d of decls) {
          const states = [...byState].filter(([, ps]) => [...ps].some((p) => overlap(p, d.prop))).map(([st]) => st).sort();
          const key = states.join(',');
          if (!groups.has(key)) groups.set(key, { states, decls: [] });
          groups.get(key).decls.push(d);
        }
        for (const { states, decls: ds } of groups.values())
          out.push({ sels: [sels[i] + states.map((st) => `:where(:not(${st.startsWith('.') ? st : ':' + st}))`).join('')], decls: ds });
      }
      let anchor = r;
      out.forEach((o, k) => {
        const rule = k === 0 ? r : r.clone({ nodes: [] });
        if (k === 0) r.removeAll();
        rule.selector = o.sels.join(',\n');
        for (const d of o.decls) rule.append(d.clone());
        if (k > 0) {
          rule.raws.before = '\n\n' + (r.raws.before || '').match(/[ \t]*$/)[0];
          anchor.after(rule);
        }
        anchor = rule;
      });
    }
    fs.writeFileSync(PUB + 'styles.css', stylesRoot.toString());
    fs.writeFileSync(PUB + 'mobile.css', mobileRoot.toString());
    console.log('applied; re-run the planner (it re-samples) to place the freed rules');
    process.exit(0);
  }
}
if (args.includes('--fix-audit') && auditBad.size) {
  // Take each conflicting rule back out of its block (splitting the block around it);
  // run again until the audit is clean, since an unlayered rule can now beat others.
  for (const x of auditBad) {
    const block = x.r.parent;
    const nodes = block.nodes;
    let i = nodes.indexOf(x.r);
    const after = nodes.slice(i + 1);
    // comments right before the rule describe it: they leave the block with it
    const lead = [];
    while (i > 0 && nodes[i - 1].type === 'comment') lead.unshift(nodes[--i]);
    if (after.some((n) => n.type === 'rule')) {
      const tail = postcss.atRule({ name: 'layer', params: 'features', raws: { afterName: ' ', between: ' ', after: '\n' } });
      block.after(tail);
      for (const n of after) tail.append(n);
    } else for (const n of after) block.after(n);
    block.after(x.r);
    for (const c of lead) x.r.before(c);
    if (!block.nodes.some((n) => n.type === 'rule')) {
      for (const n of [...block.nodes].reverse()) block.after(n);
      block.remove();
    }
  }
  stripLabels(stylesRoot);
  fs.writeFileSync(PUB + 'styles.css', labelClosers(stylesRoot.toString().replace(/@layer features \{\n\n/g, '@layer features {\n')));
  console.log(`took ${auditBad.size} rule(s) out of the layer; run --audit again`);
  process.exit(0);
}
function stripLabels(root) {
  root.walkComments((c) => {
    if (c.text === '@layer features') c.remove();
  });
}
if (args.includes('--write')) {
  for (const run of runs()) {
    const layer = postcss.atRule({ name: 'layer', params: 'features', raws: { afterName: ' ', between: ' ', after: '\n' } });
    const first = run[0].r;
    const nodes = first.parent.nodes;
    const from = nodes.indexOf(first);
    let to = nodes.indexOf(run[run.length - 1].r);
    // a comment on the same line as the last rule's closing brace belongs to it
    const trail = nodes[to + 1];
    if (trail?.type === 'comment' && !trail.raws.before.includes('\n')) to++;
    const span = nodes.slice(from, to + 1);
    first.before(layer);
    if (!HOIST) {
      for (const n of span) layer.append(n);
      continue;
    }
    // Comments go with the rule they lead into; a same-line trailing comment
    // stays with the rule before it.
    const groups = [];
    let pending = [];
    for (const n of span) {
      if (n.type === 'comment') {
        if (!n.raws.before.includes('\n') && groups.length && !pending.length) groups[groups.length - 1].nodes.push(n);
        else pending.push(n);
        continue;
      }
      groups.push({ moved: moved.has(ruleOf.get(n)), nodes: [...pending, n] });
      pending = [];
    }
    // postcss resets a moved node's leading whitespace: keep each one's own
    const before = new Map(span.map((n) => [n, n.raws.before]));
    for (const g of groups) if (g.moved) for (const n of g.nodes) layer.append(n);
    let anchor = layer;
    for (const g of groups)
      if (!g.moved)
        for (const n of g.nodes) {
          anchor.after(n);
          anchor = n;
        }
    for (const n of pending) {
      anchor.after(n);
      anchor = n;
    }
    for (const [n, b] of before) n.raws.before = b;
    // the first node in the block and the first after it start their own paragraph
    const indent = (n) => (n.raws.before || '').match(/[ \t]*$/)[0];
    const firstIn = layer.first;
    if (firstIn) firstIn.raws.before = '\n' + indent(firstIn);
    const firstAfter = layer.next();
    if (firstAfter && firstAfter !== layer) firstAfter.raws.before = '\n\n' + indent(firstAfter);
  }
  // A block that fills its @media whole reads better outside it:
  // @layer features { @media (...) { ... } } is the same cascade.
  stylesRoot.walkAtRules('layer', (layer) => {
    const media = layer.parent;
    if (layer.params !== 'features' || media?.type !== 'atrule' || media.name !== 'media' || media.parent?.type !== 'root') return;
    if (media.nodes.some((n) => n !== layer && n.type !== 'comment')) return;
    for (const n of [...layer.nodes]) layer.before(n);
    layer.remove();
    const outer = postcss.atRule({ name: 'layer', params: 'features', raws: { afterName: ' ', between: ' ', after: '\n' } });
    media.before(outer);
    outer.append(media);
  });
  stripLabels(stylesRoot);
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
  // a block nested in an @media closes at its opener's indent
  root.walkAtRules('layer', (a) => {
    if (a.params === 'features' && a.parent?.type !== 'root') a.raws.after = '\n  ';
  });
  return root.toString().replace(/\n( *)\}\s*\/\* @layer features \*\//g, '\n$1} /* @layer features */');
}
