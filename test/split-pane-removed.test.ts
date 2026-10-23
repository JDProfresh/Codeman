/**
 * @fileoverview The split pane (the header Split button's second session,
 * "Pane B", terminal-split.js) was removed in design-system phase 4d: the tile
 * grid supersedes it. A static guard that it stays gone, and that the retired
 * per-device `showSplitButton` key is still kept out of the settings PUT (a
 * stored settings blob may carry it, and SettingsUpdateSchema is .strict()).
 *
 * Port: none (pure static analysis).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PUBLIC = fileURLToPath(new URL('../src/web/public/', import.meta.url));
const read = (file: string) => readFileSync(join(PUBLIC, file), 'utf8');

describe('the split pane is gone', () => {
  const html = read('index.html');
  const constants = read('constants.js');

  it('index.html has no Split button, no Split settings chip and no terminal-split.js script', () => {
    expect(html).not.toContain('btn-split');
    expect(html).not.toContain('openSplitPicker');
    expect(html).not.toContain('appSettingsShowSplitButton');
    expect(html).not.toContain('terminal-split.js');
    expect(existsSync(join(PUBLIC, 'terminal-split.js'))).toBe(false);
  });

  it('constants.js publishes no window.CodemanSplitPane; the width gate lives on window.CodemanTileGrid', () => {
    expect(constants).not.toContain('CodemanSplitPane');
    expect(constants).not.toContain('SPLIT_PANE_MIN_WIDTH');
    expect(constants).toContain('const TILE_GRID_MIN_WIDTH = 1180;');
    const tileGrid = constants.slice(constants.indexOf('window.CodemanTileGrid = {'));
    expect(tileGrid.slice(0, tileGrid.indexOf('};'))).toContain('TILE_GRID_MIN_WIDTH,');
  });

  it('no frontend module reaches for the split any more', () => {
    for (const file of ['app.js', 'terminal-ui.js', 'tile-grid.js', 'terminal-tile.js', 'settings-ui.js']) {
      const src = read(file);
      for (const name of ['_splitPane', '_splitSessionId', 'closeSplitPane', 'openSplitPane', 'mergeSplit']) {
        expect(src, `${file}: ${name}`).not.toContain(name);
      }
    }
  });

  it('the retired showSplitButton key stays a display key and stays stripped from the settings PUT', () => {
    const settingsUi = read('settings-ui.js');
    const start = settingsUi.indexOf('const displayKeys = new Set([');
    expect(settingsUi.slice(start, settingsUi.indexOf('])', start))).toContain("'showSplitButton'");
    expect(settingsUi).toContain('showSplitButton: _ssp,');
    expect(settingsUi).not.toContain('appSettingsShowSplitButton');
  });
});
