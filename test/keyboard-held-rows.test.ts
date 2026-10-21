// Port: none (pure logic in vm contexts: no browser, no server).
//
// Rows held under the on-screen keyboard (`keyboardHoldsRows`, per-device,
// default ON). Every PTY height change makes Claude Code clear the screen and
// reprint only the transcript tail that fits, and the keyboard opening and
// closing used to be such a change each time (measured on the dev tier: tmux
// went 62x38 -> 62x15 -> 62x38 with a SIGWINCH per transition). Now the rows
// captured at the show transition are held, columns still follow the box, and
// the over-tall screen is scrolled up instead (keyboardClipPx).
//
// Outside test/mobile/ on purpose: that suite is not in the CI gate.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const read = (file: string) => readFileSync(resolve(import.meta.dirname, '../src/web/public', file), 'utf8');

type Geometry = {
  keyboardClipPx(input: Record<string, number | boolean>): number;
  keyboardVisibleRowLimit(clipPx: number, viewHeight: number, cellHeight: number): number;
};

function loadGeometry(): Geometry {
  const window: Record<string, unknown> = {};
  vm.runInContext(read('constants.js'), vm.createContext({ console, window, URLSearchParams }));
  return window.CodemanTerminalGeometry as Geometry;
}

describe('keyboardClipPx', () => {
  const g = loadGeometry();
  // 38 held rows of 17px in a 255px box (15 rows visible): 391px of overflow.
  const base = { rows: 38, cellHeight: 17, viewHeight: 255, following: true, viewportY: 100, baseY: 100 };

  it('puts the last content row at the bottom of the box', () => {
    // Claude: composer and footer run to the last row, cursor in the composer.
    expect(g.keyboardClipPx({ ...base, cursorRow: 34, lastContentRow: 37 })).toBe(38 * 17 - 255);
    // Content ends at row 20: rows 6..20 are in view.
    expect(g.keyboardClipPx({ ...base, cursorRow: 20, lastContentRow: 20 })).toBe(21 * 17 - 255);
  });

  it('counts a cursor just below the content (an empty prompt line)', () => {
    expect(g.keyboardClipPx({ ...base, cursorRow: 22, lastContentRow: 20 })).toBe(23 * 17 - 255);
  });

  it('ignores a cursor parked far below the content (codex dialogs)', () => {
    // Measured on the dev tier: codex's update dialog on rows 1-8 of 42, its
    // cursor on row 38 of an otherwise blank screen. Anchoring to the cursor
    // scrolled the dialog out of view; the top stays in view instead.
    expect(g.keyboardClipPx({ ...base, cursorRow: 37, lastContentRow: 8 })).toBe(0);
  });

  it('shows the top for a prompt near the top (a fresh shell), and uses the cursor on a blank screen', () => {
    expect(g.keyboardClipPx({ ...base, cursorRow: 1, lastContentRow: 1, viewportY: 0, baseY: 0 })).toBe(0);
    expect(g.keyboardClipPx({ ...base, cursorRow: 37, lastContentRow: -1 })).toBe(38 * 17 - 255);
  });

  it('follows the scroll position while reading history, top of scrollback included', () => {
    const max = 38 * 17 - 255;
    expect(g.keyboardClipPx({ ...base, following: false, viewportY: 0, cursorRow: 37, lastContentRow: 37 })).toBe(0);
    expect(g.keyboardClipPx({ ...base, following: false, viewportY: 50, cursorRow: 37, lastContentRow: 37 })).toBe(
      Math.round(max / 2)
    );
  });

  it('is 0 when nothing overflows or the terminal cannot be measured', () => {
    expect(g.keyboardClipPx({ ...base, viewHeight: 38 * 17, cursorRow: 37, lastContentRow: 37 })).toBe(0);
    expect(g.keyboardClipPx({ ...base, cellHeight: 0, cursorRow: 37, lastContentRow: 37 })).toBe(0);
  });

  it('bounds the overlay to the fully visible rows', () => {
    expect(g.keyboardVisibleRowLimit(0, 255, 17)).toBe(15);
    expect(g.keyboardVisibleRowLimit(38 * 17 - 255, 255, 17)).toBe(38);
    expect(g.keyboardVisibleRowLimit(10, 255, 17)).toBe(15);
  });
});

type Proto = Record<string, (this: Record<string, unknown>, ...args: unknown[]) => unknown>;

