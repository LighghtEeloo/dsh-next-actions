# Client half — release-readiness audit (task-2)

Auditor: client-auditor (teammate). Date: 2026-11-09. Area: **Client half** of `plugins/dsh-next-actions`
(@local/dsh-next-actions v0.1.0, private). Read-only audit of the plugin; writes only under
`research/release-audit/client/` and `/tmp`.

Files audited: `src/client.js` (1150 L), `src/styles.js` (391 L), `lib/view-model.js` (502 L),
`scripts/build-client.mjs` (54 L), built `client.js` (2041 L / 75,344 chars / 76,044 bytes), `test/build.test.mjs`,
`test/definition.test.mjs`, `test/view-model.test.mjs`, `locale/*.json`, `package.json`, `cordis.patch.yml`,
README, PRD v0.8, tech design v1.0. Contracts cross-checked against the shipped **DSH Desktop 0.2.2-rc.1**
asar (read-only, extracted to /tmp/dshns-asar).

## Verdict: **NOT READY to publish** (close; 3 must-fix blockers, rest is polish/testing)

The client half is technically strong: the build is byte-reproducible, the bundle is a clean single-file
classic script that requires only `react`, the slot/Definition/locale contracts match 0.2.2-rc.1, there is no
HTML-injection surface, tokens/reduced-motion are handled, and the 181 pure tests pass. It is not publishable
yet because of (1) an unguarded crash path in the Conversation Definition, (2) package identity/metadata that
cannot be published as-is and silently breaks the client half if renamed without rebuilding, and (3) a
user-facing behavior/claim contradiction (opt-in "Send" mode) plus a broken "sent" status.

---

# 1. Publish-blocking issues

## B1 (HIGH, blocking) — Conversation Definition crashes when the fold window starts mid-turn

`buildLocationData` dereferences `context.state.model` without checking `context.state`:

- `plugins/dsh-next-actions/src/client.js:1072-1086` (built `client.js:1963-1977`):
  ```js
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state.model === null) return null
  ```
- The framework calls a Definition's `buildLocationData` for **every context in `this.dirty` / every
  context**, whether or not that context has a start match / derived state:
  `dsh-client-ui-conversation/lib/client.js:3210-3235` (`buildLocationData` wrapper + `replaceLocationData`),
  `3234-3255` (`applyDirtyLocationData`). `acceptMatch` creates a context for an update-only match and dirties
  it (`:2880-2900`, `:2984-2995`); `replaceLocationData` runs on window rebuild and `applyDirtyLocationData`
  on every publish.
- Official Definitions guard exactly this state: `dsh-client-ui-chat/lib/client.js:13258-13260`
  (`const end = context.state === void 0 ? context.matches.find(...) : context.state.end`),
  `10147-10166`, `12950` (`context.state ?? fallbackState(context)`). The contract type
  `contextSnapshot` passes `state: undefined` for start-less contexts
  (`dsh-client-ui-conversation/lib/client.js:2480-2490`).

Reproduced against the built artifact with a stubbed loader/React (`/tmp/def-harness.mjs`):
```
ORPHAN buildLocationData threw: TypeError: Cannot read properties of undefined (reading 'model')
```

Reachability: the session event window is normally cut on a `turn/start` boundary
(`dsh-api-session-controller/lib/index.js:1195-1233`, `client.js:2164-2177`), but it is cut mid-turn when the
500-message page cap is hit (`paginate` `count >= maxMessages` branch). A single very long agentic turn
(>500 message events; e.g. ~250 tool call/result pairs) or a jump/older page that hits the cap produces a
window whose first events belong to a turn whose `turn/start` is not loaded. The plugin's match set includes
**every** `tool/result` append in the turn (`src/client.js:1035-1037`), so such a window always creates a
start-less context → the TypeError escapes `applyDirtyLocationData` → it is thrown inside the
`queueMicrotask`/binding rebuild of `ui-conversation` (`lib/client.js:4113-4124` has no catch around
`record.binding.rebuild()`). That is an uncaught exception in the transcript assembly path, not a silent no-op.

