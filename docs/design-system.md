# Codeman design system

How the web UI is styled, and how to add to it without adding drift. The visual
reference is the **Codeman UI Atlas** design artifact (boards `D*` for the UI as
it was, `P*` for the proposed one). This file is the working rules.

Tests mentioned below are in the normal gate (`npm test`) unless noted.

## The cascade

Every stylesheet declares the same layer order:

```css
@layer openprops, tokens, skins, base, components, layout, features;
```

| Layer        | Lives in                     | Holds                                                                  |
| ------------ | ---------------------------- | ---------------------------------------------------------------------- |
| `openprops`  | `vendor/open-props.css`      | Open Props scales (generated at postinstall; never its colors, `normalize.css` or `buttons.css`) |
| `tokens`     | `css/tokens.css`             | the `--cm-*` names                                                     |
| `skins`      | `styles.css` (top)           | every skin palette, custom properties only                             |
| `base`       | `styles.css`                 | the universal reset (`* { box-sizing; margin: 0; padding: 0 }`)        |
| `components` | `css/components.css`         | the kit: `.cm-*` classes only                                          |
| `layout`     | `css/layout.css`             | the `.cm-shell` app grid (header, banners, main, tabs, panel, toolbar areas) |
| `features`   | reserved                     | for code moved out of the unlayered sheets                             |

`styles.css` and `mobile.css` are otherwise **unlayered**, so they beat every
layer. That is on purpose: the layered files only add names and kit classes and
never change a pixel of the existing UI on their own.

⚠️ Anything unlayered that matches a kit element beats the kit. The universal
reset used to be unlayered and zeroed every `.cm-*` padding; it now sits in
`@layer base` (`test/header-more-menu.test.ts` pins it). Keep resets and
element-wide rules out of the unlayered sheets.

## Tokens (`css/tokens.css`)

New rules read `--cm-*` names instead of raw values:

- **Type:** `--cm-text-2xs` … `--cm-text-2xl`, `--cm-text-mono`, `--cm-weight-*`, `--cm-leading*`, `--cm-tracking-caps`, `--cm-font-ui`, `--cm-font-mono`
- **Space:** `--cm-space-1` (4px), `-1h` (6px), `-2` (8px), `-3` (12px), `-4` … `-12`
- **Radius:** `--cm-radius-sm|md|lg|xl|pill`
- **Controls:** `--cm-control-sm|-|lg`, and `--cm-control-touch` (44px, the phone target)
- **Motion:** `--cm-dur`, `--cm-dur-fast`, `--cm-ease`, `--cm-ease-out`
- **Color (semantic, over the skin vars):** `--cm-surface-0|1|2|hover`, `--cm-text|-2|-3`, `--cm-border|-strong`, `--cm-accent|-hover`, `--cm-on-accent`, `--cm-success|warning|danger|info`
- **Shadows:** `--cm-shadow-menu`, `--cm-shadow-dialog`
- **Z layers:** `--cm-z-echo` … `--cm-z-toast` (named stack; never a new number)

Color belongs to the skins. A token maps a role onto the skin variables; it never
introduces a hue.

## The kit (`css/components.css`)

| Family   | Classes |
| -------- | ------- |
| Button   | `.cm-btn` + `--sm`, `--lg`, `--icon`, `--primary`, `--ghost`, `--danger` |
| Form     | `.cm-input`, `.cm-select`, `.cm-switch`, `.cm-segmented` |
| Tags     | `.cm-chip`, `.cm-pill`, `.cm-dot`, `.cm-badge`, tones `.cm-tone-success|warning|danger|info|accent` |
| Layout   | `.cm-label`, `.cm-group`, `.cm-row` (`__text`, `__label`, `__hint`), `.cm-item` (`__text`, `__title`, `__meta`, `__end`) |
| Menu     | `.cm-menu` (`--popover`), `__item` (`--danger`, `--stacked` with `__sub`), `__row`, `__pin`, `__kbd`, `__sep`, `__heading`, `__note` |
| Tabs     | `.cm-tabs`, `.cm-tabs__tab` (`aria-selected` drives the state; `[hidden]` hides) |
| Surfaces | `.cm-banner` (`--danger|warning|info`, `__title`, `__detail`, `__aside`, `__actions`; `--alert` is the solid, skin-independent strip with `__dot`, `__icon`, `__btn`, `__btn--quiet`), `.cm-empty`, `.cm-panel` (`__head` with `__title` and `__actions`, `__head--tabs` for a tab strip, `__body`), `.cm-dialog` (`--sm` 420 · `--md` 480 · default 720 · `--lg` 980, all max-widths; `__head|title|body|foot`), `.cm-sheet` (`[hidden]` hides), `.cm-toast` |

