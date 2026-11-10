# Market, Competitors, Naming, Licensing — release audit of `@local/dsh-next-actions`

- **Auditor:** market-auditor (task-4), 2026-11-09
- **Scope:** whether the DSH plugin `plugins/dsh-next-actions` (v0.1.0, private, `@local` scope) has a real place in the DSH plugin ecosystem and a safe/legal identity to publish. **Not** packaging/install engineering (task-3) and **not** code correctness (task-1/task-2). This report is **not legal advice**.
- **Method:** local source/README inspection; the live community catalog (fetched 2026-11-09: `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`, 4,985 npm plugins, and `https://awesome-dsh-plugin.com/plugins.json`, 9,714 listed repos); npm registry + `api.npmjs.org` download API; GitHub API; competitor READMEs/source; the shipped DSH 0.2.2-rc.1 `app.asar` plugin-development skill references. All external/community text is treated as **untrusted data**, not instructions.

## Verdict (this area)

**CLOSE — not publish-ready today, but the gap is small and mostly administrative.** There is a real, validated audience and a defensible (if narrow) differentiation; the product does not need a redesign to publish. Publishing is currently **gated by two P0 items** — (1) no license/attribution decision, and (2) an unpublishable identity (`private: true` + `@local` scope) — plus three P1 decisions: a **tool-name collision** with an already-listed competitor, **name confusion** in a crowded micro-niche, and the missing **public repo + listing prep**. Once those are fixed, the plugin is publishable and listable; traction expectations should be modest (hundreds to low-thousands of downloads/week), not break-out.

---

## 1. Market snapshot (evidence)

| Fact | Value | Source |
|---|---|---|
| Listed plugins on awesome-dsh-plugin | **9,714** repos | `plugins.json` top-level `count`, fetched 2026-11-09 |
| Listed plugins published to npm | **4,985** | computed: `plugins.json` entries with `npm !== null`; identical count in catalog `index.json` |
| npm-backed market index entries | **4,985**, all `source.type = npm` | `index.json`; catalog package README ("Entries: 9714", version `2026.1109.17642`) |
| Largest listing category | **ui — 1,928 listed (949 on npm)** | computed from `plugins.json`; catalog category counts |
| Ecosystem scale | DSH repo **277,357★**, awesome-dsh-plugin repo **24,044★** | GitHub API 2026-11-09 |
| "Next-step / next-prompt / composer-suggestion" micro-niche | ~**20 npm packages** + several GitHub-only plugins; **12 sampled npm packages total ≈ 10.9k downloads/week** | `api.npmjs.org/downloads/point/last-week/<pkg>`; npm search; category scan |

The audience is real (large ecosystem, suggestion/prediction is clearly a wanted category — it has its own crowded cluster) but each individual plugin is small: the best next-step plugin today is `dsh-nextsteps` at **3,634 downloads/week**, ~2 days after first publish. This is a **fast-moving, crowdable niche**, not an empty one.

---

## 2. Competitor inventory (verified names)

Task context named some plugins that are **not** in this market — verified and corrected:

- `dsh-nextsteps` — **exists on npm** (v1.4.11) but is **not yet listed** in awesome-dsh-plugin as of 2026-11-09. The developer README's "working name" note is right: it is the closest name and concept.
- `dsh-suggest-actions` — exists, listed, npm.
- `dsh-suggest-ghost`, `dsh-next-prompt`, `dsh-next-input`, `dsh-composer-assist`, `dsh-composer-predictions`, `dsh-prompt-for-me` — all exist.
- `dsh-work-continuity` — exists only as a GitHub-only listed plugin (`Icstick`), and is **unrelated** (long-task continuity), not a suggestion plugin.
- `dsh-user-experience` — exists on npm but is **unrelated** (source-code UX review), not a suggestion plugin.

### 2.1 Closest direct competitors (clickable next-step cards/buttons under the reply)