function loadTerminalProto() {
  const keyboard = { keyboardVisible: true };
  const windowStub: Record<string, unknown> = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const context = vm.createContext({
    console,
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: vi.fn(),
    HTMLCanvasElement: class HTMLCanvasElement {},
    WebSocket: { OPEN: 1 },
    fetch: vi.fn(),
    URLSearchParams,
    document: { addEventListener: vi.fn(), documentElement: { dataset: {} }, getElementById: () => null },
    localStorage: { length: 0, key: vi.fn(), getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    window: windowStub,
    MobileDetection: { isTouchDevice: () => true, isHandheldDevice: () => false, getDeviceType: () => 'mobile' },
    KeyboardHandler: keyboard,
  });
  vm.runInContext(
    `${read('constants.js')}\n${read('app.js')}\n${read('terminal-ui.js')}\nglobalThis.__CodemanApp = CodemanApp;`,
    context
  );
  const proto = (context as unknown as { __CodemanApp: { prototype: Proto } }).__CodemanApp.prototype;
  return { proto, keyboard };
}

describe('getTerminalDimensions holds the rows while the keyboard is up', () => {
  const { proto, keyboard } = loadTerminalProto();
  const fake = (held: number) => ({
    _keyboardHeldRows: held,
    _keyboardHeldRowsActive: proto._keyboardHeldRowsActive,
    fitAddon: { proposeDimensions: () => ({ cols: 62, rows: 15 }) },
  });

  it('reports the held rows and the container columns', () => {
    keyboard.keyboardVisible = true;
    expect(proto.getTerminalDimensions.call(fake(38))).toEqual({ cols: 62, rows: 38 });
  });

  it('follows the container once the keyboard is gone, or with no hold', () => {
    keyboard.keyboardVisible = false;
    expect(proto.getTerminalDimensions.call(fake(38))).toEqual({ cols: 62, rows: 15 });
    keyboard.keyboardVisible = true;
    expect(proto.getTerminalDimensions.call(fake(0))).toEqual({ cols: 62, rows: 15 });
  });

  it('never holds fewer rows than the box offers', () => {
    keyboard.keyboardVisible = true;
    expect(proto.getTerminalDimensions.call(fake(12))).toEqual({ cols: 62, rows: 15 });
  });

  it('skips the raw fit while held, so xterm never visits the short size', () => {
    keyboard.keyboardVisible = true;
    const fit = vi.fn();
    const resizes: unknown[] = [];
    const self = {
      ...fake(38),
      fitAddon: { fit, proposeDimensions: () => ({ cols: 62, rows: 15 }) },
      terminal: { cols: 62, rows: 38, resize: (c: number, r: number) => resizes.push([c, r]) },
      getTerminalDimensions: proto.getTerminalDimensions,
      _resizeTerminalTo: proto._resizeTerminalTo,
      _scheduleOverflowAffordanceSync: () => {},
    };
    expect(proto.syncTerminalGeometry.call(self)).toEqual({ cols: 62, rows: 38 });
    expect(fit).not.toHaveBeenCalled();
    expect(resizes).toEqual([]);
  });
});

function loadKeyboardHandler(enabled: boolean) {
  const viewport = { width: 390, height: 664, offsetTop: 0, addEventListener: () => {}, removeEventListener: () => {} };
  const layout = { height: 664 };
  const app = {
    terminal: { rows: 38 },
    _keyboardHeldRows: 0,
    _keyboardHoldsRowsEnabled: () => enabled,
    _applyKeyboardClip: vi.fn(),
    relayoutMobileSubagentWindows: () => {},
  };
  const context = vm.createContext({
    console,
    app,
    navigator: { userAgent: 'iPhone', maxTouchPoints: 5 },
    window: {
      get innerWidth() {
        return viewport.width;
      },
      get innerHeight() {
        return layout.height;
      },
      visualViewport: viewport,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({ matches: true }),
      scrollTo: () => {},
    },
    document: {
      body: { classList: { add: () => {}, remove: () => {} } },
      documentElement: { style: { setProperty: () => {} } },
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  vm.runInContext(`${read('mobile-handlers.js')}\nglobalThis.__KH = KeyboardHandler;`, context);
  const handler = (context as unknown as { __KH: { init(): void; handleViewportResize(): void } }).__KH;
  handler.init();
  const resizeTo = (width: number, height: number, layoutHeight = height) => {
    viewport.width = width;
    viewport.height = height;
    layout.height = layoutHeight;
    handler.handleViewportResize();
  };
  return { app, resizeTo };
}

describe('KeyboardHandler captures and releases the hold', () => {
  it('captures the keyboard-free rows on show and releases them on hide', () => {
    const { app, resizeTo } = loadKeyboardHandler(true);
    resizeTo(390, 364, 664);
    expect(app._keyboardHeldRows).toBe(38);
    resizeTo(390, 664);
    expect(app._keyboardHeldRows).toBe(0);
    expect(app._applyKeyboardClip).toHaveBeenCalled();
  });

  it('holds nothing with the setting off', () => {
    const { app, resizeTo } = loadKeyboardHandler(false);
    resizeTo(390, 364, 664);
    expect(app._keyboardHeldRows).toBe(0);
  });

  it('releases on a shape change with the keyboard still up', () => {
    const { app, resizeTo } = loadKeyboardHandler(true);
    resizeTo(390, 364, 664);
    resizeTo(664, 90, 390); // rotated, keyboard still up
    expect(app._keyboardHeldRows).toBe(0);
  });
});

describe('keyboardHoldsRows is a per-device setting', () => {
  const settingsUi = read('settings-ui.js');
  const html = read('index.html');
  const schemas = readFileSync(resolve(import.meta.dirname, '../src/web/schemas.ts'), 'utf8');

  it('is a display key, stripped from the PUT and absent from the strict schema', () => {
    const start = settingsUi.indexOf('const displayKeys = new Set([');
    expect(settingsUi.slice(start, settingsUi.indexOf('])', start))).toContain("'keyboardHoldsRows'");
    expect(settingsUi).toContain('keyboardHoldsRows: _khr,');
    expect(schemas).not.toContain('keyboardHoldsRows');
  });

  it('defaults ON and loads/saves by id', () => {
    expect(html).toContain('id="appSettingsKeyboardHoldsRows"');
    expect(settingsUi).toContain(
      "document.getElementById('appSettingsKeyboardHoldsRows').checked = settings.keyboardHoldsRows !== false;"
    );
    expect(settingsUi).toContain("keyboardHoldsRows: document.getElementById('appSettingsKeyboardHoldsRows').checked,");
  });
});