Rules for kit code: `.cm-*` selectors only, in `@layer components`, no
`!important`, no raw type/space/radius values (`test/css-design-tokens.test.ts`
reads every declaration). A kit class whose `display` is set must also honour
`[hidden]`, since author layers beat the browser's own `[hidden]` rule.

**Adding a control:** reach for the kit first (`<button class="cm-btn cm-btn--sm cm-btn--ghost">`).
A feature that needs a one-off rule writes it unlayered in `styles.css` with
tokens, next to the feature's other rules.

## The ratchet (`npm run check:css`)

`scripts/css-metrics.mjs` counts the distinct font sizes, hex colors, paddings,
radii, z-indexes, width breakpoints and the `!important`s across the hand-written
sheets, against the baseline in `config/css-metrics.json`. A count going up fails
CI and the pre-push hook. A value built only from `var()` references does not
count, so reading a token is always free. After a change that lowers a count,
run `npm run check:css -- --update` and commit the baseline.

## Proving a refactor is invisible (`npm run css:diff`)

`scripts/css-style-diff.mjs` loads two running servers (a base and a candidate)
and compares the computed styles of every element across 7 skins, 3 viewports,
forced hover/focus states and every Run mode. A pure refactor must come back with
no differing element-states (the tab-status pulse animation is timing noise). The
script's header shows how to start the two servers on separate instances.

## The header (desktop)

- **Pinned by default:** Files, Inbox, Search (Session Manager), Tiles, then
  More (⋯) and Settings. Run lives in the bottom toolbar.
- **More (⋯)** (`header-more.js`) lists every optional header action. A row
  clicks the real button even while it is hidden; its pin flips that button's
  per-device `show*` key and re-applies `applyHeaderVisibilitySettings()`. Only
  per-device keys may be pinnable (`test/header-more-menu.test.ts`).
- **New header control:** add the button with a `--hidden` marker class and a
  `show*` per-device key, add a row to `HEADER_MORE_ITEMS`, and decide its phone
  behaviour (`test/mobile-header-buttons-policy.test.ts` fails until you do).

## The shell (`css/layout.css`)

`.app` is the `.cm-shell` grid from board S04:

```
"header  header"   auto
"banners banners"  auto     offline, host-wake, reboot-restore, timer, respawn, orchestrator, Ralph
"main    tabs"     auto     the panel dock's tab strip
"main    panel"    1fr      the docked panel
"toolbar toolbar"  auto
columns: minmax(0, 1fr) var(--cm-panel-w, 0)
```

The banner strips stack inside one `.cm-region--banners`; main stays one element (the
terminal, tiles, web tabs and the welcome screen mount inside it); fixed-position
overlays are outside the grid's flow. The panel column is 0 wide until a panel docks
(`test/app-shell-layout.test.ts`).

## Right-side panels (desktop)

Files, Inbox, Subagents and Monitor **dock** into the shell's panel column at
1180px and wider (`panel-dock.js` sets `html.dock-open`, which sets
`--cm-panel-w`): a tab strip in the `tabs` area, the most recent panel in the
`panel` area, the terminal reflowed rather than covered. Every dockable panel is
a direct child of the shell for that reason. Docking is a layout state, never a
re-parent; each panel keeps its own open/close code. A new right-side panel joins
by adding a row to `DOCK_PANELS` (its element id, how to read "open", its own
close) and nothing else (`test/panel-dock.test.ts`).

