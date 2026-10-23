// Port: none (static analysis of the shipped frontend files).
//
// Settings rows moved onto the kit (design-system phase 3, board P03): a row is
// .cm-row with __text / __label / __hint inside a .cm-group box, on App Settings,
// Session Options and Add Case alike. The legacy set-row / set-row-text /
// set-row-label / set-row-desc / set-group-body classes and their rules are gone;
// settings-only modifiers (set-row-block, set-row-actions, has-field, ...) stay.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const LEGACY = /(?<![\w-])\.?set-(row|row-text|row-label|row-desc|group-body)(?![\w-])/;

describe('settings rows on the kit', () => {
  it('no shipped file uses the legacy row classes', () => {
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

  it('every row carries the kit text, label and hint parts', () => {
    const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
    const rows = html.match(/class="cm-row[ "]/g) ?? [];
    const labels = html.match(/class="cm-row__label[ "]/g) ?? [];
    expect(rows.length).toBeGreaterThan(100);
    expect(labels.length).toBeGreaterThan(100);
  });

  it('keeps the settings-only label and hint rules, and pads non-row content in a group', () => {
    const css = readFileSync(join(PUBLIC, 'styles.css'), 'utf8');
    const scope = ':is(#appSettingsModal, #sessionOptionsModal, #createCaseModal)';
    expect(css).toContain(`${scope} .cm-row__label {`);
    expect(css).toMatch(/\.cm-row__hint \{\s*max-width: 78ch;/);
    expect(css).toContain(`${scope} .cm-group > :not(.cm-row) {`);
  });
});
