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
| `features`   | `styles.css` (`@layer features { … } /* @layer features */` blocks) | feature rules moved out of the unlayered cascade (four tranches: 209 blocks, about 1,830 rules) |

`styles.css` and `mobile.css` are otherwise **unlayered**, so they beat every
layer. That is on purpose: the layered files only add names and kit classes and
never change a pixel of the existing UI on their own.

**Moving feature rules into `features`.** A rule in a `@layer features` block
still beats the kit, the shell and the resets, but it now loses to EVERY unlayered
rule, whatever its specificity: the rest of `styles.css`, the skin overrides at
its end, and all of `mobile.css` (which stays unlayered: it is the override
sheet). So an override no longer has to out-weigh the feature it adjusts. It is
also why a block can move only when nothing unlayered that it beats today can
reach its elements, and when it still beats every rule already in the layer that
it beats today. `npm run css:layer-plan -- --url <candidate server>`
(`scripts/css-layer-plan.mjs`) checks that per declaration and property family,
using the live DOM in several states to decide which selectors can meet. For
JS-built UI the samples cannot show, it falls back to the source: classes listed
together in one class string meet, and a class JS adds at runtime meets the
element it is added to (a BEM `X--y` sits on `.X`; the others are mapped by hand
in `RUNTIME_ON`, read off the code that adds them). An unmapped runtime class is
assumed to meet anything. A BEM modifier's base class always meets it, and
element tags come from the samples and from the source (`<tag class=…>`, and a
`createElement` followed by `.className =`). Two different tags never meet, and
neither do `:focus-visible` and `:not(:focus-visible)`. A conflict that only
matters in a state (`:hover`, `:focus-visible`…) is ignored when an unlayered
rule written as the competitor plus that state outweighs both. ⚠️ One assumption
is not proof: a rule scoped by an ancestor (`.x span`) is taken to reach only
selectors that name that ancestor. Without it nothing scoped could move (every
`.x span` would meet every span); with it, a scoped rule on a class JS toggles can
miss a generic rule inside the scope. That is why a bare hide utility
(`#cronModal .hidden`, `[hidden]`) never moves: it has to beat whatever display
rule its element carries, and a layered rule never does. It then keeps only
runs of at least `--min-run` consecutive rules (8, 6 and 4 for the three
tranches), so the file gets readable blocks rather than one wrapper per rule.
`--reasons` lists what blocks the rest, `--why <selector>` follows one chain to
its root, `--write` wraps the runs (a block that fills an `@media` goes outside
it), `--audit` re-checks every rule already in the layer, and `--fix-audit`
takes a failing one back out (run it until the audit is clean). `css:diff -- --viewports all` is still the proof. ⚠️ Never put
`!important` inside a layer: for important declarations the order flips, so a
layered `!important` would beat every unlayered one (`test/features-layer.test.ts`).

The first tranche moved 65 blocks (about 920 rules): the history list, worktrees,
Away Digest, the path picker, the orchestrator panel, the home rail, git status,
Ralph, the monitor, subagent windows, the file tree and preview, the plan wizard,
the approvals drawer and more. ⚠️ It shipped one regression the probes missed
(their sample sessions were all idle): the home rail's state accents
(`.home-sessions-row--working` and siblings) went into the layer while the base
`.home-sessions-row` stayed unlayered and set `border` too, so a working row lost
its green border (needs and waiting kept theirs through their blink animations).
The planner then treated a BEM modifier as its own element; it now maps it to its
base, the audit took those rules back out, and `test/features-layer.test.ts` fails
on any layered `X--y` whose unlayered `.X` sets the same property family. The
same pass fixed a specificity bug in the planner (everything after a
`:where`/`:is`/`:not` went uncounted); the audit of the first tranche under the
corrected weights is clean.

