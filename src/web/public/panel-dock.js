// src/web/public/panel-dock.js

/**
 * @fileoverview The right-side panel dock (design-system phase 4c): the Files,
 * Monitor, Subagents and Inbox panels share ONE right column instead of
 * floating over each other and the terminal.
 *
 * Docking is a layout state, never a re-parent: each panel keeps its element,
 * its own open/close code and its own open marker (`.visible`, `.open`, a
 * missing `.hidden`). A MutationObserver watches those markers; while any
 * dockable panel is open on a wide window, `<html>` carries `dock-open`, the
 * main area gives up `--dock-w` on the right (the terminal's ResizeObserver
 * refits it), the most recently opened panel is shown (`data-docked="active"`)
 * and the others wait behind it (`data-docked="background"`), reachable from
 * the dock's tab strip. A panel the user detached into a floating window
 * (`.detached`) is never docked.
 *
 * Below DOCK_MIN_WIDTH nothing changes: the panels float as before.
 *
 * @mixin Extends CodemanApp.prototype via Object.assign
 * @dependency settings-ui.js (closeMonitor, closeSubagentsPanel)
 * @dependency panels-ui.js (closeFileBrowserPanel)
 * @dependency approvals-ui.js (closeApprovalsInbox)
 * @loadorder 11.65 of 17, after approvals-ui.js, before reboot-restore-ui.js
 */

/** Narrower windows keep the floating panels: a 400px column would leave the terminal too little. */
const DOCK_MIN_WIDTH = 1180;

/**
 * The dockable panels, in tab order. `isOpen` reads the panel's own marker;
 * `close` is the panel's own close, so a tab's × behaves exactly like the
 * panel's ✕.
 */
const DOCK_PANELS = [
  {
    id: 'files',
    label: 'Files',
    el: 'fileBrowserPanel',
    isOpen: (el) => el.classList.contains('visible'),
    close: (app) => {
      app.closeFileBrowserPanel();
      document.querySelector('.btn-file-viewer')?.setAttribute('aria-expanded', 'false');
    },
  },
  {
    id: 'inbox',
    label: 'Inbox',
    el: 'approvalsDrawer',
    isOpen: (el) => el.classList.contains('open'),
    close: (app) => app.closeApprovalsInbox(),
  },
  {
    id: 'subagents',
    label: 'Subagents',
    el: 'subagentsPanel',
    isOpen: (el) => el.classList.contains('open') && !el.classList.contains('hidden'),
    close: (app) => app.closeSubagentsPanel(),
  },
  {
    id: 'monitor',
    label: 'Monitor',
    el: 'monitorPanel',
    isOpen: (el) => el.classList.contains('open') && el.style.display !== 'none',
    close: (app) => app.closeMonitor(),
  },
];