| # | Plugin | Kind / install | Latest & activity | npm dl/wk* | ★ | Listed? | Click behaviour | Extra model call? | Settings | License |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **dsh-nextsteps** (`klaus-2`) | npm; tool `suggest_followups` + turn card | **v1.4.11**, created 2026-11-07, **20 releases in ~15 h**, last push 2026-11-08 | **3,634** | 1 | **No** (yet) | click **sends** | no (same-turn tool) | Settings page: language (15/auto), 1–6 per turn, title; restart-persistent cards; in-app updater | MIT |
| 2 | **dsh-suggest-actions** (`hiJoeLee`) | npm; tool `suggest_actions` + turn-tail buttons | v0.1.16, since 2026-09-26, last 2026-11-07 | 1,039 | 4 | **Yes** (ui) | click **sends**; separate right button **fills** | no (same-turn tool) | only bundle-patch `maxActions`; no settings page | MIT |
| 3 | **dsh-next-steps** (`xiaoxiaolelang-ai`) | GitHub-only (no npm); tool **`suggest_next_steps`** (identical to ours) | repo v0.1.19, README documents persistent prompt section (order 10250) | n/a | 0 | **Yes** (ui) | click **sends**; **Shift+click fills** | no | profile `cordis.patch.yml` (`maxActions`/`history`/`prompt`); zh-only README | MIT |
| 4 | **dsh-next-step-suggest** (`anye-99`) | GitHub-only tarball | listed; chips overlay above composer | n/a | 0 | **Yes** (ui) | click **fills** draft (appends) | **yes** (aux LLM call per turn) | localStorage toggle + manual regenerate; injection guard | no LICENSE visible in fetch |
| 5 | **dsh-suggest-ghost** (`dsh-plugin-collection`) | npm; composer ghost text | v0.9.0, last 2026-11-06 | 932 | 7 | Yes | Tab **accepts** into draft | likely aux generation | unknown from quick pass | MIT |
| 6 | **dsh-prompt-predict** (`ferrisching`) | npm; composer ghost text | v0.2.14, last **2026-11-09** (most active ghost plugin) | 1,035 | 3 | Yes | Tab/Esc | aux generation | README/config documented | MIT |

\* npm `last-week` downloads via `api.npmjs.org` on 2026-11-09; includes mirrors/CI, not unique users. The awesome site's own 30-day figures differ in magnitude (e.g. dsh-suggest-actions 1,779; dsh-prompt-predict 3,492; dsh-composer-predictions 3,502) — use these as relative scale only.

### 2.2 Adjacent cluster (composer prediction / ghost text / prompt assist) — crowded

`dsh-composer-predictions` (npm 1.2.8, 481 dl/wk, 3★), `dsh-next-input` (0.2.10, **1,597 dl/wk**, settings page + rolling-summary auxiliary calls), `dsh-composer-assistant` (0.4.1, 699 dl/wk), `dsh-composer-assist` (0.1.1, 250 dl/wk, **17★** — most-starred in the cluster), `dsh-ghost-prompt` (1.2.2, 389), `dsh-prompt-for-me` (0.6.2, 339), `dsh-input-prediction` (0.2.0, 204), `@studyzy/dsh-suggest-prompt` (1.2.3) and multiple GitHub-only entries (`dsh-tab-complete`, `dsh-prompt-suggestion`, `HwFee-dsh#predict`, `DSH-suggestions`…). These solve "guess my next message in the composer"; **they are an adjacent UX family, not identical**. Most pay an extra per-turn model call; ours does not (the tool call rides the turn that was happening anyway).

### 2.3 How the project itself frames the novelty

The PRD (§ appendix, `design/next-step-suggestions-prd.md` ~562–565) states the additions over community practice: **context sentence, default fill instead of direct send, input-conflict protection, strict reuse of the official card + process-row shape.** That framing is accurate against the competitors above.

---

## 3. Differentiation — honest assessment

### Genuinely different (defensible, but must be marketed explicitly)

1. **Fill-only by default, never auto-send; dangerous suggestions always fill only.** Every direct click-card competitor defaults to *sending* on click (dsh-nextsteps, dsh-suggest-actions, dsh-next-steps); dsh-suggest-actions only offers fill via a side button. Ours: default `fill`, optional `send` setting, and dangerous suggestions override to fill regardless (`src/client.js:458–465`, `src/client.js:693–695`, locale strings `client.js:50–55`). This is the clearest **safety** wedge for agentic work.
2. **Official-card visual/behaviour parity** — the card frame, process-row one-liner, preview slot, dismiss/restore and reduce-motion behaviour are copied from DSH 0.2.2-rc.1's own action card (`src/styles.js:1–15`, `README.md:3–8`). No competitor in this niche renders the *official* card frame; `dsh-next-steps` is a 2×2 button grid, `dsh-suggest-actions` a button row, the ghost plugins only text. This is the strongest "quality/native feel" differentiator and the most screenshot-able.
3. **Durable triggering that survives compaction** — a Host system-prompt section registered per root agent (`index.js:52–79`), so the "call once at turn end" habit is not lost when the conversation is compacted (the README documents the compaction failure it fixes, `README.md:42–48`). Caveat: `dsh-next-steps` also adds a persistent prompt section (order 10250), so this is *better engineered* (root-only `when` gate, config-gated, objective trigger checklist, tests) but **not categorically unique**.
4. **Root-only / subagent-gated + true 0-token off switch** — Host config `enabled: false` registers neither tool nor guidance (`index.js:177–215`, `README.md:76–80`); tool `when` excludes subagent steps (`index.js:10–13`). Cost control is better than competitors.
5. **Danger marking + status row + input-conflict handling + per-turn count (Auto/1–6) + click-mode setting + reset** — cohesive small-UX polish; rivals have only subsets.

