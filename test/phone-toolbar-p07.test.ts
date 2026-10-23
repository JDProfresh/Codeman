// Port: none (static analysis of the shipped frontend files).
//
// The phone toolbar regrouping (design-system board P07): Run, Stop, Enter, mic
// and More (⋯) stay on the toolbar; the case picker, Attach and App Settings move
// into the More sheet. The moved controls keep their ids, which session-ui.js and
// image-input.js look up, and the ⋯ button keeps the btn-settings-mobile class so
// voice dictation's Send transform (voice-input.js) still finds a toolbar button.
// The browser suites that would see this (test/mobile/**) are not in the gate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(join(PUBLIC, f), 'utf8');

function between(html: string, start: string, end: string): string {
  const a = html.indexOf(start);
  expect(a, `${start} not found`).toBeGreaterThan(-1);
  return html.slice(a, html.indexOf(end, a));
}

describe('phone toolbar (P07)', () => {
  const html = read('index.html');
  const toolbar = between(html, '<footer class="toolbar">', '</footer>');
  const sheet = between(html, 'id="mobileMoreSheet"', '<!-- Help Modal -->');

  it('keeps the More button in the gear slot, with the gear class voice dictation looks for', () => {
    expect(toolbar).toMatch(/class="btn-settings-mobile btn-more-mobile" id="mobileMoreBtn"/);
    expect(read('voice-input.js')).toContain("document.querySelector('.btn-settings-mobile')");
  });

  it('moves Case, Attach and Settings into the More sheet with their ids', () => {
    for (const id of ['mobileCaseName', 'attachBtnMobile', 'attachFileInput']) {
      expect(toolbar).not.toContain(`id="${id}"`);
      expect(sheet).toContain(`id="${id}"`);
    }
    expect(sheet).toContain('app.openAppSettings()');
    expect(sheet).toContain('app.showMobileCasePicker()');
    expect(toolbar).not.toContain('app.openAppSettings()');
  });

  it('keeps the Attach file input over its row so a native tap opens the picker', () => {
    expect(sheet).toMatch(
      /<span class="btn-attach-mobile-wrap mobile-more-attach">[\s\S]*id="attachBtnMobile"[\s\S]*<input type="file" class="btn-attach-mobile-input" id="attachFileInput"/
    );
  });

  it('gives the sheet the keyboard-up tap fix the toolbar has', () => {
    expect(read('app.js')).toContain("addKeyboardTapFix(document.getElementById('mobileMoreSheet'));");
  });

  it('leads the agent key bar with Compose, Esc, Tab, Shift+Tab, then the arrows', () => {
    const src = read('keyboard-accessory.js');
    const block = between(src, '_extendedButtons: `', '`,');
    const actions = [...block.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
    expect(actions.slice(0, 6)).toEqual(['compose', 'esc', 'tab', 'shift-tab', 'scroll-up', 'scroll-down']);
    expect(actions.at(-1)).toBe('dismiss');
  });

  it('a hidden kit sheet really hides', () => {
    expect(read('css/components.css')).toMatch(/\.cm-sheet\[hidden\] \{\s*display: none;/);
  });
});
