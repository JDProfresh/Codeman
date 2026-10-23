// src/web/public/header-more.js

/**
 * @fileoverview The header's More (⋯) menu: every optional header action in
 * one list, each with a pin that puts it on the header itself.
 *
 * The header keeps a short set of pinned buttons (Files, Search, Tiles by
 * default; Inbox and Run live elsewhere) and everything else is one click
 * away here. A row RUNS its action by clicking the real header button, even
 * while that button is hidden, so the menu never re-implements what a button
 * does. Its pin flips the button's existing per-device `show*` setting and
 * re-applies applyHeaderVisibilitySettings(), so App Settings, the pin and
 * the header stay one source of truth.
 *
 * Only per-device keys (`_displaySettingKeySet()`) are pinnable: a synced key
 * would need a server write, and the menu stays a local, per-device control.
 * Desktop only; mobile.css hides the button on phones, whose own ⋯ button
 * (toolbar) opens the More sheet defined at the end of this file.
 *
 * @mixin Extends CodemanApp.prototype via Object.assign
 * @dependency settings-ui.js (loadAppSettingsFromStorage, saveAppSettingsToStorage,
 *   applyHeaderVisibilitySettings, getDefaultSettings, _displaySettingKeySet)
 * @dependency tile-grid.js (canOpenTileGrid)
 * @loadorder 10.1 of 17, after settings-ui.js, before panels-ui.js
 */

/**
 * The header actions the menu lists, in menu order. `key` is the per-device
 * setting that pins the action; `button` finds the real control the row clicks.
 * `fallback` is the default when neither the stored settings nor the device
 * defaults name the key (the same `??` chain applyHeaderVisibilitySettings uses).
 */
const HEADER_MORE_ITEMS = [
  { id: 'files', label: 'Files', key: 'showFileViewerButton', fallback: true, button: '.btn-file-viewer' },
  { id: 'inbox', label: 'Inbox', key: 'showInboxButton', fallback: true, button: '#approvalsBtn' },
  { id: 'search', label: 'Search sessions', key: 'showSessionButton', fallback: true, button: '.btn-session-manager' },
  { id: 'tiles', label: 'Tiles', key: 'showTileGridButton', fallback: true, button: '.btn-tile-grid', gate: 'tiles' },
  {
    id: 'response',
    label: 'Last response',
    key: 'showResponseViewer',
    fallback: false,
    button: '.btn-response-viewer-header',
  },
  {
    id: 'attachments',
    label: 'Attachments',
    key: 'showAttachmentsButton',
    fallback: false,
    button: '#attachmentsHistoryBtn',
  },
  { id: 'redraw', label: 'Redraw terminal', key: 'showRedrawButton', fallback: false, button: '.btn-redraw-terminal' },
  { id: 'away', label: 'Away digest', key: 'showAwayDigestButton', fallback: false, button: '.btn-away-digest' },
  // The Cron button lives in the bottom toolbar and draws an emoji, so the row brings its own glyph.
  { id: 'cron', label: 'Cron jobs', key: 'showCronButton', fallback: false, button: '.btn-cron', icon: 'clock' },
  { id: 'lifecycle', label: 'Lifecycle log', key: 'showLifecycleLog', fallback: false, button: '.btn-lifecycle-log' },
  { id: 'font', label: 'Font size', key: 'showFontControls', fallback: false, font: true, icon: 'type' },
];

// Glyphs for rows whose control has no SVG of its own (same 24-unit stroke style as the header's).
const HEADER_MORE_ICONS = {
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>',
};

const HEADER_MORE_PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>';