Required fix: `if (scope !== 'turn' || context.state === undefined || context.state === null
|| context.state.model === null) return null` — plus a `definition.test.mjs` case calling
`buildLocationData({ state: undefined }, 'turn')` (currently only the happy path is tested,
`test/definition.test.mjs:201-217`). With the guard, `turn.data.get('next-steps')` still works for normal
full-turn windows; the identity-optimisation dead branch noted in R4 remains a separate (cosmetic) issue.

## B2 (HIGH, blocking) — published identity/metadata is not shippable, and rename silently breaks the client

- `package.json:2-4`: `"name": "@local/dsh-next-actions"`, `"private": true` → `npm publish` refuses; a
  `@local` scope is not publishable/installable publicly. No `license` field and no LICENSE file (the plugin
  copies MIT-licensed official markup/CSS — attribution/notice needed). No `repository`, `author`,
  `keywords`, no `engines.dsh`/DSH compatibility declaration (`dsh-app-boot/lib/index.js:1069-1105` reads
  `engines.dsh` or `@deepseek-ai/dsh*` peers; absence means "compatible with every future release").
- The **bundle id is hardcoded** in `src/client.js:22-23,32` (`id: '@local/dsh-next-actions'`, `PKG`) and
  therefore in built `client.js:23,923`. It also appears in `index.js:20`, `cordis.patch.yml:18` and three
  test literals (`test/build.test.mjs:87`, `test/definition.test.mjs:90`, `test/tool.test.mjs:100`). No test
  ties the bundle id to `package.json.name`.
- Loader requirement: a client bundle must register under its package's id
  (`dsh-client-modules/lib/client.js:22-31,760,877`; host resolves the `./client` export at
  `dsh-client-modules/lib/index.js:786-802`). If the package is renamed for publish and `client.js` is not
  rebuilt, the host loads the bundle and then fails with
  `loaded without registering "<new name>" via __ModuleLoader__.load` — the whole client half (card, process
  row, settings) is dead with a plugin-manager failure, while the Host half still registers the tool. Silent in
  tests.
- Fix: give the build one source of truth for the id (read `package.json.name` or a single constant shared by
  `index.js` + `src/client.js`), rebuild, update the patch row name, and add a test asserting
  `bundle id === package.json.name === index.js name === patch row name`. Then remove `private`, choose the
  final (unscoped or owned-scope) name, add `license: MIT` + LICENSE + attribution note for the copied
  official primitives/CSS, and (recommended) `engines.dsh`.

## B3 (MEDIUM-HIGH, blocking until decided) — opt-in "Send" mode contradicts the documented safety invariant, and its required status never renders

- The implementation can submit on click: `src/client.js:444-467` — `applyFill` calls
  `inputActions.setDraft(text)` then, when the persisted setting `clickMode === 'send'` and the suggestion is
  not dangerous, calls `inputActions.submit()` (`:459-461`). The settings UI exposes that mode
  (`settings.clickSend`, `:691-699`; `lib/view-model.js:29-31,232-235`).
- README (which ships in the npm tarball) still promises the opposite: `README.md:4`
  "Clicking a suggestion only **fills the input draft** — it never sends." The technical design states the
  same invariant as a hard rule: `design/next-step-suggestions-tech.md:33,83,1040` ("永不 `submit`",
  "代码路径中不存在 `submit()` 调用"). PRD v0.8 §5.6 instead sanctions an opt-in send mode
  (`design/next-step-suggestions-prd.md:316-320`). The docs contradict each other; the code follows the PRD.
- The PRD-required feedback is broken: §5.6 says the card must show 「已作为你的消息发送」 after sending.
  `setStatusKey('status.sent')` (`src/client.js:459-463`) can never win, because
  `statusFromState = cardStatusKey({... filledId ...}) ?? statusKey` (`:429-437`) returns `status.filled`
  whenever `filledId` is set, and `applyFill` always sets `filledId` before that. Verified by inspection:
  after a send the card says "Filled into the input — review and send" instead of "Sent as your message";
  `status.sent` (`src/client.js:80,127`) is unreachable dead copy.