### At parity (not a reason to switch)

- Card/buttons under the reply, one-click follow-up, per-turn attribution, click-to-act; all direct competitors have this.
- No extra model call (same-turn tool call): dsh-nextsteps and dsh-suggest-actions also avoid an extra call; ours is not unique here.
- zh/en UI: dsh-nextsteps has 15 languages; `dsh-next-input` has full zh docs/settings. Our two locales are adequate but not a differentiator.

### Weaker than competitors (must be honest in marketing or fixed)

- **No in-app settings page**: per-turn count / click mode / reset live in the client settings section, but the master switch is only a profile `cordis.patch.yml` edit (`README.md:71–96`); dsh-nextsteps has a full Settings page and an in-app updater; dsh-next-input has a documented settings UI. This is the biggest feature gap.
- **No published user-facing README**: current README is a development log (English, milestone tables, token budgets); users get no install instructions, screenshots, or "how to use" — a listing/readme reviewer will notice. No changelog.
- **Always-on cost**: ~**507 tokens/request** (tool declaration ~364 + guidance ~143; `README.md:62, 192–193`). Ghost-text competitors charge an extra call per turn instead; tool-only competitors (suggest-actions) charge roughly the declaration only. Defensible trade-off, but must be documented (it is, only in the dev log).
- **No app-level localization breadth / updater / usage telemetry**: acceptable, but dsh-nextsteps is far ahead on productization.
- **Copy of an experimental UI**: the official action card belongs to the experimental `@deepseek-ai/dsh-personalized-recommendations` bundle, which **ships disabled by default** (`README.md:13` of that package: "shipped profiles leave it disabled"). Copying it is sanctioned by the official plugin guidance (see §7), but the frame may change between DSH releases; keep parity ownership (already flagged in the PRD §14.4).

### Audience verdict

Real but modest; **not blue ocean**. A well-positioned release can plausibly reach 500–2,000 downloads/week and be a genuinely useful reference plugin, but it will not dominate: dsh-nextsteps already has stronger product features and a 2-day head start, dsh-suggest-actions holds the "first listed" slot, and the awesome list may apply its **duplicate-coverage** rule (contributing.md:101: first-listed is a tiebreaker, "a fork *is* added when it is the better-kept one, or when it genuinely adds something"). Our listing case must be argued on **safe fill-only + native card + durable triggering**, not on "next steps under replies" (already covered).

---

## 4. Recommended positioning

**One-liner (recommended):**
> **The next-step card that fills your draft — never sends. Native DSH action-card look, danger-aware, and it survives compaction.**

Alternates:
- "Review-before-send next steps in the official card style."
- "Official-style next-step card, fill-only by default, danger-aware, compaction-proof."

**Pitch discipline:** lead with *fill-not-send* (safety) and *the card looks and behaves like DSH's own action card*; explain the durable trigger in one sentence ("the 'suggest next steps' habit lives in the Host prompt, so it does not disappear after a long session is compacted"). Do **not** claim official affiliation; say "unofficial community plugin". Do not claim "no token cost" — say the always-on cost is ~500 tokens/request and can be switched off entirely (0 tokens) in the profile config.

**Target user:** people doing agentic/engineering work in DSH who want a reviewable next action (not an auto-sent one); people who saw the official action-card design and want the same card for "what now?"; users of long sessions where the conversation habit gets compacted away.

---

## 5. Catalog listing requirements & submission path (verified)

### 5.1 How to get listed (exact path)

1. Create a **public GitHub repo** for the plugin (the listing is repo-based, not npm-based) that declares a `dsh.bundle` manifest in its root (or a `packages/`/`plugins/`/`apps/` subpackage) — ours already has `dsh.bundle.patch` (`package.json:22–26`), which is the most-common rejection reason when only `dsh.client` is declared (contributing.md:58–61, 163).
2. The repo must be **at least 1 day old** at PR time (contributing.md:79) and **actively maintained** (82), and have the **`dsh-plugin` GitHub topic** (83).
3. Open **one PR** to `awesome-dsh-plugin/awesome-dsh-plugin` adding one file `data/plugins/<owner>__<repo>.yml`:

