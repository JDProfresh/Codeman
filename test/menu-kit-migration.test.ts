/**
 * @fileoverview The floating context menus are the kit's .cm-menu--popover
 * (design-system phase 3, board S03).
 *
 * The tab rail's ⋯ menu (and the group menu that shares its builder), the
 * Session Manager's row menu and the Tiles count menu each carried their own
 * box, item, hover and note rules. They now build kit markup: `.cm-menu
 * .cm-menu--popover`, `.cm-menu__item` (`--danger`, `--stacked` with a
 * `.cm-menu__sub` line), `.cm-menu__heading`, `.cm-menu__sep` and
 * `.cm-menu__note`. Each keeps its legacy class as a hook for its own layer
 * (z-index) and the tests and code that find it, never for looks. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(resolve(PUBLIC, f), 'utf8');
const styles = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('context menus on the kit', () => {
  it.each([
    ['tab-rail-resize.js', "'cm-menu cm-menu--popover tab-rail-action-menu'"],
    ['app.js', "'cm-menu cm-menu--popover tab-rail-action-menu tab-layout-group-action-menu'"],
    ['terminal-ui.js', "'cm-menu cm-menu--popover session-row-menu'"],
    ['tile-grid.js', "'cm-menu cm-menu--popover tile-count-menu'"],
  ])('%s builds a kit popover', (file, cls) => {
    expect(read(file)).toContain(`menu.className = ${cls};`);
  });

  it('items, notes and headings are kit parts', () => {
    expect(read('tab-rail-resize.js')).toContain("'cm-menu__item cm-menu__item--danger' : 'cm-menu__item'");
    expect(read('tab-rail-resize.js')).toContain("note.className = 'cm-menu__note tab-rail-action-menu-note';");
    expect(read('terminal-ui.js')).toContain("btn.className = 'cm-menu__item cm-menu__item--stacked';");
    expect(read('terminal-ui.js')).toContain("sub.className = 'cm-menu__sub';");
    const tiles = read('tile-grid.js');
    expect(tiles).toContain("heading.className = 'cm-menu__heading cm-label';");
    expect(tiles).toContain("item.className = 'cm-menu__item tile-count-item';");
    expect(tiles).toContain("hint.className = 'cm-menu__note tile-count-hint';");
  });

  it('the legacy menus keep only their layer', () => {
    for (const sel of ['tab-rail-action-menu', 'session-row-menu', 'tile-count-menu']) {
      const body = styles.match(new RegExp(`(^|\\n)\\.${sel} \\{([^}]*)\\}`))?.[2] ?? '';
      expect(body, sel).toMatch(/z-index/);
      expect(body, sel).not.toMatch(/background|border|padding|box-shadow|min-width/);
    }
    for (const gone of [
      /\.tab-rail-action-menu button/,
      /\.tab-rail-action-menu \.danger/,
      /\.tab-rail-action-menu-note/,
      /\.session-row-menu-item/,
      /\.session-row-menu-sublabel/,
      /\.tile-count-heading/,
      /\.tile-count-hint/,
      /\.tile-count-item(:hover|:disabled| \{)/,
    ]) {
      expect(styles).not.toMatch(gone);
    }
  });
});