- Also unverified: send mode relies on `setDraft` being flushed synchronously before `submit()` reads the
  draft. `ui-conversation` implements `setDraft` via a discrete Lexical update
  (`lib/client.js:15448-15463`) and `submit` reads `this.projection.clipboardText` (`:15613-15640`); the
  ordering is plausible but there is no automated or documented live check for "click → sent text correct".
- Required decision before publish: either (a) remove the retry/send mode entirely (restore the stated
  "zero auto-send" invariant, keeping only fill; PRD §5.6 then needs a revision), or (b) keep it, fix the
  status precedence (give `statusKey` priority after a send / clear `filledId` on send), update README + tech
  design + tool copy, and verify the send path manually (and ideally with a unit test on the status
  precedence function). Default behavior (`clickMode: 'fill'`) is correct and dangerous suggestions never
  submit (`:459`), so the safety net holds for default users.

---

# 2. Non-blocking risks (fix before/soon after publish)

R1 **Build/tarball gaps.** Rebuild is byte-identical and `--check` works (see §3), but: the published tarball
excludes `src/`, `scripts/`, `test/` (npm pack: 10 files, 40.5 kB) so consumers cannot rebuild and the
freshness guard cannot run there; the build inlines any dev edit (only `--check` protects freshness, not
content); the build validates nothing about the id, the seed-only `require`, token validity, or
`innerHTML`/eval; no source map (fine, but worth deciding); `files` still ships `lib/view-model.js` although it
is only a build/test input (bundle is self-contained) — harmless but confusing.
R2 **Accessibility gaps.** (a) Chip accessible name is `aria-label: suggestion.prompt`
(`src/client.js:517`), which overrides the visible Tag children, so 「推荐 / 需确认 / 可以不做 / 已填入」
(`:526-529`) are not announced. (b) Focus is lost when a chip click swaps the chip row for the
Replace/Append/Cancel row (`:469-490`, `:551-556`) or when Dismiss unmounts the focused button
(`:567-593`); no focus is moved to the new controls. (c) The settings segmented control is a hand-written
approximation of the official primitive: no Home/End, no focus-follows-selection (official
`dsh-web-frontend/dist/assets/index-BgUyXZcc.js:673851` implements both + per-tab `aria-controls`), and it
uses `role=tablist/tab` without tabpanels; arrow-key selection changes are not announced.
(d) More/collapse toggle lacks `aria-expanded`/`aria-controls` (`:536-550`). Positives: native `<button
type=button>`, Enter/Space on chips, `aria-expanded`/`aria-controls` on the fold, `role="status"` status line,
`aria-label` on icon buttons, and the theme's global `:focus-visible` outline
(`dsh-client-ui-theme/lib/client.js:1473`) keeps keyboard focus visible.
R3 **One invalid CSS token.** `--dsw-alias-state-warning-primary` (`src/styles.js:106`) does not exist in
0.2.2-rc.1 (the theme defines `--dsw-alias-state-warn-primary`, `dsh-client-ui-theme/lib/client.js:1462-1485`).
It has a fallback (`--dsw-alias-label-secondary`), so the danger tag silently loses its warning color. The
other 23 external tokens used (26 total `var()` names; 2 are local `--dsh-segment-*`) are all defined.
R4 **Dead/ineffective code (also a small perf cost).** The identity optimisation in
`buildLocationData` compares a freshly built object with itself (`previous.value === value`,
`src/client.js:1075-1085`) — always false, so every dirty publish republishes an identical value; the sibling
`state.model === model` check (`:1069`) is also always false because `parseMeta`/`modelFromArgs` return fresh
objects. In a live turn the definition is dirtied by every `tool/result` append (match `:1035-1037`), so this
causes redundant conversation publishes/renders (low impact; no `publication: 'none'` hint like the official
`turn-tail` uses). Unreachable/unused: `fallback.context` (`:607` — model context can never be empty),
`storageKeys.stats` (`lib/view-model.js:290`), `LIMITS.labelDisplay` (`lib/view-model.js:39`,
`lib/normalize.js:25`), `buildDisplay.totalCount/autoCount` (only tests read them), and the shipped test seam
`__test` (`src/client.js:1146-1147`, `client.js:2038`). The built artifact also carries internal design-doc
and milestone comments (12.7% comment lines; e.g. `client.js:535` references
`design/next-step-suggestions-tech.md`); harmless but "dev log in dist".
R5 **Reveal hardening.** `revealStartedRef` is never reset (`src/client.js:376-380`). If `hasCard` ever goes
false→true on the same mounted component, the wrapper re-renders with the collapsed
`REVEAL_INITIAL_STYLE` and the layout effect returns early → card permanently invisible. No known trigger in
the current mount/remount flow; cheap hardening (reset the ref / clear the style when `!hasCard`).
R6 **Storage/composer robustness.** `readSettings()` reads `window.localStorage` outside any try
(`src/client.js:151-153`); a throwing storage getter would throw during render and break the card (the
"storage unavailable still works" comment only covers `getItem`/`setItem`). `applyFill` calls
`inputActions.setDraft(text)` unguarded (`:447`); if the composer is disposed/frozen the click handler throws
instead of showing `status.unavailable`.
R7 **Process row vs card disagreement when `meta` is missing.** The Definition falls back to the tool
arguments when `meta` is absent (`src/client.js:1064-1068`) and can render a card, while the process row maps a
missing meta to `shown:false → 'error'` "Not shown" (`lib/view-model.js:475-483`, `src/client.js:974`,
`:988`). Rare (compaction that drops meta but keeps args), but the two surfaces then contradict each other.
R8 **Settings are read once per card.** `NextStepsCard` does `useState(readSettings)`
(`src/client.js:339`), so changing 「Suggestions per reply」 does not affect cards already mounted (only
`clickMode` is re-read per click, `:445`). 「Reset card states」 clears localStorage only
(`src/client.js:670-673`); mounted cards keep their dismissed/filled marks until remount.
R9 **Persistence details.** Turn keys are `dsh-next-actions:v1:turn:<sessionId>:<turn>`
(`lib/view-model.js:288-293`) and are written only on fill/dismiss (bounded growth, never pruned per session;
manual reset only). A **fork** gets a new session id → PRD §5.4 "fork 后状态保持"
(`design/next-step-suggestions-prd.md:306`) is not met for dismissed/filled marks. The danger flag is not
persisted (`src/client.js:346` `dangerRef` starts false), so after restart a previously filled dangerous
suggestion shows the neutral "Filled" status. "Filled" can also be shown while the draft is empty if draft
persistence was cleared. README itself lists "card marks across a restart" as *not yet checked*
(`README.md:40,141-142`).
R10 **i18n only en/zh.** EN/ZH inline dicts are complete and identical (44/44 keys, placeholder parity
verified); other shipped UI locales fall back to English through the locale service's fallback chain
(`dsh-client-locale/lib/client.js:1660-1677`). `locale/de,es,fr,ja,pt,ru.json` display metadata is absent →
the plugin manager card shows English title/description in those locales. No permanent key-parity test exists.
R11 **Preview truncation.** The fixed preview slot is 56 px with a 2-line clamp
(`src/styles.js:107-123`) while prompts can be 500 chars (`lib/view-model.js:40`). Sighted users cannot see
the full instruction before clicking (PRD §6.2 "看到的和填进去的必须一致", `design/next-step-suggestions-prd.md:336-338`).
README documents the fixed slot as intentional; the product requirement is still unmet for long prompts.
R12 **Style injection lacks the official duplicate guard.** Official bundles check
`style[data-plugin-css=...]` before injecting (`dsh-client-ui-chat/lib/client.js:8996-9004`); the plugin
injects unconditionally inside `ctx.effect` (`src/client.js:1098-1103`). Cleanup is correct (effect disposer +
loader `removeOwnedStyles`), only unusual double-load would duplicate.
R13 **No `publication` hint / no throttling on the Definition** (see R4): official `turn-tail` returns
`'none'` for non-terminal events (`dsh-client-ui-chat/lib/client.js:13316`); the plugin uses the default
`'immediate'` for every matched `tool/result` in the turn. No visible cost before the card mounts, but it is
unnecessary assembly work in long tool-heavy turns.
R14 **README is a dev log and partly stale.** It ships inside the npm tarball. Stale claims: line 4 "never
sends" (see B3); it contains internal workspace paths, profile paths, milestone tables, a "Working name note",
and a remaining-checks list. For a public package it needs a user-facing README, and the plugin-manager
metadata is only wired for en/zh.

