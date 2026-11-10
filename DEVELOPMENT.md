# @local/dsh-next-actions

> **迁移说明（2026-11-09）**：本文件是原 README 开发日志，保留作开发历史。仓库整理后，设计文档移至
> `docs/design/`，审计报告移至 `docs/audit/2026-11-09/`；文中出现的 `design/...`、`research/release-audit/...`
> 路径分别对应这两处新位置。面向插件市场的正式 README 是审计 P0-4 任务，当前根目录 README 为仓库整理版。

Shows a card under completed replies with 1–2 sentences of context and 1–6 clickable next steps.
Clicking a suggestion only **fills the input draft** — it never sends. The card and its process-group
row are visual copies of DSH's official action card (0.2.2-rc.1), with three intentional differences:
the card shows no visible title (the context line leads with a 16px brand mark; `aria-label` stays
「下一步建议」), dismiss moved from a footer button to a minus button at the end of the status row, and a
fixed-height instruction preview slot.

Working name note: the package is `@local/dsh-next-actions` to stay distinct from the community plugin
`dsh-nextsteps`; the product name remains **下一步建议 / Suggested next steps** (used as the card's
`aria-label`; no visible title is rendered).
Nothing is published; the `@local` scope keeps the workspace install path private.

Design docs (workspace):
- `design/next-step-suggestions-prd.md` — product form (v0.8, includes §14 current design + philosophy)
- `design/next-step-suggestions-tech.md` — technical design (v1.0)

## Status

| Stage | Scope | State |
|---|---|---|
| M0 | scaffold: manifest, patch, locale, icon, placeholder client, README | done |
| M1 | Host half: `lib/normalize.js`, `index.js`, unit tests | done |
| M2 | client data layer: `lib/view-model.js`, Conversation Definition, zero-dep build, tests | done |
| M3 | card UI: official-copy CSS/markup, fold/preview/fill/conflict/dismiss (interactions pulled forward from M4) | done |
| M4 | visual parity + E2E on the live GUI | done (live-verified 2026-11-09) |
| M5 | process-group one-line row (copied ProposeRow/DisclosureRow) | done |
| M6 | settings section (per-turn count / click mode / reset) + Host-gated card switch + subagent filtering | done |
| M7 | host-backed card states | dropped (settings survived restart in the live check) |
| M8 | budget measurement + docs + live verification + process-row shimmer + auto count + click mode + icon + durable triggering + titleless card | done |
| M9 | live mount reveal (height/opacity transition for the turn-tail insertion, gated on the live tail) | done |
| M10 | token gates: root-agent tool `when`, Host `enabled` config, deferred-activation evaluation | done |