The second tranche moved 54 more blocks (about 450 rules, 1,870 declarations),
and the third 56 blocks of 4+ (about 280 rules, 1,130 declarations), after the
planner stopped calling a child `*` (`.run-mode-menu > *`) global. That puts
about 1,650 of the file's rules in the layer and leaves about 1,400 outside:
the skin overrides at the end (unlayered on purpose), the `!important` groups,
the globals, and rules interleaved with ones that compete for real:
scoped element rules such as `.form-row input[type="password"]` against
`mobile.css`'s `.duration-custom-input input`, the session tab's own cascade
(`.session-tab:hover`, the rail's `.session-tab > *`), the toolbar's `.cm-btn--bar`
rules, `.btn-icon-header`, the docked-panel rules and the response viewer's
`> *` rules. Each needs its competitor moved, scoped or made exclusive first.
The fourth tranche tried per-pair selector edits first and dropped them: freeing
`.session-tab:hover` took a `:where(:not(:hover))` on the phone tab chip, then
another on the skin's `.tab-glow`, and the chain still ran on to the phone
`.session-tab` border, all for one rule, since a rule only moves once its whole
run frees. What moved it instead is `--hoist`. A layered rule's cascade does not
depend on where it sits, so the unlayered rules interleaved in a run can be moved
to just after the block: they cross only rules that became layered (which they
beat wherever they sit), so no unlayered rule changes order against another. A
run still ends at any at-rule and, with `--hoist`, at a section banner comment
(`/* ===== … */`, `/* ── … ── */`), so a block stays inside its topic. That moved
33 blocks (about 180 rules, 680 declarations), the file's lines unchanged as a
multiset (only wrappers added and rules repositioned). The layer now holds about
1,830 rules; about 1,220 stay outside.
`#cronModal .hidden` came back out of the layer in this pass (no visible change:
the rows JS hides are plain `.form-row`s, but the next one might not be).

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
| Button   | `.cm-btn` + `--sm`, `--lg`, `--icon` (32px, 44px on touch, 16px glyph), `--primary`, `--ghost` (`aria-pressed` = on), `--danger`, `--success` |
| Form     | `.cm-input`, `.cm-select`, `.cm-switch` (`--sm`), `.cm-segmented` |
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

The phone toolbar needs no `!important` for its sizes or colours: the 26px size is
`.toolbar .cm-btn--bar`, so it no longer reaches the home screen's Run or the case
sheet (which size themselves), and the per-button rules carry the `.toolbar` prefix
((0,3,0)), which outranks the skin block's (0,2,1) catch-all. The rest of
`mobile.css` followed: its show/hide rules win by order or specificity, and the
opt-in header buttons' marker pairs in `styles.css` (approvals, Read My Mind,
Session Manager, Away Digest, File Viewer) plus the mic and cron toggles dropped
the `!important` the phone rules used to escalate against. Three declarations keep
it, each for a reason specificity cannot cover: the 16px input floor that stops
iOS zooming into a field, and the subagent dropdown's `left` and `transform`,
which JS writes inline (`test/phone-toolbar-important.test.ts`). Each removal was
checked with `css:diff --viewports all` plus a probe of the states the default page
never shows (every opt-in header button revealed, the detach icon shown, the
dropdown JS-positioned, the pre-init class).

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

**Context menus are on the kit.** The header More menu, the Run dropdown, the tab rail's ⋯ and group
menus, the Session Manager row menu and the Tiles count menu are all
`.cm-menu--popover`; a legacy menu class stays only for that menu's own z-index
layer (`test/menu-kit-migration.test.ts`).

**Text buttons are on the kit.** Every dialog, settings and panel text button is
`.cm-btn.cm-btn--sm` plus a variant (`test/button-kit-migration.test.ts`); the bare
`btn`/`btn-xs`/`btn-secondary` classes, which no CSS styled, are gone with them.
The bottom toolbar family (Run and its gear, Stop, Shell, Enter, mic, cron, git
status, the phone case sheet) is `.cm-btn.cm-btn--bar`. Its compact look stays
unlayered in `styles.css`/`mobile.css`, so its cascade (the Run `--run-*` tokens,
Shell, Stop, the skin block, the phone sizes) is exactly the old one: a layered
copy would lose to every unlayered rule regardless of specificity and reorder it
(measured: the git-status, cron and mic sizes moved). The kit's `--bar` modifier
only rolls back, with `revert-layer`, what the kit base would add (font, line
height, minimum heights, the 16px svg, the disabled fade). `.btn-toolbar` is gone.

**Icon buttons are on the kit.** Every small icon button (panel, preview and
drawer toolbars) is `.cm-btn.cm-btn--icon.cm-btn--ghost`: 32px with a mouse, the
44px touch size under a coarse pointer, 16px glyph (owner decision, option D of
four compared side by side). Text toggles in a toolbar are `.cm-btn--sm`
(`test/icon-button-kit-migration.test.ts`).

**Toggles are on the kit.** Every toggle is a `.cm-switch` (`--sm` in settings
rows), whose track reads the skin's ink, so an unchecked toggle stays visible on the
light skins (`test/switch-kit-migration.test.ts`).

**Settings rows are on the kit.** App Settings, Session Options and Add Case draw
each row as a `.cm-row` (`__text`, `__label`, `__hint`) inside a `.cm-group` box, as
board P03 shows (`test/settings-rows-kit.test.ts`). Phones keep a step-smaller
label and hint so a row stays about 56px. Settings-only modifiers (`set-row-block`,
`set-row-actions`, `has-field`) stay on top of the kit row.

The same `!important` pass then ran over `styles.css`
(`test/styles-css-important.test.ts`), 82 declarations down to 32. What keeps it
there is what specificity cannot cover: xterm's own stylesheet and inline styles,
the `body.*-resizing *` drag cursors, the motion kill switches, the settings
search/field hides (utilities on arbitrary rows whose own display rules share their
weight) and the voice-send gear (a transient state over header and toolbar rules
up to (0,4,1)). The active tab carries none: the rules that could repaint it (rich
rail cards and their state accents, ledger cells, colour stripes, drag-over) skip it
with `:where(:not(.active))`, which adds no specificity. Declarations inside
`@keyframes` never take `!important` (browsers drop them).

Next: moving component rules into the `features` layer.
Each one ships with a `css:diff` run showing only the intended changes.
