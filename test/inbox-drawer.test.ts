// Port: none (static analysis of the shipped frontend files).
//
// The Inbox (design-system phase 4b) merges the approvals drawer and the
// notification drawer into one #approvalsDrawer with two tabs. notification-manager.js
// still renders into #notifList/#notifEmpty and reads isDrawerOpen, so these guards
// pin the seams: the ids live inside the Inbox, the old drawer is gone, and the
// manager hands open/close to the Inbox instead of toggling a drawer of its own.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(__dirname, '../src/web/public');
const read = (f: string) => readFileSync(join(PUBLIC, f), 'utf8');

function inboxMarkup(): string {
  const html = read('index.html');
  const start = html.indexOf('<div class="approvals-drawer inbox-drawer" id="approvalsDrawer"');
  expect(start, '#approvalsDrawer Inbox markup not found').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('<script defer src="constants.js"></script>', start));
}

describe('Inbox drawer', () => {
  it('holds both tabs and the notification list ids the manager renders into', () => {
    const inbox = inboxMarkup();
    for (const id of ['inboxTabApprovals', 'inboxTabNotifications', 'inboxPanelApprovals', 'inboxPanelNotifications']) {
      expect(inbox).toContain(`id="${id}"`);
    }
    expect(inbox).toContain('id="notifList"');
    expect(inbox).toContain('id="notifEmpty"');
    expect(inbox).toContain('class="approvals-list"');
  });

  it('replaces the old notification drawer and bell', () => {
    const html = read('index.html');
    expect(html).not.toContain('id="notifDrawer"');
    expect(html).not.toContain('btn-notifications');
  });

  it('the header Inbox button opens the Inbox', () => {
    expect(read('index.html')).toMatch(/id="approvalsBtn" onclick="app\.toggleInbox\(\)"/);
  });

  it('notification-manager delegates its drawer to the Inbox and feeds its badge', () => {
    const nm = read('notification-manager.js');
    expect(nm).toMatch(/toggleDrawer\(\) \{\s*(\/\/.*\s*)*this\.app\?\.toggleInbox\?\.\('notifications'\);/);
    expect(nm).toContain('this.app?.renderInboxBadge?.();');
  });

  it('a hidden kit tab really hides (the kit display would otherwise beat [hidden])', () => {
    expect(read('css/components.css')).toMatch(/\.cm-tabs__tab\[hidden\] \{\s*display: none;/);
  });

  it('the Inbox pin is a per-device key, off on handhelds', () => {
    const settings = read('settings-ui.js');
    expect(settings).toMatch(/const displayKeys = new Set\(\[[\s\S]*'showInboxButton'[\s\S]*\]\);/);
    expect(settings).toMatch(/showSessionButton: false,\s*showInboxButton: false,/);
  });
});
