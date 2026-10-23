// Port: none (static analysis of the shipped frontend files).
//
// The app shell (design-system phase 4, board S04): .app is the .cm-shell grid in
// css/layout.css with header / banners / main / tabs / panel / toolbar areas. The
// panel dock (panel-dock.js) docks into the panel column, so every dockable panel
// and the dock's tab strip must be a direct child of the shell, and the banner
// strips stack inside one region instead of each sitting in the flow on its own.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'src/web/public');
const read = (f: string) => readFileSync(join(PUBLIC, f), 'utf8');

/** Direct children of the .app shell, by id or first class, in document order. */
function shellChildren(): string[] {
  const html = read('index.html');
  const start = html.indexOf('<div class="app cm-shell">');
  expect(start, '.app.cm-shell not found').toBeGreaterThan(-1);
  const out: string[] = [];
  let depth = 0;
  const re = /<(\/?)(div|header|main|footer|aside|section|nav)\b([^>]*)>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1]) {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1) {
      const id = m[3].match(/id="([^"]+)"/)?.[1];
      const cls = m[3].match(/class="([^"]+)"/)?.[1].split(/\s+/)[0];
      out.push(id ? `#${id}` : `.${cls}`);
    }
    if (!/\/\s*$/.test(m[3])) depth++;
  }
  return out;
}

describe('app shell', () => {
  it('lays the app out as the named-area grid', () => {
    const css = read('css/layout.css');
    expect(css).toMatch(/@layer layout \{/);
    expect(css).toMatch(/\.cm-shell \{[^}]*display: grid;/);
    for (const area of ['header', 'banners', 'main', 'toolbar']) expect(css).toContain(`grid-area: ${area};`);
    expect(css).toContain("'main panel'");
    expect(css).toContain('var(--cm-panel-w, 0px)');
    expect(read('styles.css')).not.toMatch(/^\.app \{[^}]*display: flex;/m);
  });

  it('keeps every dockable panel and the dock strip a direct child of the shell', () => {
    const kids = shellChildren();
    for (const id of ['#fileBrowserPanel', '#approvalsDrawer', '#subagentsPanel', '#monitorPanel', '#panelDockTabs']) {
      expect(kids, id).toContain(id);
    }
  });

  it('stacks the banner strips in one region between the header and main', () => {
    const kids = shellChildren();
    expect(kids.slice(0, 3)).toEqual(['.header', '.cm-region', '.main']);
    const html = read('index.html');
    const region = html.slice(html.indexOf('cm-region--banners'), html.indexOf('<main class="main">'));
    for (const id of ['offlineBanner', 'hostWakeBanner', 'rebootRestoreBanner', 'timerBanner', 'respawnBanner']) {
      expect(region).toContain(`id="${id}"`);
    }
  });

  it('ships layout.css like the other layered sheets', () => {
    const html = read('index.html');
    expect(html.indexOf('href="css/layout.css"')).toBeGreaterThan(html.indexOf('href="css/components.css"'));
    const build = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
    expect(build).toContain("'css/layout.css',");
    expect(build).toContain('dist/web/public/css/layout.css --minify');
  });
});
