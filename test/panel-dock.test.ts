// Port: none (static analysis of the shipped frontend files).
//
// The panel dock (panel-dock.js, design-system phase 4c) docks the Files, Inbox,
// Subagents and Monitor panels into one right column by watching each panel's
// own open marker; it never re-parents them. These guards pin the seams it
// depends on: the panel ids, the init call, the drag guard that keeps a docked
// panel in place, and the CSS that only applies under html.dock-open.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(join(PUBLIC, f), 'utf8');

describe('panel dock', () => {
  it('docks exactly the four right-side panels, each present in index.html', () => {
    const src = read('panel-dock.js');
    const ids = [...src.matchAll(/^\s+el: '([^']+)',$/gm)].map((m) => m[1]);
    expect(ids).toEqual(['fileBrowserPanel', 'approvalsDrawer', 'subagentsPanel', 'monitorPanel']);
    const html = read('index.html');
    for (const id of ids) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('id="panelDockTabs"');
    expect(html).toContain('<script defer src="panel-dock.js"></script>');
  });

  it('never docks a detached (floating) panel', () => {
    expect(read('panel-dock.js')).toContain("!el.classList.contains('detached')");
  });

  it('starts from app init', () => {
    expect(read('app.js')).toContain('this.initPanelDock?.();');
  });

  it('a docked panel cannot be dragged out of the column', () => {
    const src = read('subagent-windows.js');
    expect(src.match(/win\.dataset\.docked\) return;/g)?.length).toBe(2);
  });

  it('docked layout rules live only under html.dock-open, which only the JS sets', () => {
    const css = read('styles.css');
    for (const m of css.matchAll(/^[^\n{]*\[data-docked[^\n{]*\{/gm)) expect(m[0]).toMatch(/^html\.dock-open /);
    // The dock opens the shell's panel column (css/layout.css) instead of a margin on main.
    expect(css).toMatch(/html\.dock-open \{[^}]*--cm-panel-w: var\(--dock-w\);/);
    expect(css).toMatch(/html\.dock-open \[data-docked\] \{\s*grid-area: panel;/);
    expect(css).not.toMatch(/html\.dock-open \.main \{/);
  });
});