Object.assign(CodemanApp.prototype, {
  /** Whether `item` is pinned to the header on this device. */
  _headerMorePinned(item, settings = this.loadAppSettingsFromStorage(), defaults = this.getDefaultSettings()) {
    return (settings[item.key] ?? defaults[item.key] ?? item.fallback) === true;
  },

  /** The rows this window can offer: per-device keys only, gated features left out. */
  _headerMoreItems() {
    const pinnable = this._displaySettingKeySet?.() ?? new Set();
    return HEADER_MORE_ITEMS.filter((item) => {
      if (!pinnable.has(item.key)) return false;
      if (item.gate === 'tiles' && this.canOpenTileGrid?.() === false) return false;
      return item.font || !!document.querySelector(item.button);
    });
  },

  toggleHeaderMoreMenu(event) {
    event?.stopPropagation?.();
    if (this._headerMoreMenu) {
      this.closeHeaderMoreMenu({ refocus: false });
      return;
    }
    this.openHeaderMoreMenu();
  },

  openHeaderMoreMenu() {
    const btn = document.getElementById('headerMoreBtn');
    const settings = this.loadAppSettingsFromStorage();
    const defaults = this.getDefaultSettings();
    const menu = document.createElement('div');
    menu.id = 'headerMoreMenu';
    menu.className = 'cm-menu cm-menu--popover';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'More header actions');
    const heading = document.createElement('div');
    heading.className = 'cm-menu__heading cm-label';
    heading.setAttribute('aria-hidden', 'true');
    heading.textContent = 'Header';
    menu.appendChild(heading);

    for (const item of this._headerMoreItems()) {
      const row = document.createElement('div');
      row.className = 'cm-menu__row';
      row.dataset.item = item.id;
      if (item.font) {
        const label = document.createElement('span');
        label.className = 'cm-menu__item cm-menu__item--static';
        label.innerHTML = HEADER_MORE_ICONS[item.icon];
        label.append(item.label);
        row.appendChild(label);
        for (const [text, aria, run] of [
          ['A-', 'Decrease font size', () => this.decreaseFontSize()],
          ['A+', 'Increase font size', () => this.increaseFontSize()],
        ]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cm-btn cm-btn--sm cm-btn--ghost header-more-font';
          b.setAttribute('role', 'menuitem');
          b.setAttribute('aria-label', aria);
          b.tabIndex = -1;
          b.textContent = text;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            run();
          });
          row.appendChild(b);
        }
      } else {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'cm-menu__item';
        action.setAttribute('role', 'menuitem');
        action.tabIndex = -1;
        const icon = !item.icon && document.querySelector(item.button)?.querySelector('svg');
        if (icon) action.appendChild(icon.cloneNode(true));
        else action.innerHTML = HEADER_MORE_ICONS[item.icon] ?? '';
        const label = document.createElement('span');
        label.textContent = item.label;
        action.appendChild(label);
        action.addEventListener('click', (e) => {
          e.stopPropagation();
          this._runHeaderMoreItem(item);
        });
        row.appendChild(action);
      }
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'cm-btn cm-btn--sm cm-btn--icon cm-btn--ghost cm-menu__pin';
      pin.setAttribute('role', 'menuitemcheckbox');
      pin.tabIndex = -1;
      pin.innerHTML = HEADER_MORE_PIN_ICON;
      this._syncHeaderMorePin(pin, item, this._headerMorePinned(item, settings, defaults));
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleHeaderMorePin(item, pin);
      });
      row.appendChild(pin);
      menu.appendChild(row);
    }

    document.body.appendChild(menu);
    if (btn?.getBoundingClientRect) {
      // Under the More button, right-aligned to it (.cm-menu--popover is position: fixed).
      const rect = btn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    }
    btn?.setAttribute('aria-expanded', 'true');

    const focusables = () => [...menu.querySelectorAll('button')];
    const rows = () => [...menu.querySelectorAll('.cm-menu__row')];
    const onOutside = (e) => {
      if (menu.contains(e.target) || btn?.contains(e.target)) return;
      this.closeHeaderMoreMenu({ refocus: false });
    };
    const onKey = (e) => {
      const active = document.activeElement;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeHeaderMoreMenu({ refocus: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Up and down move between rows, landing on each row's first control.
        e.preventDefault();
        const list = rows();
        const at = list.findIndex((r) => r.contains(active));
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next = at === -1 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
        list[next]?.querySelector('button')?.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Left and right move within a row (its action, font steps, pin).
        const row = active?.closest?.('.cm-menu__row');
        if (!row) return;
        e.preventDefault();
        const inRow = [...row.querySelectorAll('button')];
        const at = inRow.indexOf(active);
        const step = e.key === 'ArrowRight' ? 1 : -1;
        inRow[(at + step + inRow.length) % inRow.length]?.focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const list = focusables();
        list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
      } else if (e.key === 'Tab') {
        this.closeHeaderMoreMenu({ refocus: false });
      }
    };
    menu.addEventListener('focusout', (e) => {
      const to = e.relatedTarget;
      if (to && !menu.contains(to) && to !== btn) this.closeHeaderMoreMenu({ refocus: false });
    });
    this._headerMoreMenu = { menu, onOutside, onKey };
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey, true);
    focusables()[0]?.focus();
  },

  closeHeaderMoreMenu({ refocus = false } = {}) {
    const open = this._headerMoreMenu;
    if (!open) return;
    this._headerMoreMenu = null;
    document.removeEventListener('click', open.onOutside);
    document.removeEventListener('keydown', open.onKey, true);
    open.menu.remove();
    const btn = document.getElementById('headerMoreBtn');
    btn?.setAttribute('aria-expanded', 'false');
    if (refocus) btn?.focus();
  },

  /** Runs a row: closes the menu, then clicks the real header control (hidden or not). */
  _runHeaderMoreItem(item) {
    this.closeHeaderMoreMenu({ refocus: false });
    document.querySelector(item.button)?.click();
  },

  _syncHeaderMorePin(pin, item, pinned) {
    pin.setAttribute('aria-checked', pinned ? 'true' : 'false');
    const text = pinned ? `Unpin ${item.label} from the header` : `Pin ${item.label} to the header`;
    pin.setAttribute('aria-label', text);
    pin.title = text;
  },

  /** Flips the item's per-device `show*` key and re-applies the header. */
  _toggleHeaderMorePin(item, pin) {
    const settings = this.loadAppSettingsFromStorage();
    const pinned = !this._headerMorePinned(item, settings);
    settings[item.key] = pinned;
    this.saveAppSettingsToStorage(settings);
    this.applyHeaderVisibilitySettings();
    if (pin) this._syncHeaderMorePin(pin, item, pinned);
  },
});

