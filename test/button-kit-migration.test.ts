/**
 * @fileoverview Dialog, settings and panel text buttons are the kit's .cm-btn
 * (design-system phase 3, the button family).
 *
 * `.btn-toolbar` used to be every button in the app, so a dialog's Save, a
 * settings row's Check now and the bottom toolbar's Run shared one class and
 * one pile of overrides. Outside the bottom toolbar every one is now
 * `.cm-btn.cm-btn--sm` with a variant (`--primary`, `--danger`, the new
 * `--success`). The bare `btn` / `btn-xs` / `btn-secondary` classes (the admin
 * panel, the path Browse buttons, the URL dialog, the web-tab error card)
 * matched no CSS at all and rendered as unstyled browser buttons; they are kit
 * buttons too. `.btn-toolbar` now means the bottom toolbar family only (Run,
 * its gear, Stop, Shell, Enter, mic, cron, git status and the phone case
 * sheet). Port: N/A.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(resolve(PUBLIC, f), 'utf8');
const sources = ['index.html', ...readdirSync(PUBLIC).filter((f) => f.endsWith('.js') && f !== 'i18n.js')];
const TOOLBAR_FAMILY = /\bbtn-(run|run-gear|shell|stop|enter|voice|cron|git-status|case-create-mobile)\b/;

describe('buttons on the kit', () => {
  it('.btn-toolbar is left only on the bottom toolbar family', () => {
    const stray: string[] = [];
    for (const f of sources) {
      for (const m of read(f).matchAll(/class="([^"]*\bbtn-toolbar\b[^"]*)"/g)) {
        if (!TOOLBAR_FAMILY.test(m[1]) && !m[1].includes('${')) stray.push(`${f}: ${m[1]}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it('no button carries a class nothing styles (bare btn, btn-xs, btn-secondary)', () => {
    const bare: string[] = [];
    for (const f of sources) {
      for (const m of read(f).matchAll(/class="((?:btn|btn-primary|btn-secondary|btn-danger)(?: [^"]*)?)"/g)) {
        bare.push(`${f}: ${m[1]}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('the legacy variant rules are gone and the kit has a success variant', () => {
    const styles = read('styles.css');
    expect(styles).not.toMatch(/\.btn-toolbar\.btn-(primary|danger|success) \{/);
    const kit = read('css/components.css');
    expect(kit).toMatch(/\.cm-btn--success \{\s*background: var\(--cm-success\);/);
  });

  it('phone dialog footers size kit buttons, without !important', () => {
    const mobile = read('mobile.css');
    const rule = mobile.match(/\n {2}\.form-actions \.cm-btn \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/height: 36px;/);
    expect(rule).not.toMatch(/!important/);
  });
});