Object.assign(CodemanApp.prototype, {
  /** Starts watching the dockable panels. Idempotent; called once from handleInit's tail. */
  initPanelDock() {
    if (this._panelDock) return;
    const strip = document.getElementById('panelDockTabs');
    if (!strip) return;
    const state = { order: [], active: null, observer: null, mq: null };
    this._panelDock = state;
    state.observer = new MutationObserver(() => this.syncPanelDock());
    for (const p of DOCK_PANELS) {
      const el = document.getElementById(p.el);
      if (el) state.observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    state.mq = window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`);
    state.onMq = () => this.syncPanelDock();
    state.mq.addEventListener?.('change', state.onMq);
    strip.addEventListener('keydown', (e) => this._panelDockKey(e));
    this.syncPanelDock();
  },

  /** The dockable panels open right now (a detached one floats and is left out). */
  _openDockPanels() {
    return DOCK_PANELS.filter((p) => {
      const el = document.getElementById(p.el);
      return el && !el.classList.contains('detached') && p.isOpen(el);
    });
  },

  /**
   * Recomputes the dock from the panels' own markers. A panel that just opened
   * becomes the active tab; when the active one closes, the most recent of the
   * rest takes its place.
   */
  syncPanelDock() {
    const state = this._panelDock;
    if (!state) return;
    const wide = state.mq?.matches ?? window.innerWidth >= DOCK_MIN_WIDTH;
    const open = wide && !this.isSoloWindow ? this._openDockPanels().map((p) => p.id) : [];
    // Most recent last: keep the known order, append the newly opened.
    const fresh = open.filter((id) => !state.order.includes(id));
    state.order = [...state.order.filter((id) => open.includes(id)), ...fresh];
    if (fresh.length) state.active = fresh[fresh.length - 1];
    else if (!open.includes(state.active)) state.active = state.order[state.order.length - 1] ?? null;

    // Writing data-docked fires the observer again only on attribute changes we
    // do not watch (class/style), so this cannot loop.
    for (const p of DOCK_PANELS) {
      const el = document.getElementById(p.el);
      if (!el) continue;
      const docked = open.includes(p.id) ? (p.id === state.active ? 'active' : 'background') : null;
      if (docked) {
        // Entering the dock drops a position left by a drag or a resize handle:
        // inline geometry would beat the docked layout.
        if (!el.dataset.docked) {
          for (const prop of ['left', 'top', 'right', 'bottom', 'width', 'height']) el.style[prop] = '';
        }
        if (el.dataset.docked !== docked) el.dataset.docked = docked;
      } else if (el.dataset.docked) {
        delete el.dataset.docked;
      }
    }
    const dockOpen = open.length > 0;
    const root = document.documentElement;
    if (root.classList.contains('dock-open') !== dockOpen) root.classList.toggle('dock-open', dockOpen);
    this._renderPanelDockTabs(open, state.active);
  },

  _renderPanelDockTabs(open, active) {
    const strip = document.getElementById('panelDockTabs');
    if (!strip) return;
    const key = open.join(',') + '|' + active;
    if (strip.dataset.key === key) return;
    strip.dataset.key = key;
    strip.replaceChildren();
    for (const id of open) {
      const p = DOCK_PANELS.find((x) => x.id === id);
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'cm-tabs__tab panel-dock-tab';
      tab.setAttribute('role', 'tab');
      tab.dataset.dockTab = id;
      tab.setAttribute('aria-selected', id === active ? 'true' : 'false');
      tab.setAttribute('aria-controls', p.el);
      tab.tabIndex = id === active ? 0 : -1;
      tab.textContent = p.label;
      tab.addEventListener('click', () => this.activateDockPanel(id));
      const close = document.createElement('span');
      close.className = 'panel-dock-close';
      close.setAttribute('role', 'button');
      close.setAttribute('aria-label', `Close ${p.label}`);
      close.title = `Close ${p.label}`;
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDockPanel(id);
      });
      tab.appendChild(close);
      strip.appendChild(tab);
    }
  },

  /** Brings a docked panel to the front. */
  activateDockPanel(id) {
    const state = this._panelDock;
    if (!state || !state.order.includes(id)) return;
    state.active = id;
    state.order = [...state.order.filter((x) => x !== id), id];
    this.syncPanelDock();
  },

  /** Closes a docked panel through the panel's own close. */
  closeDockPanel(id) {
    DOCK_PANELS.find((p) => p.id === id)?.close(this);
    this.syncPanelDock();
  },

  /** Arrow keys move along the dock tabs; Delete closes the focused one. */
  _panelDockKey(e) {
    const tabs = [...document.querySelectorAll('#panelDockTabs [data-dock-tab]')];
    const at = tabs.indexOf(document.activeElement);
    if (at === -1) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabs[(at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      this.activateDockPanel(next.dataset.dockTab);
      document.querySelector(`#panelDockTabs [data-dock-tab="${next.dataset.dockTab}"]`)?.focus();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      this.closeDockPanel(tabs[at].dataset.dockTab);
    }
  },
});