Live verification (2026-11-09, installed in the `desktop` profile): cards for turns 12 and 13 render after a
hard refresh, hovering between chips no longer shifts layout, and the client display settings work; the client
settings survived a restart, and the card gate now lives in Host config (see M10) instead of localStorage. Process-row running state uses the official TextShimmer copy (reduced-motion aware). The per-turn
count setting now defaults to **Auto** (show the model's 1–6 suggestions); a fixed 1–6 cap is still available.
Click behaviour is a setting too: **Fill input** (default) or **Send**; dangerous suggestions always only fill.
Remaining check (needs a restart on your side): card marks (filled/dismissed) across restart.

Triggering (2026-11-09): the first conversation compaction showed that the model stops calling the tool —
the “always call it” habit lived in the conversation, and compaction removed it while the tool description
alone was treated as optional. The Host half registers a durable system-prompt section per **root agent**
(`tool:suggest-next-steps`, skipped for subagents, disposed with the plugin) so the behaviour survives
compaction, reload, and session resume. That section cost ~96 tokens/request in v3; the v4 wording below raises
it to ~143 (+47) in exchange for objective trigger conditions.

Prompt layout (v4, 2026-11-09): the four model-facing layers now own one concern each, so no rule is paid
for twice. The **tool description** is capability + one hard display rule (“clicking fills the input, never
list the steps again”); the **system-prompt section** carries the trigger/skip checklist, now written as
objective facts about the turn the model can check itself — *finished/advanced a task, tools ran, files
changed, review or approval is due, or it was about to end with a list of next steps* — and keeps those
steps only in the card (`at most one lead-in sentence; never numbers or bullets them`). The blunt
“If unsure, skip” is split: a substantive work turn when unsure still calls with 2–3 safe options, a
trivial/social turn skips; turns that only repeat the previous card or already asked a structured question
skip too. The **JSON Schema descriptions** carry the field-level quality rules (≤120-char context,
1–3 (max 6) distinct angles, short imperative ≤16-char labels, send-as-is prompts that cite this turn's
files/commands, stance semantics, exactly one recommended, danger only for irreversible/paid/permission
changes). The **tool result** text is the last instruction before the final answer (“write it now, do not
list/number the steps, keep one lead-in sentence, do not call again”). Real cost: always-on prompt budget
went from ~415 to ~507 tokens/request (+45 declaration, +47 guidance) and the model-visible result from 22
to 43 tokens once per call; the trade was accepted for trigger recall on work turns and card quality.
`tool.test.mjs` guards the layer split (description must not restate schema rules; guidance must not carry
field rules) and the two-tier uncertainty. Changing this text **needs a DSH restart** to load; no extra
model calls.

Token gates (P1, 2026-11-09): three cost reductions on top of the v4 budget.

1. **Root-agent `when` (implemented).** `ctx.tools.register(TOOL, { when })` now carries a per-model-step
   condition that admits root agents only. Subagent steps omit the ~364-token tool declaration entirely
   (the guidance section was already root-only); a missing or broken root registry fails open, so a Harness
   change cannot silently hide the tool. Unknown agents keep it too: the card renders in the main
   conversation only, and the gate must not remove a working tool by accident.
2. **Host `enabled` config (implemented).** The "show cards" switch moved out of client localStorage into
   the plugin's Host config. The package is a zero-import `link:` dependency, so it cannot export a
   Schemastery `Config`; Cordis passes the raw row config through and `apply(ctx, config)` defaults it
   (`{ enabled: true }`). With `enabled: false` the plugin registers neither the tool nor the prompt section,
   so the feature costs **0 always-on tokens** instead of ~507. Toggle it in the profile's user patch layer
   (an id-targeted patch replaces the whole row config, so restate the name):

   ```yaml
   # ~/.dsh/profiles/desktop/cordis.patch.yml
   - id: dsh-next-actions
     name: '@local/dsh-next-actions'
     config: { enabled: false }
   ```

   The base bundle enables HMR whenever the launcher supplies a profile context (shipped Web/Desktop do;
   headless/SDK disable it), and HMR watches the profile patch layer: toggling this row recomposes it live
   without a restart, while a profile without HMR applies the change on restart. The client-side
   "Show next-step cards" switch was removed; Settings now shows a read-only note pointing at this gate.
   No in-app form yet: the settings form projection requires a real Schemastery `Config` (it feeds
   `schema.toJSON()`/`dict`/`meta`), which a linked zero-dependency package cannot import. When the package
   is installed with its dependencies, exporting `Config` and registering a `plugins.row.config` (or
   `plugins.bundle.config`) client page would put the same switch back in the Plugins page.
3. **Deferred activation (evaluated, not implemented).** The same per-step `when` could gate the tool *and*
   guidance until the root agent's first tool result (`activation: 'after-tool'` behind the raw Host config),
   saving ~507 tokens on every request before the first tool use. DSH documents tool visibility as
   prefix-stable while definitions are unchanged; on routes that accept tool updates the activation is an
   append-only `tool-addition`, so cached prefixes survive (the official `propose_action` card relies on
   exactly this), while other routes re-prefix once. The saving concentrates on chat-only sessions — where
   the two-tier trigger rules already say no card belongs — and costs cards on non-tool work turns; the
   guidance must be deferred with the tool so it never instructs a hidden call. Recommended next step is a
   config flag plus a 20-session A/B; §5.7.2 of the tech design owns the analysis.

Card header (2026-11-09): the visible 「下一步建议」 title is gone — the context line now leads the card
with the 16px brand mark (solid fills, no shared SVG ids), 13px/1.6 secondary text. The 「显示标题」
setting was removed; `aria-label` still names the card 下一步建议 for screen readers.

Dismiss / restore (v0.7 + v0.8): the bottom-right 「暂不需要」 footer is gone. The status row hosts the
status text on the left and a 28×28 ghost state toggle on the right. In the suggestion state it is a minus
(16px icon, `title`/`aria-label` keep the official 「暂不需要 / Not now」 copy); after dismissal it becomes a
plus (「恢复建议 / Restore suggestions」) that writes `dismissed: false` and brings the controls, preview and
status back — the two directions of one action. Conflicting input shows text only. Cards are ~40px shorter
than before.

Live mount reveal (2026-11-09, M9): the card no longer appears by inserting its full height in one frame.
DSH 0.2.2's **default** “when to collapse work details” is *on completion*: `turn/end` mounts this
turn-tail row in the same React commit that instantly folds the finished turn's work rows, and then lands
a following reader through its instant-fold compensation (`ChatViewport.measureClosing` /
`keepAboveClosing`). A full-height insert in that frame moves the just-read answer up by the card height in
one frame (≈280–430px once margins, chips and the action row are counted), which reads as the page being
yanked back to an earlier position — worst with agentic turns whose process rows collapse by hundreds of
pixels in the same frame. The card now renders inside a `.dshns-reveal` wrapper that starts **collapsed**
(so DSH's same-commit fold measurement sees no card height), then animates `max-height` 0 → measured height
over 180ms and `opacity` 0 → 1 over 140ms; the transcript's scroll layer follows the growth frame by frame
instead of once. The reveal runs only when the card mounts at the **live tail** (`distanceFromTail ≤ 96px`,
i.e. the reader is following the bottom) and the turn's `turn/end` is at most 5s old, so cards rendered on
session open/rebuild and readers inspecting history keep the instant mount; `prefers-reduced-motion: reduce`
skips it entirely. The policy is pure and DOM-free in `lib/view-model.js` (`CARD_REVEAL`,
`shouldRevealCard`) so `node --test` covers it; the fixed-height instruction preview slot is unchanged.
The built `client.js` changes, so the desktop profile needs a DSH restart to load the new bundle. Live check:
in a plugin session, finish a reply at the bottom — the card should grow over ~180ms instead of shifting the
answer up in one frame; scroll up and let another card mount — it should appear instantly; enable reduced
motion — instant as well.

**Installed for verification** into the `desktop` profile (link install) on 2026-11-09; remove it with
`plugin_manager` `remove_bundle` when done. Live checks: cards rebuilt after a hard refresh, no hover layout
shift, the client display settings work and survived a restart, and the Host `enabled` gate is read from the
profile patch. Not yet separately checked: 「已忽略/已填入」marks across a restart, the process-row running
shimmer, and a live toggle of the Host gate through profile-patch HMR.

## Icon

`icon.svg` follows the shipped plugins' artwork spec: a 36×36 viewBox on a transparent background, drawn
in the DSH blues (#67C7FE → #3F77D8) with a mint (#41E1AC) sparkle — three descending suggestion bars for
“next steps that get shorter”, with the spark for a suggestion. The manifest declares it as
`"icon": "./icon.svg"` (and still exports `./icon`), so Settings → Plugins shows it on the package card.
The Settings navigation row gets a matching 16px monochrome list + sparkle glyph (`SectionIcon`, registered
on `settings.section.icon`) instead of the generic gear. The four explored directions are kept in
`design/icon-options/`; only `icon.svg` ships.

## Layout

```text
dsh-next-actions/
├── package.json            manifest (dsh.bundle.patch + dsh.client + icon)
├── cordis.patch.yml        one Host row + raw `enabled` config (toggle recipe in comments)
├── index.js                Host half: zero-import tool definition + per-agent prompt guidance
│                           (four-layer prompt split: description / section / schema / result;
│                           root-only `when` gate; raw Host `enabled` config gate)
├── lib/
│   ├── normalize.js        pure host normalization + tool/result.meta builder
│   └── view-model.js       pure client view logic (defensive meta parse, args fallback,
│                           display model, draft conflict machine, settings codecs without the
│                           removed client switch, process row state, live reveal policy)
├── src/
│   ├── client.js           browser bundle template (card + live reveal wrapper + process row
│   │                       + definition + settings + nav icon)
│   └── styles.js           official-copy card/process-row CSS (dshns- classes, tokens only)
├── scripts/
│   └── build-client.mjs    zero-dependency build: inlines view-model.js + styles.js into client.js
├── client.js               built single-file browser bundle (committed)
├── locale/{en,zh}.json     plugin-manager display metadata
├── icon.svg                plugin artwork (official spec: 36×36, transparent, manifest icon)
├── design/icon-options/    candidate artwork studied while picking the icon (not shipped)
├── design/compare/         side-by-side with the built-in action card (design record, not shipped)
└── test/
    ├── normalize.test.mjs  Host rules (55)
    ├── tool.test.mjs       registered tool definition + prompt guidance + token gates (31)
    ├── view-model.test.mjs client pure logic (68)
    ├── definition.test.mjs built bundle's Conversation Definition fold (16)
    └── build.test.mjs      client.js freshness + bundle content (11)
```

## Measured budget (live)

| Metric | Value |
|---|---|
| Tool declaration (name + description + JSON Schema + output schema) | 1,456 chars ≈ 364 tokens/request |
| System-prompt guidance (always-on, root agents) | 570 chars ≈ 143 tokens/request |
| Always-on prompt total (declaration + guidance) | ≈ 507 tokens/request |
| Subagent steps (root-agent `when`, M10) | declaration and guidance both omitted → **0 tokens** (−364 vs. v4) |
| Host `enabled: false` (M10) | tool and section are not registered → **0 tokens** always-on |
| Real arguments per call (3 suggestions) | 482 chars ≈ 121 tokens |
| Model-visible result (card shown / no card) | 173 chars ≈ 43 tokens (57 chars ≈ 14 tokens) |
| Persisted `tool/result.meta` | 524 chars (log only, not model context) |
| `buildMeta` | 4.39 µs/call |
| Extra model calls | 0 |

## Build and test

```sh
cd plugins/dsh-next-actions
node scripts/build-client.mjs          # regenerate client.js after src/ or lib/ changes
node --test                            # 181 tests
node scripts/build-client.mjs --check  # fail when client.js is stale
```

## Install

Already installed for verification with DSH `plugin_manager` `install_bundle` (absolute directory,
`link:` dependency). Remove with `remove_bundle` + restart. Do not hand-edit
`~/.dsh/profiles/*/package.json` or `cordis.patch.yml`.

Verification:

- `cordis_inspect_query host Config.listConfigs {name:"@local/dsh-next-actions"}` — row present (no Config is expected).
- `Slots.listSubTree {root:"conversation.chat.turnTail"}` — contains the package id.
- `Slots.listSubTree {root:"tool.call.toolview"}` — contains key `suggest_next_steps`.
