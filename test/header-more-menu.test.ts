// Port: none (static analysis of the shipped frontend files).
//
// The header More (⋯) menu (header-more.js, design-system phase 4) runs a row by
// clicking the real control and pins it by flipping that control's per-device
// show* key. Both halves break silently: a renamed button leaves a dead row, and
// a synced key flipped only in localStorage is overwritten by the next server
// settings merge. These guards keep the registry honest against index.html and
// settings-ui.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(join(PUBLIC, f), 'utf8');

function registry(): { id: string; key: string; button?: string; font?: boolean }[] {
  const src = read('header-more.js');
  const block = src.match(/const HEADER_MORE_ITEMS = \[([\s\S]*?)\n\];/);
  expect(block, 'HEADER_MORE_ITEMS not found').toBeTruthy();
  return [...block![1].matchAll(/\{ id: '([^']+)'[^}]*?key: '([^']+)'[^}]*\}/g)].map((m) => ({
    id: m[1],
    key: m[2],
    button: m[0].match(/button: '([^']+)'/)?.[1],
    font: /font: true/.test(m[0]),
  }));
}

function displayKeys(): Set<string> {
  const src = read('settings-ui.js');
  const block = src.match(/const displayKeys = new Set\(\[([\s\S]*?)\]\);/);
  expect(block, 'displayKeys set not found in settings-ui.js').toBeTruthy();
  return new Set([...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

describe('header More menu registry', () => {
  it('pins only per-device keys, so a pin never needs a server write', () => {
    const keys = displayKeys();
    for (const item of registry()) expect(keys.has(item.key), `${item.id}: ${item.key}`).toBe(true);
  });

  it('every row clicks a control that exists in index.html', () => {
    const html = read('index.html');
    for (const item of registry()) {
      if (item.font) continue;
      const sel = item.button!;
      const found = sel.startsWith('#')
        ? html.includes(`id="${sel.slice(1)}"`)
        : new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b`).test(html);
      expect(found, `${item.id}: ${sel}`).toBe(true);
    }
  });

  it('lists the approved defaults: Files, Search and Tiles pinned, the rest in More', () => {
    const src = read('header-more.js');
    const pinnedByDefault = [...src.matchAll(/\{ id: '([^']+)'[^}]*fallback: true/g)].map((m) => m[1]);
    expect(pinnedByDefault).toEqual(['files', 'search', 'tiles']);
    for (const id of ['away', 'cron', 'lifecycle', 'font']) expect(registry().some((i) => i.id === id)).toBe(true);
  });

  it('Search (session manager) defaults to pinned on desktop', () => {
    const src = read('settings-ui.js');
    expect(src).toContain('settings.showSessionButton ?? defaults.showSessionButton ?? true');
  });

  it('Escape closes the menu alone before the global panel sweep', () => {
    const app = read('app.js');
    const esc = app.indexOf('if (this._headerMoreMenu)');
    expect(esc).toBeGreaterThan(-1);
    expect(esc).toBeLessThan(app.indexOf('this.closeAllPanels();', esc));
  });
});

describe('universal reset layering', () => {
  it('sits in @layer base, so the kit in @layer components keeps its padding', () => {
    const css = read('styles.css');
    expect(css).toMatch(/@layer base \{\s*\* \{ box-sizing: border-box; margin: 0; padding: 0; \}\s*\}/);
    expect(css.replace(/@layer base \{[\s\S]*?\n\}/, '')).not.toMatch(/^\* \{[^}]*padding: 0/m);
  });
});
