/**
 * @fileoverview The alert strips are the kit's .cm-banner--alert
 * (design-system phase 3, board S03).
 *
 * Connection lost (red), host asleep and reboot restore (amber) used to be two
 * hand-built families (`offline-banner-*`, `reboot-restore-banner-*`, the
 * host-wake strip borrowing the first), each with its own phone block. They are
 * now one kit variant with parts (`__dot`, `__icon`, `__title`, `__detail`,
 * `__aside`, `__btn`, `__btn--quiet`) and its own phone modifiers.
 *
 * ⚠️ The strip stays skin-independent on purpose ("you are disconnected" reads
 * the same on every skin): its colours are the --cm-alert-* tokens, never the
 * skin's --cm-danger/--cm-warning, which a light skin turns pale. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(resolve(PUBLIC, f), 'utf8');
const html = read('index.html');
const kit = read('css/components.css');
const tokens = read('css/tokens.css');

describe('alert banners on the kit', () => {
  it.each([
    ['offlineBanner', 'cm-banner--danger'],
    ['hostWakeBanner', 'cm-banner--warning'],
    ['rebootRestoreBanner', 'cm-banner--warning'],
  ])('%s is a .cm-banner--alert with %s', (id, tone) => {
    expect(html).toMatch(new RegExp(`class="cm-banner cm-banner--alert ${tone}" id="${id}"`));
  });

  it('the legacy families are gone from markup, styles and the phone sheet', () => {
    for (const f of ['index.html', 'styles.css', 'mobile.css']) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).not.toMatch(/\.?(offline-banner|reboot-restore-banner|host-wake-banner)\b/);
    }
  });

  it('reads the skin-independent alert tokens, not the skin tones', () => {
    expect(tokens).toMatch(/--cm-alert-danger: linear-gradient\(90deg, #b91c1c, #991b1b\);/);
    expect(tokens).toMatch(/--cm-alert-warning: linear-gradient\(90deg, #b45309, #92400e\);/);
    const alert = kit.slice(kit.indexOf('.cm-banner--alert {'));
    expect(alert.slice(0, alert.indexOf('}'))).toContain('background: var(--cm-alert);');
    expect(alert.slice(0, alert.indexOf('}'))).not.toMatch(/--cm-(danger|warning)\b/);
  });

  it('honours [hidden] without !important, and carries its own phone modifiers', () => {
    expect(kit).toMatch(/\.cm-banner\[hidden\] \{\s*display: none;/);
    const phone = kit.slice(kit.indexOf('Phones: a tighter strip'));
    expect(phone).toMatch(/\.cm-banner--alert :is\(\.cm-banner__detail, \.cm-banner__aside\) \{\s*display: none;/);
  });
});
