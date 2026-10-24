/**
 * @fileoverview Toggles are the kit's .cm-switch (design-system phase 3).
 *
 * The legacy `.switch` / `.switch-sm` + `.slider` drew its off track in
 * literal translucent white, so on the light skins an unchecked toggle was a
 * bare grey dot with no visible track. The kit switch washes the track with the
 * skin's own ink (`color-mix(var(--cm-text) …)`), keeping the dark-skin look
 * and giving the light skins a visible track. `--sm` is the compact size the
 * settings rows use. Port: N/A.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(resolve(PUBLIC, f), 'utf8');

describe('switches on the kit', () => {
  it('no markup or builder uses the legacy switch any more', () => {
    for (const f of ['index.html', 'settings-ui.js']) {
      const text = read(f);
      expect(text, f).not.toMatch(/class="switch[ "]/);
      expect(text, f).not.toMatch(/class="slider"/);
    }
    expect(read('index.html').match(/class="cm-switch cm-switch--sm/g)?.length ?? 0).toBeGreaterThan(50);
  });

  it('the legacy switch rules are gone', () => {
    const styles = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(styles).not.toMatch(/(^|\n)\.switch(-sm)?\b/);
    expect(styles).not.toMatch(/\.slider\b/);
  });

  it('the kit track reads the skin, and --sm is the compact size', () => {
    const kit = read('css/components.css');
    expect(kit).toMatch(/\.cm-switch span \{[^}]*background: color-mix\(in srgb, var\(--cm-text\) 6%, transparent\);/);
    expect(kit).toMatch(/\.cm-switch--sm \{\s*width: 28px;\s*height: 16px;/);
    expect(kit).toMatch(/\.cm-switch\[hidden\] \{\s*display: none;/);
  });
});