```yaml
url: https://github.com/<owner>/<repo>   # must match the repo exactly (contributing.md:12)
name: <owner>/<repo>                     # link text (13)
category: ui                             # ours is a UI enhancement (14)
description:
  en: One sentence, accurate, no marketing superlatives.   # required (15, 24, 85)
  zh: 一句话描述（可选；缺了维护者会补）                    # optional (24)
# icon: https://raw.githubusercontent.com/<owner>/<repo>/main/assets/icon-180.png  # optional (21)
```

   The site READMEs/plugin pages regenerate automatically; do not edit them. This is the whole submission (contributing.md:8–30).
4. **No npm publication is required for listing**: "listing is unaffected either way" (contributing.md:236–242). A GitHub-only entry can also attach a prebuilt tarball via an optional `tarball:` field (119–131).
5. **npm publication *is* effectively required for the in-app "Plugins → Discover → Index sources" route**: the community market index `index.json` is generated only from entries with an npm package + version (all 4,985 entries have `source.type = npm`; `scripts/build-site.mjs:180–196` logs and skips "no npm package or version yet"). No npm package → no Discover entry/download count, although GitHub-source install still works. Publishing to npm is also the recommended install path because prebuilt installs skip the `allowBuilds` build-approval step (contributing.md:119).
6. Storefront extras (all optional): **icon** must be a GitHub-hosted **raster** png/jpg/jpeg/webp (~96 px; **SVG and third-party hosts are refused**, contributing.md:190) and **screenshots** via `screenshots.json` next to `package.json` (1–8 repo-relative image paths; contributing.md:196–228).
7. Review is human: accurate description is checked against code; the duplicate-coverage criterion applies (101); "being listed is not a security review".

### 5.2 Fields generated automatically (nothing to author)

`publishTimestamp`, `engines.dsh`, `versions[].source`, `stars`, `downloads`, `homepage`, `repository` in the catalog index are generated from the repo + npm probes (build-site.mjs). No license field exists in the listing or catalog index schema. `engines.dsh` is optional in the index (1,630/4,985 entries have it) but shows compatibility and is worth filling.

### 5.3 Important metadata coupling for npm ↔ listing

The catalog maps a listed repo to an npm package via the npm package's `repository` field, not via the YAML (contributing says a hand-written `npm:` key is rejected). So the published `package.json` must set `repository` to the GitHub repo URL; otherwise the catalog will not show the npm version/downloads and Discover may not list it. Our package currently has **no `repository`, `homepage`, `author`, `keywords`, or `engines`** (see §6/§8).

---

## 6. Naming

### 6.1 Current state

- Package: `@local/dsh-next-actions` v0.1.0, `private: true`, no npm identity. `@local` is a workspace-local convention, **not an npm org the maintainer owns**; publishing scoped packages requires owning the `@user`/`@org` scope (npm docs). `private: true` must also be removed to publish. Product name in the card (aria-label) is 「下一步建议 / Suggested next steps」.
- npm registry now: `dsh-next-actions` → **HTTP 404 (available)**; GitHub repo search `dsh-next-actions in:name` → **0 repos**. No trademark hit found for the name.
- The plugin **build artifact embeds the package name as its module id** (`client.js` header: "the module id must equal the package name"), so renaming the package requires rebuilding the client — coordinate the name decision before release, not after.

### 6.2 Collision / confusion risks

1. **Same-name conflict on npm is absent, but semantic confusion is high**: the listed GitHub-only plugin **`dsh-next-steps`** and the npm plugin **`dsh-nextsteps`** (3,634 dl/wk) use synonyms of "next steps"; "next actions" will read as the same product to users scanning a list. Mitigation: always pair the package name with the positioning tagline in the entry description ("…that fill your draft instead of sending it") and in the card README; consider a name that carries the differentiator.
2. **P1 interop risk — the tool name collides**: our plugin registers tool `suggest_next_steps` (`index.js:23`); the listed plugin `dsh-next-steps` registers the **same tool name** (`https://github.com/xiaoxiaolelang-ai/dsh-next-steps/blob/main/index.js` lines 126–127 and prompt line 32). DSH's tool registry throws on duplicate registration: `tool "..." is already registered in this scope` (`app.asar: dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js:385`). A user installing both plugins would likely get an activation error for the second one. **Recommendation: rename our tool (`suggest_next_actions` or a plugin-prefixed name) and the durable prompt-section id (`index.js:62`) before v0.1.0 publish**, and re-run the tests that guard the prompt layers. (Not empirically tested — installing both in the live profile was forbidden — but the error path is explicit.)
3. `@local` scope is not publishable/meaningful to other users; drop it.

