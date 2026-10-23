#!/usr/bin/env node
/**
 * @fileoverview Computed-style diff between two running Codeman servers.
 *
 * The verification tool for design-system work (docs/design-system.md): load the
 * same page on a BASE server (the commit before your change) and a CANDIDATE
 * server (your working tree), and compare every element's computed style, per
 * skin x viewport x state. A stylesheet refactor that should not change pixels
 * must report no groups; one that should (a token normalization, a component
 * migration) reports exactly the groups you expect and nothing else.
 *
 * Covered: all 7 skins; desktop 1440, tablet 820 (touch), phone 393 (touch,
 * mobile); the page at rest; every element with :hover/:focus/:focus-visible
 * forced; ::before/::after; the Run button + gear in every CLI mode, at rest and
 * :active; a working and an exited tab dot. Live data (CPU/MEM rings, xterm's
 * fading scrollbar, transitions) is masked.
 *
 * Typical run (two isolated instances, so neither touches a real session):
 *   git worktree add ../cm-base HEAD            # the commit to compare against
 *   (cd ../cm-base && ln -s ../Codeman/node_modules && cp -n src/web/public/vendor/* ../cm-base/src/web/public/vendor/)
 *   (cd ../cm-base && CODEMAN_INSTANCE=diffbase npx tsx src/index.ts web --port 3172 &)
 *   CODEMAN_INSTANCE=diffcand npx tsx src/index.ts web --port 3173 &
 *   # give both the same sessions (POST /api/sessions + /shell), then:
 *   node scripts/css-style-diff.mjs --base http://127.0.0.1:3172 --cand http://127.0.0.1:3173
 *
 * Options: --skins a,b  --viewports desktop,tablet,phone  --raw (every row, not
 * grouped)  --limit N (rows per combination with --raw).
 * Exit code: 0 when nothing differs, 1 otherwise.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = opt('base', 'http://127.0.0.1:3172');
const CAND = opt('cand', 'http://127.0.0.1:3173');
const SKINS = opt(
  'skins',
  'daylight-blue,daylight-green,og,paper-gray,solarized-light,catppuccin-latte,rose-pine-dawn'
).split(',');
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  phone: { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
};
const VPS = opt('viewports', 'desktop,tablet,phone').split(',');
const RAW = args.includes('--raw');
const LIMIT = Number(opt('limit', RAW ? 40 : 1e9));
const MODES = [
  'claude',
  'codex',
  'opencode',
  'gemini',
  'antigravity',
  'pi',
  'grok',
  'deepseek',
  'omp',
  'copilot',
  'shell',
];
const PROPS = [
  'color',
  'background-color',
  'background-image',
  'background-clip',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-bottom-style',
  'border-top-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'text-shadow',
  'filter',
  'backdrop-filter',
  'opacity',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
  'fill',
  'stroke',
  'caret-color',
  'accent-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'display',
  'visibility',
  'position',
  'z-index',
  'order',
  'flex-direction',
  'gap',
  'align-items',
  'justify-content',
  'cursor',
  'pointer-events',
  'transform',
  'animation-name',
  'color-scheme',
  'scrollbar-color',
  'content',
  'mix-blend-mode',
];

const executablePath = ['/opt/pw-browsers/chromium', process.env.PW_CHROMIUM].find((p) => p && existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function open(url, skin, vp) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.addInitScript((s) => {
    try {
      localStorage.setItem('codeman:skin', s);
    } catch {}
  }, skin);
  const page = await ctx.newPage();
  await page.goto(url + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.evaluate((s) => {
    document.querySelectorAll('.toast-container, #toastContainer').forEach((t) => (t.innerHTML = ''));
    // The app-settings blob wins over codeman:skin, so set the attribute last.
    document.documentElement.setAttribute('data-skin', s);
    const st = document.createElement('style');
    st.textContent = '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }';
    document.head.appendChild(st);
    const tabs = document.querySelectorAll('.session-tab');
    tabs[0]?.querySelector('.tab-status')?.classList.add('busy');
    if (tabs[1]) {
      tabs[1].classList.add('tab-agent-exited');
      tabs[1].querySelector('.tab-status')?.classList.add('busy');
    }
  }, skin);
  await page.waitForTimeout(150);
  if ((await page.evaluate(() => document.documentElement.dataset.skin)) !== skin)
    throw new Error(`skin ${skin} not applied`);
  return { ctx, page };
}

function snap(page) {
  return page.evaluate((props) => {
    const els = [...document.querySelectorAll('body *')].filter(
      (e) => !e.closest('.xterm-rows, .xterm-helpers, .xterm-scrollable-element > .scrollbar, canvas, svg text')
    );
    const sig = [];
    const rows = [];
    for (const el of els) {
      const cls = typeof el.className === 'string' ? el.className : '';
      sig.push(
        `${el.tagName}#${el.id}.${cls
          .split(/\s+/)
          .filter((c) => c && !/^(active|focused|selected|hover|anim|enter|leave|fade|visible|invisible)$/.test(c))
          .sort()
          .join('.')}`
      );
      const live = el.classList.contains('stat-ring') || /Ring$/.test(el.id);
      rows.push(
        [null, '::before', '::after'].map((ps) => {
          const cs = getComputedStyle(el, ps);
          if (ps && cs.content === 'none') return '';
          return props
            .map((p) => p + ':' + (live && p === 'background-image' ? '~' : cs.getPropertyValue(p)))
            .join(';');
        })
      );
    }
    return { sig, rows };
  }, PROPS);
}

async function forceStates(page, selector, states) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
  for (let i = 0; i < nodeIds.length; i += 200) {
    await Promise.all(
      nodeIds
        .slice(i, i + 200)
        .map((nodeId) => cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states }).catch(() => {}))
    );
  }
  await page.waitForTimeout(300);
}

async function snapModes(page, active) {
  if (active) await forceStates(page, '#runBtn, .btn-run-gear, .btn-enter', ['active', 'hover']);
  return page.evaluate((modes) => {
    const els = [
      document.getElementById('runBtn'),
      document.querySelector('.toolbar .btn-run-gear'),
      document.querySelector('.btn-enter'),
    ].filter(Boolean);
    const props = [
      'color',
      'background-color',
      'background-image',
      'border-top-color',
      'box-shadow',
      'filter',
      'padding-left',
      'display',
    ];
    const sig = [];
    const rows = [];
    for (const m of modes) {
      for (const el of els.slice(0, 2)) el.className = el.className.replace(/\bmode-\S+/g, '').trim() + ' mode-' + m;
      for (const el of els) {
        const cs = getComputedStyle(el);
        sig.push(
          `mode-${m}:${
            el.id ||
            el.className
              .split(/\s+/)
              .filter((c) => !c.startsWith('mode-'))
              .join('.')
          }`
        );
        rows.push([props.map((p) => p + ':' + cs.getPropertyValue(p)).join(';'), '', '']);
      }
    }
    return { sig, rows };
  }, MODES);
}

const groups = new Map();
const raw = [];
let total = 0;
function diff(a, b, label) {
  if (a.sig.length !== b.sig.length || a.sig.some((s, i) => s !== b.sig[i])) {
    const bad = a.sig.map((s, i) => [s, b.sig[i]]).filter(([x, y]) => x !== y);
    raw.push(
      `${label}: DOM differs (${a.sig.length} vs ${b.sig.length}) e.g. ${bad
        .slice(0, 3)
        .map(([x, y]) => `${x} / ${y}`)
        .join(' ; ')}`
    );
    total++;
    return;
  }
  let n = 0;
  for (let i = 0; i < a.rows.length; i++) {
    for (let k = 0; k < 3; k++) {
      if (a.rows[i][k] === b.rows[i][k]) continue;
      n++;
      total++;
      const parse = (s) =>
        new Map(s.split(';').map((kv) => [kv.slice(0, kv.indexOf(':')), kv.slice(kv.indexOf(':') + 1)]));
      const ma = parse(a.rows[i][k]);
      const changes = [...parse(b.rows[i][k])]
        .filter(([p, v]) => ma.get(p) !== v)
        .map(([p, v]) => `${p}: ${ma.get(p)} -> ${v}`);
      const el = a.sig[i].replace(/#[A-Za-z0-9_-]+\./, '#.') + ['', '::before', '::after'][k];
      const key = `${el} | ${changes
        .map((c) => c.split(':')[0])
        .sort()
        .slice(0, 4)
        .join(',')}`;
      const g = groups.get(key) || { n: 0, where: new Set(), example: changes.slice(0, 4).join(' | ') };
      g.n++;
      g.where.add(label.replace(/^\[|\]$/g, ''));
      groups.set(key, g);
      if (RAW && n <= LIMIT) raw.push(`${label} ${a.sig[i]}${['', '::before', '::after'][k]}  ${changes.join(' | ')}`);
    }
  }
}

for (const vp of VPS) {
  for (const skin of SKINS) {
    let A = await open(BASE, skin, vp);
    let B = await open(CAND, skin, vp);
    diff(await snap(A.page), await snap(B.page), `[${vp}/${skin}/rest]`);
    for (const active of [false, true]) {
      diff(
        await snapModes(A.page, active),
        await snapModes(B.page, active),
        `[${vp}/${skin}/modes${active ? '-active' : ''}]`
      );
    }
    await A.ctx.close();
    await B.ctx.close();
    A = await open(BASE, skin, vp);
    B = await open(CAND, skin, vp);
    await forceStates(A.page, 'body *', ['hover', 'focus', 'focus-visible']);
    await forceStates(B.page, 'body *', ['hover', 'focus', 'focus-visible']);
    diff(await snap(A.page), await snap(B.page), `[${vp}/${skin}/hover]`);
    await A.ctx.close();
    await B.ctx.close();
  }
}
await browser.close();

if (RAW) console.log(raw.join('\n'));
else {
  for (const r of raw.filter((l) => l.includes('DOM differs'))) console.log(r);
  const sorted = [...groups].sort((x, y) => y[1].n - x[1].n);
  for (const [key, g] of sorted) {
    const vps = [...new Set([...g.where].map((w) => w.split('/')[0]))].join(',');
    const skins = new Set([...g.where].map((w) => w.split('/')[1])).size;
    const states = [...new Set([...g.where].map((w) => w.split('/')[2]))].join(',');
    console.log(
      `${String(g.n).padStart(5)}  ${key.split(' | ')[0].slice(0, 60).padEnd(60)} ${vps} ${skins}sk ${states}\n       ${g.example.slice(0, 220)}`
    );
  }
  console.log(`${groups.size} groups`);
}
console.log(`TOTAL differing element-states: ${total}`);
process.exit(total ? 1 : 0);
