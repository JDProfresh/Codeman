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
| `layout`, `features` | reserved              | for code moved out of the unlayered sheets                             |

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
| Menu     | `.cm-menu` (`--popover`), `__item`, `__row`, `__pin`, `__kbd`, `__sep`, `__heading` |
| Tabs     | `.cm-tabs`, `.cm-tabs__tab` (`aria-selected` drives the state; `[hidden]` hides) |
| Surfaces | `.cm-banner` (`--danger|warning|info`, `__title`, `__detail`, `__actions`), `.cm-empty`, `.cm-panel`, `.cm-dialog` (`--sm` 420 · `--md` 480 · default 720 · `--lg` 980, all max-widths; `__head|title|body|foot`), `.cm-sheet` (`[hidden]` hides), `.cm-toast` |

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

## Right-side panels (desktop)

Files, Inbox, Subagents and Monitor **dock** into one right column at 1180px and
wider (`panel-dock.js`): a tab strip, the most recent panel in front, the
terminal reflowed rather than covered. Docking is a layout state, never a
re-parent; each panel keeps its own open/close code. A new right-side panel joins
by adding a row to `DOCK_PANELS` (its element id, how to read "open", its own
close) and nothing else (`test/panel-dock.test.ts`).

The **Inbox** is one drawer with Approvals and Notifications tabs
(`approvals-ui.js`). Its header button's badge sums pending approvals and unread
notifications (`test/inbox-drawer.test.ts`).

The split pane was removed: the tile grid covers "several sessions side by side".

## The phone

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
| 4 | header More + pins, Inbox, panel dock, split removed, phone P07 | done |

**Dialogs are on the kit.** Every dialog box is a `.cm-dialog` with a titled
`__head` (`test/dialog-kit-migration.test.ts` refuses the old `.modal-content`
family). On phones only `--sm` stays a box; every other size goes full-screen. The
overlay around it (`.modal`, `.modal-backdrop`, `.modal-close`) stays legacy until
the shell phase.

Next migrations: settings rows (`.set-*` → `.cm-row`), then the remaining toolbar
and panel headers.
Each one ships with a `css:diff` run showing only the intended changes.