### 6.3 Proposed npm names (all verified available: registry 404 + no GitHub repo)

| Name | Status | Notes |
|---|---|---|
| **`dsh-next-actions`** (recommended primary) | npm 404 / GH 0 | Matches the working/project name, distinct from `dsh-next-steps`; 77% of the catalog's npm packages are unscoped. Keep product name "Suggested next steps", make the tagline carry the difference. |
| `dsh-safe-next-steps` | npm 404 / GH 0 | Leads with the safety wedge; longer; only pick if you will market "safe" consistently and the dangerous-action behaviour is guaranteed. |
| `dsh-next-step-card` | npm 404 / GH 0 | Leads with the official-card UX; most differentiated from the crowd; weaker keyword match for "next steps". |
| `dsh-suggested-actions` | npm 404 | Available, but closest in spirit to the listed `dsh-suggest-actions` — avoid. |

Scoped alternative (only if the maintainer owns an npm scope): `@<npm-user>/dsh-next-actions` — works, but unscoped is the ecosystem norm (3,827 of 4,985 npm packages; 762/949 ui npm packages are unscoped) and easier to type/remember. `@local` specifically is not an option.

**Trademark:** no DeepSeek trademark policy for plugins was found (searched web 2026-11-09; community naming profile is **not** authoritative). The `dsh-` prefix is de-facto ecosystem convention (all listed plugins in this niche use it) and the package/branding does not use DeepSeek's name/logo as a mark. Recommended low-risk hygiene: no "DeepSeek" in the package name, no official logos in icon/screenshots, and a short "Unofficial community plugin; not affiliated with DeepSeek" line in README.

---

## 7. Licensing / legal

### 7.1 Current state

- **No `license` field** in `package.json` and **no LICENSE file** anywhere in the plugin (verified by file listing). By default this means **all rights reserved** — the community can't legally redistribute it, and it conflicts with the copied MIT code (below).
- The card explicitly copies the official action card: `src/styles.js:1–15` ("Values are copied from the official action card and its primitives in DSH 0.2.2-rc.1 … Classes are renamed under the `dshns-` prefix and only theme tokens are referenced, per the official external-plugin guidance") and `src/client.js:9–10` ("the card renders the official action-card frame (copied markup/CSS, no Harness Client imports)"). The README itself says "visual copies of DSH's official action card (0.2.2-rc.1)" (`README.md:3–8`).
- The plugin follows the official copy conditions: 85 `dshns-`-prefixed class references and 45 `var(--dsw-*)` theme-token references in `src/styles.js`; **no literal hex colours in the stylesheet** (artwork-only exception not exercised there). Good.

### 7.2 Exact official guidance (shipped asar, DSH 0.2.2-rc.1)

- **Copying is explicitly sanctioned**, with conditions — `dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md:36`:
  > "Do not `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package as a module; … Write your own controls and match the host instead: **copy markup, CSS, and behavior from the primitive into the plugin** … **Rename copied classes under your plugin's prefix, keep only `--dsw-alias-*` token references, and keep the behavior that users rely on** …"
- **Icon must be original or licensed** — `references/host-plugin.md:35`: "Create an original icon or use artwork whose license permits redistribution, **retaining any required attribution**." Our `icon.svg` is original artwork (custom gradient/rects/sparkle, its own ids) and the in-card brand mark is the same icon reduced (`src/client.js:308–322`) — no DeepSeek logo is used. This item is satisfied.
- The copied source itself is **MIT**: `@deepseek-ai/dsh-action-cards` and `@deepseek-ai/dsh-client-ui-action-cards` are MIT in their package manifests; the shipped `@deepseek-ai/dsh-action-cards/LICENSE` reads **"MIT License / Copyright (c) 2026 DeepSeek"**. The DSH product repo is also MIT (`https://github.com/deepseek-ai/deepseek-harness`, repo license MIT).
- The action card belongs to the experimental `@deepseek-ai/dsh-personalized-recommendations` bundle; its README line 13 says "**shipped profiles leave it disabled**". Copying an experimental UI is technically sanctioned by the guidance above, but it can drift; that's a maintenance risk, not a licensing blocker.
- Note the guidance sanctions **copying**, but it is not a license waiver: MIT's condition — "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software" — still applies to substantial copied portions.