---

# 3. Verified good (evidence)

**Build reproducibility/freshness.** Copied the plugin to `/tmp/dshns-audit/plugin`, ran
`node scripts/build-client.mjs` → byte-identical artifact; `node scripts/build-client.mjs --check` passes on a
pristine copy and exits 1 after appending a line to `src/client.js` (then rebuild includes it). Hashes:
`client.js c26838bd4cca33fbe5f4e61cd8b8664d889d6a97b1421656b3aa52be8d24dd0d` (75,344 chars / 2,041 L),
`src/client.js f976eb31…`, `lib/view-model.js 1866969…`, `src/styles.js c71739b2…`. `node --test`: 181/181
pass in ~74 ms. `build.test.mjs:11-16` runs the freshness check as part of the suite. Build script
(`scripts/build-client.mjs:22-50`): inlines `lib/view-model.js` + `src/styles.js` at markers, strips
line-leading exports, fails if a marker remains, idempotent, `--check` compares exact content.

**Bundle purity / loader contract.** Built bundle is a single classic script, no top-level import/export,
0 occurrences of `@deepseek-ai`, exactly one `require('react')`; no `innerHTML`/`dangerouslySetInnerHTML`/
`insertAdjacentHTML`/`eval`/`new Function`; DOM APIs are only `document.createElement/head`,
`window.localStorage/getComputedStyle/matchMedia/setTimeout/clearTimeout`; no network, no observers; one
addEventListener/removeEventListener pair. Loader: `window.__ModuleLoader__.load({id, factory})`, id must be the
package name (`dsh-client-modules/lib/client.js:22-31`), host resolves `package.json` `exports["./client"]`
(`:786-802`); the boot prefetches rows with `dsh.client.immediately` (`dsh-web-frontend/dist/assets/index-BgUyXZcc.js:950381`).
The frozen seed table in 0.2.2-rc.1 is
`{react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis, zod, @tanstack/react-virtual,
@deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives,
@deepseek-ai/dsh-client-ui-dockkit}` (`dsh-web-frontend/dist/assets/index-BgUyXZcc.js:196`); requiring only
`react` is within it. `dsh.client.platform/inject/immediately` all validate (`dsh-client-modules/lib/client.js:53-75`).

