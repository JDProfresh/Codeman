/**
 * @fileoverview The right-side panels draw their chrome with the kit's .cm-panel
 * parts (design-system phase 3, board S03 "one family per PR").
 *
 * Files, Inbox, Subagents, Monitor and Ultracode each used to carry their own
 * header/title/actions rules, with four different paddings, title sizes and
 * action gaps. They now share `.cm-panel__head` (the Inbox's tab strip is the
 * `--tabs` variant), `.cm-panel__title`, `.cm-panel__actions` and
 * `.cm-panel__body`. A legacy class stays on the markup only as a hook (the
 * Files drag handle, the detached gradient, the docked cursor), never with
 * layout rules of its own. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const html = readFileSync(resolve(PUBLIC, 'index.html'), 'utf8');
const styles = readFileSync(resolve(PUBLIC, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const kit = readFileSync(resolve(PUBLIC, 'css/components.css'), 'utf8');

/** The markup from a panel's opening tag up to its body. */
function panel(id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  const end = html.indexOf('cm-panel__body', at);
  expect(end, `${id} has a .cm-panel__body`).toBeGreaterThan(at);
  return html.slice(at, end);
}

describe('panels on the kit', () => {
  it.each(['fileBrowserPanel', 'subagentsPanel', 'monitorPanel', 'ultracodeAgentsPanel'])(
    '%s has a kit head with a title and actions',
    (id) => {
      const markup = panel(id);
      expect(markup).toMatch(/class="cm-panel__head[ "]/);
      expect(markup).toContain('class="cm-panel__title"');
      expect(markup).toContain('class="cm-panel__actions"');
    }
  );

  it('the Inbox head is the tab-strip variant', () => {
    const at = html.indexOf('id="approvalsDrawer"');
    expect(html.slice(at, at + 600)).toContain('class="cm-panel__head cm-panel__head--tabs"');
  });

  it('the legacy header, title and actions rules are gone', () => {
    for (const sel of [
      'file-browser-title',
      'file-browser-actions',
      'monitor-panel-title',
      'monitor-panel-actions',
      'subagents-panel-title',
      'subagents-panel-actions',
      'approvals-header',
      'approvals-title',
      'inbox-header',
      'inbox-tabs',
    ]) {
      expect(styles, sel).not.toMatch(new RegExp(`\\.${sel}\\b`));
      expect(html, sel).not.toMatch(new RegExp(`class="[^"]*\\b${sel}\\b`));
    }
    // The hooks that stay carry no layout of their own.
    const files = styles.match(/(^|\n)\.file-browser-header \{([^}]*)\}/)?.[2] ?? '';
    expect(files).not.toMatch(/display|padding|background|border/);
    for (const sel of ['monitor-panel-header', 'subagents-panel-header']) {
      expect(styles, sel).not.toMatch(new RegExp(`(^|\\n)\\.${sel} \\{`));
    }
  });

  it('the kit owns the title bar', () => {
    expect(kit).toMatch(/\.cm-panel__head \{[^}]*border-bottom: 1px solid var\(--cm-border\);/);
    expect(kit).toMatch(/\.cm-panel__title \{[^}]*font-size: var\(--cm-text-sm\);/);
    expect(kit).toMatch(/\.cm-panel__head--tabs \{[^}]*align-items: flex-end;/);
  });
});