### 7.3 Decisions publishing requires (flag to user)

1. **Choose the plugin's own license.** Recommendation: **MIT** — matches DSH (MIT) and the copied package (MIT), matches all 12 sampled competitors, is the community norm, and is the simplest way to satisfy MIT's notice obligations for the copied card while granting users rights. (Apache-2.0 is also compatible with MIT sources but heavier; proprietary is incompatible with copying MIT code without retaining its notice/permission, and would make community listing/trust awkward.)
2. **Add `"license": "MIT"` and an `author` to `package.json`; add `LICENSE` (MIT, own copyright).**
3. **Add attribution for the copied official card**: keep the existing source-header acknowledgement and add a `THIRD_PARTY_NOTICES.md` (or a clearly visible README section + header comment) with the DeepSeek MIT notice: "Portions adapted from `@deepseek-ai/dsh-client-ui-action-cards` / `@deepseek-ai/dsh-action-cards`, Copyright (c) 2026 DeepSeek, MIT License" plus the MIT text. This is the concrete compliance step for the copied markup/CSS/behaviour.
4. **README must stop saying "Nothing is published; the @local scope keeps the workspace install path private"** (`README.md:13`) and must add the license + attribution section.
5. **Do not add third-party trademarks/logos** to the storefront icon or screenshots; keep the "unofficial, not affiliated with DeepSeek" line.
6. Product decisions like pricing/paid licensing: any paid/proprietary release still owes the MIT notice/permission for the copied card and would likely be listed only as a normal entry (the list has no license requirement, but community trust expects visible licensing).

---

## 8. Publish-blocking & risk register

### P0 — must fix before publishing anything public

1. **No license / attribution (legal).** No `license`/`LICENSE`; copied MIT code without notice = redistribution of MIT code without its copyright+permission notice; default proprietary claim is unintentional. Fix §7.3 items 1–4.
2. **Unpublishable identity.** `private: true` + `@local` scope (`package.json:2–4`). Fix: choose final public name, remove `private`, publish unscoped (or owned scope), set `repository` to the new public repo so the catalog/npm map can link them.

### P1 — fix before catalog PR / first release (cheap now, annoying later)

3. **Tool-name collision** with listed `dsh-next-steps`: both register `suggest_next_steps`; DSH throws `tool "..." is already registered` (`dsh-tools/lib/index.js:385`). Rename tool + prompt-section id now, before other plugins/users build around the name; update guidance text/tests (`index.js:23, 52–79`, `test/tool.test.mjs`).
4. **Name confusion** with `dsh-next-steps` (listed) and `dsh-nextsteps` (npm, fastest-growing). Finalize the name + a difference-carrying description before creating the repo; do not pick `dsh-next-steps`. If the safety wedge is the strategy, `dsh-safe-next-steps` is the clearest alternative; otherwise keep `dsh-next-actions`.
5. **No public repo yet** (workspace is not a git repo; no `repository` in package.json): create the public GitHub repo early to start the **1-day repo-age clock** (`contributing.md:79`), add the `dsh-plugin` topic, ensure `dsh.bundle` is in the manifest, and set `repository` in `package.json`.
6. **User-facing README missing.** Current README is a milestone/dev log with local design-doc references; a listing reviewer reads the repo. Write a user README: what it does, screenshot, install commands (npm + GitHub), settings, the fill-not-send safety rule, ~507-token cost + how to turn it off (0 tokens), compatibility (DSH 0.2.x), license + attribution.
7. **Duplicate-coverage review risk.** `dsh-suggest-actions` is already listed (clickable suggestions), `dsh-nextsteps` is likely to be submitted, and `dsh-next-steps`/`dsh-next-step-suggest` already cover the idea. Lead the listing description and README with the genuine additions (fill-only default/danger-aware, official-card parity, compaction-proof triggering) — otherwise "already covered" is a legitimate maintainer objection (`contributing.md:101`). Publish promptly: dsh-nextsteps had 20 releases in ~15 hours.

### P2 — non-blocking, affects conversion/adoption