**Slot registrations.** Cross-checked against the shipped slot catalog
(`dsh-cordis-client-runner/lib/client.js:3073-3105` turnTail, `:7353-7463` toolview, `:5755-5860` settings):
`conversation.chat.turnTail` is a session-scoped list; owner props are `{turn, seq, openFile}` and standard
props include `useInput`, `inputActions`, `useSession`, `sessionId` and (via registration `locale`) `t` — exactly
what the card consumes; registration `{name, id: PKG, order: -10, locale: NS}` matches the official
action-cards pattern (`dsh-client-ui-action-cards/lib/client.js:859-880`); id is unique vs shipped occupants.
`tool.call.toolview` is keyed by wire name; key `suggest_next_steps` equals the Host tool name
(`index.js:141`) and is not in the shipped key domain; owner props `phase/block/inspect` (+ `t` via locale)
match `ProcessRow` usage exactly, same shape as official `ProposeRow` (`action-cards/lib/client.js:582-587`).
`settings.section` list/root: id `@local/dsh-next-actions` unique vs shipped ids (`account/general/models/
plugins/agent-presets`), `label` thunk is supported (`string | (() => string)`), owner `{close}` unused is fine;
`order: 60` puts it after all shipped sections (orders -10/0/10/15/20, e.g.
`dsh-client-ui-settings-general/lib/client.js:1588-1590`). `settings.section.icon` requires the **same id** as
the section (both use PKG); owner props `{size, active}` are accepted (`SectionIcon({size})`), `currentColor`
adapts to selection; `label` on the icon is not displayed (harmless).

