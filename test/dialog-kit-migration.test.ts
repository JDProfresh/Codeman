// Port: none (static analysis of the shipped frontend files).
//
// Dialogs moved onto the kit (design-system phase 3): the box is .cm-dialog with
// __head / __title / __body / __foot and the --sm / --md / --lg sizes, and the
// legacy .modal-content / .modal-header / .modal-body / .modal-footer /
// .modal-sm / .modal-lg classes and their base rules are gone. The overlay
// (.modal, .modal-backdrop, .modal-close) stays legacy until the shell phase.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const LEGACY = /(?<![\w-])\.?modal-(content|header|body|footer|sm|lg)(?![\w-])/;

describe('dialogs on the kit', () => {
  it('no shipped markup, script or stylesheet uses the legacy dialog box classes', () => {
    const files = ['index.html', 'styles.css', 'mobile.css', ...readdirSync(PUBLIC).filter((f) => f.endsWith('.js'))];
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(join(PUBLIC, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (LEGACY.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('every dialog box in index.html is a .cm-dialog with a titled head', () => {
    const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
    const heads = html.match(/class="cm-dialog__head[^"]*"/g) ?? [];
    const titles = html.match(/class="cm-dialog__title[^"]*"/g) ?? [];
    expect(heads.length).toBeGreaterThan(15);
    expect(titles.length).toBe(heads.length);
  });

  it('phones keep only --sm dialogs as boxes; the rest go full-screen (the kit’s own modifiers)', () => {
    const kit = readFileSync(join(PUBLIC, 'css/components.css'), 'utf8');
    const phone = kit.slice(kit.indexOf('@media (max-width: 599px)'));
    expect(phone).toMatch(/\.cm-dialog \{\s*width: 100%;\s*max-width: 100%;\s*height: 100%;/);
    expect(phone).toMatch(/\.cm-dialog--sm \{[^}]*height: auto;/);
    // mobile.css no longer restates them.
    const mobile = readFileSync(join(PUBLIC, 'mobile.css'), 'utf8');
    expect(mobile).not.toMatch(/^\s*\.cm-dialog(--sm)? \{/m);
  });

  it('the kit carries the sizes as max-widths over a full-width box', () => {
    const kit = readFileSync(join(PUBLIC, 'css/components.css'), 'utf8');
    for (const [size, px] of [
      ['sm', 420],
      ['md', 480],
      ['lg', 980],
    ] as const) {
      expect(kit).toMatch(new RegExp(`\\.cm-dialog--${size} \\{\\s*max-width: ${px}px;`));
    }
  });
});
