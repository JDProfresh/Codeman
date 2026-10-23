import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STOCK_CLIS } from '../src/config/cli-registry/stock.js';

const publicDir = resolve(import.meta.dirname, '../src/web/public');
const styles = readFileSync(resolve(publicDir, 'styles.css'), 'utf8');

// An agent CLI whose Run button has no `mode-<id>` tokens falls back to the default button
// colours, so it reads as a different button from every other CLI's. The Run button and its
// gear share the tokens; the non-og skins, the phone toolbar and the light skins re-set them.
const AGENT_IDS = STOCK_CLIS.filter((c) => c.kind === 'agent').map((c) => c.id as string);

describe('Run button colours for every stock agent CLI', () => {
  it('lists agent CLIs (anti-vacuity)', () => {
    expect(AGENT_IDS).toContain('copilot');
    expect(AGENT_IDS.length).toBeGreaterThan(5);
  });

  // Both halves read one set of --run-* tokens (design-system phase 3), so a CLI
  // needs a token rule AND a place in the property rule's mode list.
  const propertyRule = styles.match(/\.btn-toolbar:is\(\.btn-run, \.btn-run-gear\):is\(([^)]*)\) \{/);
  const listed = new Set((propertyRule?.[1] ?? '').split(',').map((m) => m.trim().replace(/^\.mode-/, '')));

  for (const id of AGENT_IDS) {
    it(`${id} has Run button tokens`, () => {
      expect(styles, `${id} has no --run-* token rule in styles.css`).toMatch(
        new RegExp(`\\.btn-toolbar:is\\(\\.btn-run, \\.btn-run-gear\\)\\.mode-${id} \\{\\n  --run-bg:`)
      );
      expect(listed.has(id), `${id} is missing from the Run property rule's mode list`).toBe(true);
    });
  }
});