**Conversation Definition (except B1).** `ctx.uiConversation.events.register()` is the right face
(`dsh-client-ui-conversation/lib/client.js:4097-4099`); `{kind:'next-steps', match, start, update,
buildLocationData}` satisfies `assertDefinitionTarget` (target and buildViewNode both absent,
`:3438`) and the location-data validators `kind==='turn', key===kind, turn` safe integer (`:3210-3219`);
`contextSnapshot`/`start(context, match)`/`update(context, match)` shapes match (`:2480-2490`, `:2865-2915`);
`turn.data.get('next-steps')` returns the published `{turn, model}` value (same mechanism as `turn-tail`,
`dsh-client-ui-chat/lib/client.js:12697,13258-13280`). Fold tests cover meta-first, args fallback,
authoritative `shown:false`, error results, unrelated calls, non-append surfaces, JSON-string meta, latest
result wins, and location data (`test/definition.test.mjs:104-217`) — only the start-less case (B1) is missing.
Host/Client meta contract agrees (`lib/normalize.js:224-242` vs `lib/view-model.js:159-215`).

**Interaction model (fill/conflict/danger/recommended/more).** `resolveDraftAction`/`mergeDraft` are pure and
tested (`lib/view-model.js:263-282`, `test/view-model.test.mjs:324-368`); the card tracks its own last fill
(`appliedRef`, `src/client.js:346-347,444-490`) so a second click replaces silently only while the draft is
still ours; conflict offers Replace/Append/Cancel (append never overwrites, and the appended draft intentionally
asks next time). Dangerous suggestions always fill-only (`:459`), the danger flag is derived both from the Host
meta and a client risk lexicon (`lib/view-model.js:51-65,96-99`); recommendation is ordered first
(`lib/view-model.js:144-153`) and marked with a Tag; 「还有 N 条」 is the localized `card.more`
(`src/client.js:536-542`) with expand/collapse not persisted. No HTML is built from model text; all strings go
through React text nodes/attributes.

**Locale.**
- Inline dictionaries: EN 44 keys, ZH 44 keys, same key set, placeholders identical (`{n}`); every key
  referenced statically or dynamically (`row.*` states, `status.*`, `settings.*`, `note.*`) exists.
- `ctx.locale.register(NS, {en, zh})` + `ctx.locale.bind(NS)` matches the shipped API
  (`dsh-client-locale/lib/client.js:1675-1702`); duplicate (ns, locale) throws, but the registration is owned
  by `ctx.effect` and disposes correctly; lookup falls back to `en` for the six other shipped locales.
- Display metadata `locale/en.json` / `locale/zh.json` use the schema the Host reads
  (`dsh-app-boot/lib/index.js:2985-3035`: `meta.title` / `meta.description` non-empty strings, language-id
  filenames, released through `./locale/*.json` export; `package.json:11`, `:20`); the manifest `icon` field is
  present and the SVG is script-free (786 B, no foreignObject/external refs).
- Surfaces using `t` all receive it from the slot `locale` registration (verified pattern in
  `dsh-client-ui-action-cards/lib/client.js:466-476`, which destructures `t` from slot props).

**XSS/DOM safety.** No HTML sinks, no URL handling at all (no links), no eval/new Function, no
`data:`/javascript: URLs; `injectStyles` uses static CSS via `textContent`;
`data-shimmer-text`/aria/title only ever receive plugin copy or model text passed through React attributes;
SVG markup is static. `document.head.appendChild` is the only DOM write besides style/transition styles.