8. **No in-app settings page / updater**; master switch requires editing the profile `cordis.patch.yml` (documented, `README.md:71–96`). Competitors are ahead here; at minimum document the config path prominently in the user README and mention the planned keyless-settings limitation.
9. **Missing package metadata**: `repository`, `homepage`, `author`, `keywords`, `engines.dsh` — needed for catalog mapping/display, npm search and install confidence (all direct competitors have most of these; `dsh-next-steps` package.json is a good model: MIT + author + engines + keywords + exports).
10. **Storefront assets absent**: no raster icon (SVG is refused for the listing `icon:` field; the package `icon.svg` is only for the Plugin Manager), no `screenshots.json`, no demo image/GIF. Optional, but this niche is visual and `dsh-nextsteps` ships a demo SVG + 15-language settings; a single good screenshot is the cheapest conversion win.
11. **Token-cost communication**: ~507 always-on tokens/request (`README.md:62, 192–193`); off switch exists (0 tokens). Say it plainly in the README; ghost-text competitors' "free" claim is misleading (extra per-turn call), but users compare.
12. **Visual parity maintenance**: the card copies an **experimental** official surface; record the DSH version baseline (0.2.2-rc.1) in the README and keep an upgrade checklist (PRD §14.4 already flags this).

---

## 9. Recommended pre-publish sequence (short)

1. User decisions: **license = MIT**; **name** (recommend `dsh-next-actions`, alternative `dsh-safe-next-steps`); **tool rename** to avoid `suggest_next_steps` collision (recommend `suggest_next_actions`).
2. Repo: create public GitHub repo (plugin dir as package root or monorepo subdir), add `dsh-plugin` topic, push; **wait ≥1 day** before the awesome PR; set `repository`/`homepage`/`keywords`/`engines.dsh`/`author` and remove `private`.
3. Files: add `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md` (DeepSeek MIT notice for the copied card), rewrite README as user README (+license/attribution/safety/token cost), add a screenshot and optionally `assets/icon-180.png`.
4. Publish npm unscoped: `npm publish --access public`; verify `engines.dsh` and install via `dsh plugin --profile web add dsh-next-actions` from a **disposable profile** (not the live one — task-3 owns install verification).
5. PR one YAML to awesome-dsh-plugin (`data/plugins/<owner>__dsh-next-actions.yml`, `category: ui`, accurate en/zh description, optional raster icon). Then wait for maintainer review; the index/Discover source picks the npm package up after the site rebuild.

---

## 10. Audit gaps / confidence