Every right-side panel (Files, Inbox, Subagents, Monitor, Ultracode) draws its
title bar from the kit: `.cm-panel__head` > `.cm-panel__title` + `.cm-panel__actions`,
the body `.cm-panel__body` (`test/panel-kit-migration.test.ts`). A legacy header
class stays only as a hook (the Files drag handle, the detached gradient), never
with layout of its own.

The **Inbox** is one drawer with Approvals and Notifications tabs
(`approvals-ui.js`). Its header button's badge sums pending approvals and unread
notifications (`test/inbox-drawer.test.ts`).

The split pane was removed: the tile grid covers "several sessions side by side".

## The phone

`mobile.css` (loaded below 1024px) is **breakpoint modifiers**: one block per media
query, in the order its header lists, with touch, reduced motion and the fold last
(`test/mobile-css-breakpoints.test.ts`). A kit component carries its own phone
modifiers inside `css/components.css` instead: a `.cm-dialog` goes full-screen
under 600px (`--sm` stays a box) with no rule in `mobile.css`. Add a phone rule to
the block for its width; a new query is added to the header list and the test on
purpose. Run `npm run css:diff -- --viewports all` for any change there: the extra
viewports (360, 700, 768) sit on mobile.css's own steps.

The `!important`s left in `mobile.css` are load-bearing: phone toolbar sizes beat
`.btn-toolbar`'s own `!important` sizing (and every button that carries that class,
the overview's Run included), toolbar colours beat the weighted skin block, and
`display` beats JS inline toggles. Removing them is a toolbar refactor, not a
cleanup.

The toolbar is Run, Stop, Enter, mic and More (⋯) (board P07). The More sheet
holds Case, Attach and App Settings. The agent key bar opens with Compose (accent),
Esc, Tab, ⇧Tab, then the arrows (`test/phone-toolbar-p07.test.ts`). Header
controls stay off phones.

## Status

| Phase | Scope | State |
| ----- | ----- | ----- |
| 0 | ratchet, Open Props, tokens | done |
| 1 | type/space/radius snapped onto tokens | done |
| 2 | skins in `@layer skins`, semantic button colors | done |
| 3 | the kit; Run split-button tokens; toolbar and banner families | kit done; more families can migrate |
| 4 | header More + pins, Inbox, panel dock, split removed, phone P07, `.cm-shell` grid, wiki re-shoots, mobile.css as one block per breakpoint, kit phone modifiers | done |

**Dialogs are on the kit.** Every dialog box is a `.cm-dialog` with a titled
`__head` (`test/dialog-kit-migration.test.ts` refuses the old `.modal-content`
family). On phones only `--sm` stays a box; every other size goes full-screen. The
overlay around it (`.modal`, `.modal-backdrop`, `.modal-close`) stays legacy until
the shell phase.

**Alert strips are on the kit.** Connection lost (red), host asleep and reboot
restore (amber) are one `.cm-banner--alert` variant with its own phone modifiers
(`test/banner-kit-migration.test.ts`). Its colours are the skin-independent
`--cm-alert-*` tokens, never the skin tones: "you are disconnected" reads the same
on every skin.

**Context menus are on the kit.** The header More menu, the tab rail's ⋯ and group
menus, the Session Manager row menu and the Tiles count menu are all
`.cm-menu--popover`; a legacy menu class stays only for that menu's own z-index
layer (`test/menu-kit-migration.test.ts`).

**Settings rows are on the kit.** App Settings, Session Options and Add Case draw
each row as a `.cm-row` (`__text`, `__label`, `__hint`) inside a `.cm-group` box, as
board P03 shows (`test/settings-rows-kit.test.ts`). Phones keep a step-smaller
label and hint so a row stays about 56px. Settings-only modifiers (`set-row-block`,
`set-row-actions`, `has-field`) stay on top of the kit row.

Next migrations: buttons (`.btn-toolbar`, `.btn-icon-sm` onto `.cm-btn`), the Run dropdown (`.run-mode-menu`) and the switches.
Each one ships with a `css:diff` run showing only the intended changes.