**CSS/theme.** All selectors are `.dshns-*` (plus `button.dshns-disc-leading`) and keyframes are `dshns-*`;
no bare element/global selectors; only inline custom properties are `--dsh-segment-count/index` (scoped to the
segmented-control element, same names the official primitive uses). 24 external theme tokens: 23 defined in
`dsh-client-ui-theme` (both light/dark blocks define the alias tokens, e.g. `:1470-1485`), 1 invalid (R3).
`prefers-reduced-motion` is handled in CSS for the reveal and the shimmer (`src/styles.js:27-30,221-225`) and in
JS by `prefersReducedMotion()` gating the reveal (`src/client.js:215-222,385-390`). The theme supplies a global
`:focus-visible` outline, so keyboard focus is visible despite no plugin-specific focus styles.

**Live reveal / subagent.** The reveal rationale is grounded: `ChatViewport.measureClosing`
(`dsh-client-ui-chat/lib/client.js:2688`) and `keepAboveClosing` (`:2763`) exist, the
`[data-conversation-scroll]` scrollport attribute exists (used by the plugin's `findCardScrollport`), and
`turn.end.time` exists (chat uses `turn.end.time` at `:8695`). The pure policy
(`CARD_REVEAL`, `shouldRevealCard`) is unit-tested (`test/view-model.test.mjs:574-600`); the height/opacity
animation itself is manual-only. Reveal wrapper starts collapsed and is cleared in a layout effect with a
try/catch fallback, single transitionend listener + timeout, listener/timer removed in cleanup; no leak found.
Subagent filtering uses `useSession(state => state.subagent)` — valid `SessionSnapshot.subagent` field
(`dsh-cordis-client-runner/lib/client.js:2383`) — and hides cards in subagent sessions (manual-only).

**Hooks/cleanup/perf.** Effects: locale/styles/definition disposers returned and owned by `ctx.effect`; the
reveal layout effect cleans its listener/timer; no other listeners; `Intl.Segmenter`/fold work is memoized;
the only repeated-churn cost is R4/R13. React 18.2 is what the shell ships (`dsh-web-frontend/package.json`
devDependency `react ^18.2.0`, bundled in `dist`); all used hooks/APIs are 18-compatible; the shell's
production bundle does not wrap the app in `StrictMode` (only the React namespace export exists), so the
double-invoke caveat is dev-only; the reveal guard would still behave correctly.

**Copied-primitive fidelity (spot-checked against the shell's bundled primitives).** `FoldedText` is a
line-for-line copy (same `WIDE_GRAPHEME`, `FOLD_WIDTH`, grapheme loop, `aria-expanded/controls`, id on the
text); `TextShimmer`/`DisclosureRow` match the official implementations
(`dsh-web-frontend/dist/assets/index-BgUyXZcc.js:642477` region: `data-open`, `data-has-accessory`,
`data-expandable`, leading-button vs span, Enter/Space handler, `inert` decoration); `Button`/`Tag` are
simplified wrappers. The settings `SegmentedControl` is the one primitive that was simplified (R2c).

---

# 4. Behavior that is only manually verified + missing automated coverage

The `node --test` suite is entirely pure/data-layer (stub React returns `null`; no DOM, no component render,
`apply()` never invoked). Manual-only today:

1. Any card/process-row/settings rendering and interaction (chips, preview, conflict row, dismiss/restore,
   tags, status line, fold toggle, process-row expand/inspect).
2. `apply()` and every slot registration (names, options, ids, order, locale, icon-id match, disposers) —
   tests only assert `typeof apply === 'function'` and string presence in the bundle.
3. Fill on click, conflict flow end-to-end, "我们的草稿" ownership detection in a real composer,
   `focusComposer` (not documented by the platform; tech doc §T0-3 flags it as unwrapped API).
4. Send mode (`setDraft` → `submit` ordering, sent status, queued-vs-busy behavior) — no test, no live check.
5. Dismiss/filled marks across a real restart (README: "needs a restart on your side"), per-session
   persistence, fork behavior, localStorage unavailable/quota behavior.
6. Settings persistence across restart and effect on already-mounted cards; "Reset card states" effect.
7. Locale switch at runtime (card copy, settings label, icon nav label) and fallback for de/es/fr/ja/pt/ru.
8. Live-tail reveal animation, scroll position behavior, historical instant mount, reduced-motion behavior,
   double-card/two-cards-per-session layout.
9. Subagent filtering (card hidden in a subagent transcript).
10. Process-row running shimmer, state transitions, inspect action, error/not-shown expansion.
11. Real-theme visual parity (light/dark, contrast), focus-ring appearance, zoom/font-size (the copied CSS
    uses `--dsh-content-font-delta`); no screenshot/DOM test exists.
12. Running-bundle revision: the live GUI authenticated page cannot be fetched from this environment
    (`curl` → "dsh web authentication required"), so "the artifact under test is the artifact the user's
    GUI is running" could not be proven; the on-disk artifact passes `--check`.

Missing automated coverage worth adding (cheapest first):
- B1 guard test (`buildLocationData({state: undefined})`) and a test that `match` ignores
  non-append `tool/result` and other turns' events.
- Cross-file identity test: bundle id === `package.json.name` === `index.js name` === patch row name.
- Locale parity test: EN/ZH same key set, placeholders equal, every key used by
  `t(...)`/`cardStatusKey`/`noteToLocaleKey` present, and `fallback.context`/`status.sent` reachability.
- Bundle-purity static test: no `import`/`export`, exactly one `require('react')`, no
  `innerHTML/dangerouslySetInnerHTML/eval/new Function`, no `@deepseek-ai` strings, no markers.
- Status-precedence test for the card's `statusFromState ?? statusKey` composition (would have caught B3).
- CSS token test: every `var(--dsw-*)` used is defined in the shipped theme bundle (would have caught R3).
- A minimal DOM/happy-path render test (react-dom + jsdom, or a fake `h` that records the tree) for
  chip tags/aria, conflict row swap, dismiss/restore, and settings segmented control (would catch R2).
- A fake `ctx` test invoking `apply` to assert the four registrations and their options/disposers.

---

# 5. Audit gaps / confidence

- **High confidence** (static + asar contract + reproduced): B1 (TypeError reproduced), B2 (id/loader
  contract read from shipped loader + boot manifest logic), build reproducibility, bundle purity, slot/Definition
  /locale/theme contract facts, R3 token, R4 dead code, R2a/b, R8–R11 code facts.
- **Medium confidence** (code reading, no runtime): B3 send-path synchrony and real UI effect of the status bug;
  reveal animation behavior and the R5 edge; focus-loss impact; whether `applyDirtyLocationData` throw is
  swallowed anywhere higher up (searched: no catch in `ui-conversation` rebuild path; an uncaught exception
  would at least break that rebuild loop).
- **Cannot verify here:** the live GUI's running bundle (auth-gated page), visual parity/dark-light, real
  composer/restart behavior, macOS desktop vs browser-only differences, and any interaction on the user's
  active session. No plugin/tool calls were made; no DSH restart; nothing under `~/.dsh` was written.
- Cross-checks were done against the **shipped 0.2.2-rc.1 asar only** (read-only). The plugin's own
  design docs (PRD v0.8 / tech v1.0) were used for requirements, and their internal contradictions are
  reported in B3 rather than resolved.

## Recommended fix order before publish

1. B1 one-line guard + definition test (crash; hours).
2. B2 id single-source + cross-file test + rename/rebuild + patch row + license/attribution + remove
   `private` + add `engines.dsh` (half day, plus a product decision on the final package name).
3. B3 decision + fix (remove send mode **or** fix status precedence, update README/tech-design/tool copy,
   manually verify send mode) (hours–day).
4. Then the R-list in priority order: R3 token (one word), R6 guards (small), R2 a11y (day), R8/R9/R11 (product
   calls), R4/R1/R14/R10 hygiene before the public tarball is cut.