Object.assign(CodemanApp.prototype, {
  /**
   * The phone More sheet (design-system P07): the case picker, Attach and App
   * Settings, behind the ⋯ button that took the settings gear's toolbar slot.
   */
  toggleMobileMoreSheet() {
    if (document.getElementById('mobileMoreSheet')?.hidden === false) this.closeMobileMoreSheet();
    else this.openMobileMoreSheet();
  },

  openMobileMoreSheet() {
    const sheet = document.getElementById('mobileMoreSheet');
    if (!sheet) return;
    sheet.hidden = false;
    document.getElementById('mobileMoreBackdrop')?.removeAttribute('hidden');
    document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'true');
    if (!this._mobileMoreWired) {
      this._mobileMoreWired = true;
      // A finished pick closes the sheet; a cancelled picker leaves it for the backdrop.
      document.getElementById('attachFileInput')?.addEventListener('change', () => this.closeMobileMoreSheet());
      sheet.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeMobileMoreSheet({ refocus: true });
        }
      });
    }
  },

  closeMobileMoreSheet({ refocus = false } = {}) {
    const sheet = document.getElementById('mobileMoreSheet');
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.getElementById('mobileMoreBackdrop')?.setAttribute('hidden', '');
    const btn = document.getElementById('mobileMoreBtn');
    btn?.setAttribute('aria-expanded', 'false');
    if (refocus) btn?.focus();
  },
});