- **Naming availability** = npm registry 404 only (no authenticated publish check; scope ownership of the maintainer's npm user unknown; `@local` ownership untested). GitHub name search was done at query time only.
- **Tool-collision conclusion is inferred**, not empirically reproduced: installing both plugins in the live profile was forbidden. Basis: competitor source registers `suggest_next_steps`, and DSH's registry throws on duplicate registration (`dsh-tools/lib/index.js:385`). Confidence high on the code path, medium on whether both plugins could ever be co-installed in practice (users usually install one suggestion plugin).
- **Downloads** are npm API last-week values (include mirrors/CI; not unique users). Stars are tiny across the niche; they are a weak signal.
- **Catalog/listing state is a 2026-11-09 snapshot** (site's own daily build changes; 9,714 listings vs 4,985 npm-backed at fetch time). Interesting entries may be added/removed daily; dsh-nextsteps was not yet listed when checked.
- **Awesome-list submission outcome** is a human judgment (duplicate-coverage rule), not guaranteed; I did not inspect the maintainers' PR queue for competing recent submissions.
- **Licensing reading is engineering/legal-reasoning, not legal advice.** No DeepSeek trademark policy for community plugins was found online; the community naming-compatibility profile I found is not authoritative. The DSH MIT read is from the shipped package manifests/LICENSE and the public repo.
- I did **not** exhaustively audit all ~20 cluster packages' source (sampled the 6 closest + adjacency); competitor feature claims are from their published READMEs/registry metadata (untrusted) and spot-checked source where it mattered (dsh-next-steps tool name).
- Per instructions, I did **not** call `suggest_next_steps` and did not touch the live profile or `~/.dsh`.

---

## Appendix A — key evidence index

**Local plugin**
- `plugins/dsh-next-actions/package.json:2–4` (`@local`/`private:true`), `:22–26` (`dsh.bundle`), rest: no license/repository/homepage/author/keywords/engines.
- `plugins/dsh-next-actions/README.md:3–8` (official-copy acknowledgement), `:10–13` (working name, "Nothing is published"), `:42–48` (compaction/durable guidance), `:62` (~507 tokens), `:76–80` (off = 0 tokens), `:71–96` (settings/gate limitations), `:192–193` (token table).
- `src/styles.js:1–15` (copied official card CSS; `dshns-` prefix; theme tokens only), 85 `dshns-` refs, 45 `var(--dsw-*)` refs, no hex colours.
- `src/client.js:9–10` (copied markup/CSS), `:50–55` (danger copy), `:308–322` (own brand mark = reduced icon), `:458–465` (danger always fills; send needs real submit), `:693–695` (fill/send setting).
- `index.js:23` (tool name `suggest_next_steps`), `:52–79` (durable system-prompt section), `:177–215` (`enabled` gate, root-only `when`).
- No `LICENSE` file (file listing 2026-11-09); `icon.svg` original.
- `README.md` of the plugin references `design/next-step-suggestions-prd.md` (v0.8, local) whose appendix (~562–565) states the intended novelty.

**Marketplace / listing**
- `https://awesome-dsh-plugin.com/plugins.json` — 9,714 entries, 4,985 with npm; category counts (ui 1,928).
- `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` — 4,985 entries, format 1, all `source.type = npm`.
- catalog package `dsh-plugin-catalog@2026.1109.17642` README — "Entries: 9714"; index is the format-1 market index; CC0-1.0.
- `awesome-dsh-plugin/awesome-dsh-plugin` `contributing.md`: YAML fields 12–24; `dsh.bundle` 58–61, 163; repo age 79; maintained 82; topic 83; accuracy 85; duplicate coverage 101; npm optional 234–242; npm recommended 119; icon raster 190; screenshots 196–228.
- `scripts/build-site.mjs:180–196` — index built from `npmMap`; entries with no npm package/version skipped.
- `data/plugins/` one-YAML-per-repo submission model.

**DSH (shipped asar, read-only)**
- `dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md:36` — copy markup/CSS/behavior sanctioned with conditions.
- `.../references/host-plugin.md:35` — original or licensed icon, retain attribution.
- `.../references/host-plugin.md:30–37` — display metadata checklist.
- `dsh/node_modules/@deepseek-ai/dsh-action-cards/LICENSE` — MIT, Copyright (c) 2026 DeepSeek; package manifests MIT.
- `dsh/node_modules/@deepseek-ai/dsh-personalized-recommendations/README.md:13` — shipped profiles leave the action-card bundle disabled.
- `dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js:385` — duplicate tool registration throws.
- `https://github.com/deepseek-ai/deepseek-harness` — MIT, 277,357★, "Everything is a Plugin".

**Competitors**
- npm registry metadata + `api.npmjs.org/downloads/point/last-week` for dsh-nextsteps, dsh-suggest-actions, dsh-composer-predictions, dsh-next-prompt, dsh-suggest-ghost, dsh-prompt-for-me, dsh-next-input, dsh-composer-assist, dsh-composer-assistant, dsh-ghost-prompt, dsh-prompt-predict, dsh-input-prediction, dsh-user-experience; GitHub API stars/repo dates.
- `dsh-nextsteps` README (v1.4.11): click sends, settings page (15 languages/1–6 count/title), persistent cards, in-app updater.
- `dsh-suggest-actions` README (v0.1.16): click sends, right-side fill button, stance dedupe, no extra model call, bundle-patch config only.
- `dsh-next-steps` source `index.js` lines 32–33 (persistent prompt), 118 (`next-steps` section), 126–127 (tool `suggest_next_steps`); README: 2×2 grid, click sends / Shift+click fills, ~70% call rate pre-0.1.3.
- `dsh-next-step-suggest` README: auxiliary LLM call, chips above composer, fill draft, injection guard.
- npm availability: `https://registry.npmjs.org/dsh-next-actions`, `/dsh-safe-next-steps`, `/dsh-next-step-card`, `/dsh-suggested-actions`, `/dsh-suggest-next-actions` all HTTP 404 on 2026-11-09; `dsh-followups` taken, `dsh-nextsteps`/`dsh-next-prompt`/`dsh-next-input`/`dsh-suggest-actions` taken. GitHub name search for the four candidates: 0 repos.

## Appendix B — raw metric table used

npm last-week downloads (2026-11-09, `api.npmjs.org`): dsh-nextsteps 3634; dsh-next-input 1597; dsh-suggest-actions 1039; dsh-prompt-predict 1035; dsh-suggest-ghost 932; dsh-composer-assistant 699; dsh-composer-predictions 481; dsh-ghost-prompt 389; dsh-prompt-for-me 339; dsh-next-prompt 319; dsh-composer-assist 250; dsh-input-prediction 204; dsh-user-experience 204 (unrelated). GitHub stars: suggest-ghost 7; prompt-for-me 5; suggest-actions 4; composer-predictions 3; prompt-predict 3; nextsteps 1; next-input 0; next-prompt 0; next-steps 0; next-step-suggest 0.
