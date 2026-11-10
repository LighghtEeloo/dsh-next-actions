# Release audit — packaging, release engineering, documentation, compatibility

**Plugin:** `@local/dsh-next-actions` v0.1.0 (workspace `plugins/dsh-next-actions`)
**Area owner:** release-auditor (task-3). Market/competitor/naming-strategy owned by task-4; Host logic by host-auditor; Client behavior by client-auditor.
**Environment:** DSH Desktop / CLI **0.2.2-rc.1** (asar `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`), macOS darwin, node v24.15.0, npm 11.12.1, pnpm 11.28.5.
**Method:** read-only inspection of the plugin and the live asar docs; `npm pack` + real `dsh plugin add/remove` against a **fake `DSH_HOME`** with all caches redirected under /tmp; DSH-bundled `semver` 7.8.6 extracted from the asar to reproduce the preflight range logic; token budget re-derived from source. Real `~/.dsh` was never touched; plugin source was never modified.

---

## 0. TL;DR — verdict

**NOT READY to publish (npm / community catalog) today — but the artifact mechanics are close.**

The packaged artifact itself is technically sound: it packs to 40.5 kB / 10 files, every runtime file is present, it installs into a clean profile as a bundle, its patch contributes the `dsh-next-actions` row with `enabled: true`, it upgrades and removes cleanly, and the RC preflight accepts/rejects exactly as documented. 0.1.0 tests are green per Lead (181/181; `build-client.mjs --check` clean). Nothing about runtime packaging needed a code change.

What blocks publication is **release identity, compliance, compatibility declaration, public documentation and release process** — all of which the current design explicitly deferred (tech design v1.0 line 71: 「不发布 npm、不提交社区索引」). This is greenfield release-engineering work, not a bug fix.

**Effort to make publishable as a first public RC: ~3–5 focused days** (P0 below). Effort to be honestly "mature" for a stable public listing: +1–2 weeks (P1).

---

## 1. Publish blockers (P0) — must close before any public npm/catalog release

| # | Blocker | Evidence | Effort |
|---|---|---|---|
| P0-1 | **Package identity is local-only and cannot be published as-is**: name `@local/dsh-next-actions` + `private: true`. The `@local` scope is a dev placeholder (package.json:2,4; README:10-13; tech design:297-300). npm cannot publish into a scope the publisher does not own. The built browser bundle hard-codes the package name as its module id (client.js:23, from src/client.js:23; also PKG at client.js:923), the Host export hard-codes it (index.js:20), the bundle patch hard-codes it (cordis.patch.yml:18) and three tests assert it (test/definition.test.mjs:90, test/tool.test.mjs:100, test/build.test.mjs:87). Rename ⇒ edit 7 source files, rebuild client.js, update tests, re-run 181 tests + pack test. Unscoped `dsh-next-actions` is currently unclaimed on npm (npm view → 404); unauthenticated registry search found 0 packages in scope `local`. Final name is task-4's decision. | package.json:2-4; client.js:23; index.js:20; cordis.patch.yml:18; tests above | S (~0.5 d) |
| P0-2 | **No license and no redistribution compliance.** No `LICENSE` file and no `license` field. The card/process-row CSS+markup are explicitly copies of DSH's official action card (README:4-8; client.js header "official action-card frame (copied markup/CSS)"), and DSH packages are MIT (asar `@deepseek-ai/dsh-action-cards/package.json` has `"license": "MIT"`), so redistribution needs the DSH copyright notice/attribution (NOTICE) plus an icon-provenance statement (icon is stated original, README:144-152, but no license record). License choice must be coordinated with task-4; MIT matches the ecosystem. | no LICENSE in tree or tarball; package.json has no license; README:4-8; PRD:538 | S (~0.5 d + decision) |
| P0-3 | **No DSH compatibility declaration.** No `engines.dsh`, no `@deepseek-ai/dsh*` peers (package.json; tech design:304 says this was deliberate). Rule: if `engines.dsh` exists it alone decides, else every `@deepseek-ai/dsh*` peer must match, **no declaration = no constraint** (research/app/dsh-app-boot-README.md:52; asar dsh-app-boot/README.md:53). Today the plugin would install on any future DSH including 0.3/1.0 that may break the internal client contracts it relies on. Proposed declaration and the **prerelease-range trap** are in §3: naive `^0.2.2` is *refused* on the running 0.2.2-rc.1; `>=0.2.2-0 <0.3.0` is accepted end-to-end. | package.json; research/app/dsh-app-boot-README.md:52 | S (~0.25 d, verified) |
| P0-4 | **README is a development log, and that README is the public plugin page.** DSH shows a bundle's README when `locale/*.json` has no `meta.detail` (ui-plugin-manager README:41; plugin-detail README:31-39). The current README is milestone/live-test notes in English with workspace paths (design/next-step-suggestions-*.md, README:15-17), milestone table (19-33), "needs a restart on your side" (40), internal prompt-gate narrative (42-105), "Installed for verification … remove with plugin_manager remove_bundle" (138-142), directory tree (154-185), internal `cordis_inspect_query` checks (219-221) and "Nothing is published" (13). Needs a public README (EN + zh) with: what it is + screenshot, requirements/compat table, install, cost disclosure + how to disable, usage, settings, limitations, upgrade/uninstall, privacy, troubleshooting, changelog, license. Keep the dev log as `DEVELOPMENT.md` (repo-only). | README.md:1-13,19-40,138-142; ui-plugin-manager README:41 | M (~1–1.5 d) |
| P0-5 | **No VCS / release process.** The workspace and the plugin are **not git repositories** (`git rev-parse` fails). Consequences: no `repository`/`homepage`/`bugs` metadata (npm page and plugin page have no source link); no tags, no `CHANGELOG`; no CI (tests/build-check/pack-list never run on release); no npm provenance (requires public repo + CI); the market's repository-README fallback cannot apply (plugin-detail README:31-39). Release path needs: git repo, `.gitignore`, CI (node --test + build-client --check + npm pack content assertion), CHANGELOG (Keep a Changelog), GitHub release/tag ↔ npm version, `prepublishOnly` guard. | git rev-parse in workspace; package.json has no repository/homepage | M (~1 d) |
| P0-6 | **Default-on prompt cost is not disclosed publicly.** `cordis.patch.yml` ships `config: { enabled: true }` (cordis.patch.yml:16-20); DSH auto-selects the bundle on install; README's own measurement is ≈507 tokens/request always-on (README:61-63,187-201). Re-derived independently: guidance 570 chars ≈143 tok + tool declaration 1435 chars ≈359 tok = **2005 chars ≈501 tok/request**, plus a 173-char (~43 tok) model-visible result once per call, 0 extra model calls, 0 for subagents, 0 when `enabled:false`. A public listing must put cost + disable path near the top (and product may want to reconsider default-on for a public first release). | cordis.patch.yml:16-20; README:61-63,187-201; index.js guidance/definition | S (docs; product decision) |

---

## 2. Non-blocking gaps (P1 — before "stable/mature"; P2 — polish)

**P1**
1. **No in-app Host gate.** The client Settings section exists (max-per-reply count, click mode, reset card states — src/client.js client settings block; built client.js settings.section registration around line 2014), but the on/off Host switch is YAML-only today (README:89-92; PRD:358; the settings page shows a read-only note). Users can still switch the whole bundle off in **Plugins** (documented, discoverable), so this is acceptable for a community v0.1 *if documented*; an in-app form is a post-launch M–L item. The README's stated reason (zero-dep link install cannot import a Schemastery Config) disappears for an npm install — `@deepseek-ai/schemastery` 3.19.0 is public on npm and exactly the host version, but adopting it adds a real dependency + cross-instance validation risk; design deliberately.
2. **`dsh.client.inject` omits `@deepseek-ai/dsh-client-ui-settings`**, owner of `settings.section`/`settings.section.icon` (ui-settings README:46,48). Slot replay appears to tolerate this (plugin works live; src/client.js comment), but the manifest should list every slot provider for deterministic cold-boot order (S).
3. **Screenshots/assets for docs.** Only `design/compare/card-vs-builtin.png` (3360×1359, 256K, annotated design comparison, not a live screenshot — PRD:538) exists; `design/` is not in `files`, so a README image would be a broken/absent asset. Need a real cropped screenshot (~100–200 KB), add `docs/*.png` to `files`, and an absolute URL once the repo exists (npm page does not resolve relative README images; the DSH plugin page does resolve relative images from the package — ui-plugin-manager README:41).
4. **Published package script smells:** `scripts.test`/`scripts.build:client` point at `test/` and `scripts/build-client.mjs`, excluded by `files` (package.json:14-23,39-42) — they fail if run from an installed copy. Recommended: add `"prepublishOnly": "node --test && node scripts/build-client.mjs --check"` and do not advertise dev scripts in the public README.
5. **Version/tag policy:** `0.1.0` is fine for a first public release; for a staged RC publish `0.1.0-rc.1` with `--tag next` (npm refuses a prerelease version on the default latest tag; npm lib/commands/publish.js ~120-124). Decide and document.
6. **File modes:** workspace files are 0600 and `npm pack` preserves them (tar entries -rw-------; control test confirmed npm does not normalize 600→644). pnpm normalized on install (installed files 0644), so this is hygiene only — normalize repo modes/git before publishing.
7. **`dsh.manifestVersion: 1` missing** (optional but the declared manifest-format forward-compat field; package-manifest README:55) and **`publishConfig: { "access": "public" }` missing** for the scoped package (official packages declare it, e.g. dsh-action-cards package.json).

**P2**
- `author`, `keywords`, `homepage`, `bugs`, `funding`, `engines.node`; `repository.directory`; `.gitattributes`; SECURITY.md/CONTRIBUTING/issue templates; optional localized `meta.detail` for the plugin page; `README.zh.md` (locale JSON is already zh; DSH docs are bilingual); CHANGELOG; catalog/index submission owned by task-4 (DSH has **no default index** — Discover only reads user-configured indexes, plugin-market README:28,32, so npm publication alone does not surface in Discover; a distribution dependency, not a packaging one).

---

## 3. Compatibility: DSH 0.2.2-rc.1 — declaration and support policy

### 3.1 Preflight rule (verified in the live 0.2.2-rc.1 asar)

- `engines.dsh` wins and `peerDependencies` are then ignored; else every `@deepseek-ai/dsh*` peer must match; **no declaration = no constraint**; empty/invalid range = incompatible; non-object `engines` = malformed manifest; prereleases participate in matching (asar `dsh-app-boot/README.md:53`; mirrored at research/app/dsh-app-boot-README.md:52).
- Implementation: `evaluatePluginCompatibility` → `unmetRequirements` → `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` in asar `dsh-app-boot/lib/index.js` (~lines 1070–1150); runtime version comes from the app-boot package manifest = **0.2.2-rc.1**; DSH bundles **semver 7.8.6** (asar `dsh/node_modules/semver/package.json`).
- I reproduced the exact function body against the **extracted DSH-bundled semver 7.8.6** (script: research/release-audit/release/test-scripts/engines-preflight.mjs) and then confirmed end-to-end through the real CLI.

### 3.2 The prerelease trap (important for the published manifest and the catalog index)

DSH docs say "prereleases participate in range matching", but with semver 7.8.6 `includePrerelease:true` still does **not** let `^0.2.2` match `0.2.2-rc.1` (semver 7.7.4 did; 7.8.6 changed this — verified side by side):

| engines.dsh | 0.2.2-rc.1 (current) | verdict |
|---|---|---|
| none | accepted | no constraint (today) |
| `^0.2.2` | **REFUSED** | do not ship |
| `^0.3.0` | refused | expected |
| `>=0.2.2-0 <0.3.0` | **ACCEPTED** | **recommended** |
| `^0.2.2-rc.1` | accepted (also OK) | alternative |

End-to-end CLI evidence (real `dsh plugin --profile web add file:…` against fake `DSH_HOME`; 0.1.0 tarball re-packed with each manifest):
- engines `"^0.3.0"` → exit 1, "dsh: installation rejected: Plugin @local/dsh-next-actions@0.1.0 is incompatible with dsh 0.2.2-rc.1: requirements {"engines.dsh":"^0.3.0"} … dsh: restored package.json, pnpm-lock.yaml, and node_modules." Profile dependencies back to {}.
- engines `"^0.2.2"` → same rejection on 0.2.2-rc.1 (the trap above).
- engines `">=0.2.2-0 <0.3.0"` → exit 0, installed, row composed with `enabled: true`, empty stderr.
- no `engines` → exit 0 (no constraint), matches the docs.

### 3.3 APIs the plugin relies on vs. what is documented for third-party plugins

| Surface | Use in plugin | Documentation status | Risk |
|---|---|---|---|
| `ctx.tools.register(definition, { when })` | index.js:223-226 | documented (dsh-tools README:70) | low |
| **raw ToolDefinition shape** (hand-written name/description/parameters/output.schema/render/presentationMeta/execute instead of `defineTool`) | index.js:140-170 | official authoring docs only show `defineTool` (dsh-tools README:35-46); the raw shape is an internal contract (tech design:130 cites dsh-tools lib); `output.presentationMeta` documented for first-party tools (dsh-tool-web README:128) | **medium** |
| `ctx.systemPrompt.section()` | index.js:76-80 | documented (practices.md:19) | low |
| `ctx.systemPrompt.getSectionOrder('TOOL_REPORT')` | index.js:72-74 (falls back to 2950) | system-prompt README:57 says repo-owned contributors use it; "external contributions may use any finite order" — external use is undocumented-but-guarded | low-medium; use a fixed finite order in the public version |
| `ctx.agents.roots()`, `agent/created`, `agent/disposed`, `agent.ctx.effect` | index.js:203-278 | roots documented (dsh-agent README:33); per-agent effect pattern documented (practices.md:19) | low-medium |
| `dsh.client` manifest + `./client` + module id = package name | package.json:24-38; client.js:20-23 | documented (client-modules README:35; ui-plugin.md:4,10) | low |
| `ctx.slots.inject/register` | client.js:2001-2033 | documented (ui-plugin.md:12; practices.md:34-36) | low |
| `conversation.chat.turnTail` slot + props | client.js:2001-2006 | slot is an official extension point used by official plugins (action-cards README:42; deliverables README:81), but the **owner-props contract is internal** (tech design:109 cites ui-chat client source; no public third-party doc of {turn, seq, openFile}) | **medium-high** |
| `ctx.uiConversation.events.register(...)` Conversation Definition fold | client.js:1997 + Definition body | documented as the extension point for Chat rows (practices.md:38; ui-conversation README:52); typed via declaration merging meant for repo packages — plain JS gets no type check | medium |
| `tool.call.toolview` keyed slot | client.js:2008-2013 | documented with example (ui-tool README:39-44) | low |
| `settings.section`, `settings.section.icon` | client.js:2014-2033 | documented (ui-settings README:46,48) | low |
| `window.__ModuleLoader__.load` classic-script protocol | client.js:20-23 | documented in ui-plugin.md:10 ("lazy factory whose id equals the package name"); protocol details from runner source | low-medium |
| copied card/process-row markup + CSS / theme tokens | src/styles.js, client.js card | practices.md:35-36 explicitly sanctions copying host markup/CSS with prefixed classes and `--dsw-alias-*` tokens — but the copy tracks one DSH build and breaks visually on markup/token changes | **medium-high** (client-auditor's area) |

**Overall compatibility risk for publication: medium-high.** DSH is pre-1.0 with an RC cadence; several contracts used here are internal source-level details (raw ToolDefinition, turnTail props, Definition data shape, copied card DOM/CSS). `engines.dsh` limits the blast radius but cannot guarantee within-0.2.x compatibility.

### 3.4 Proposed support policy (README + RELEASING.md)

- Declare `"engines": { "dsh": ">=0.2.2-0 <0.3.0" }` (verified accepted by 0.2.2-rc.1; refuses 0.3.0+). Add `"dsh": { "manifestVersion": 1, … }`.
- README compatibility table: "Tested: DSH Desktop/Web 0.2.2-rc.1. Supported: 0.2.2.x. Not supported: 0.3+ (install is refused by DSH with a clear message)."
- Per-release process: on every new DSH RC/stable, run a smoke checklist on a scratch profile (tool registration + guidance section; turnTail card renders; process row; settings; fill/send/dismiss; no console slot crash) → ship a plugin patch release if broken; widen `engines.dsh` only after the new minor is verified.
- Document the escape hatch for users on an untested runtime: DSH's exact-version exemption (`dsh plugin allow-version <pkg@ver> --dsh-version <runtime> --accept-risk` or Plugin Manager; research/app2/plugin-manager-README.md:67-83) — with the risk warning.
- Avoid `peerDependencies` on `@deepseek-ai/dsh*`: public npm has stale placeholder versions (`@deepseek-ai/dsh-tools` 0.0.1-rc.1, `-client-ui-conversation` 0.0.1-rc.1, `-client-ui-chat` 0.1.2-alpha.2, while `@deepseek-ai/dsh` itself is public at 0.2.2-rc.1) and peers add pnpm auto-install/resolution risk; `engines.dsh` is both sufficient and what the market/updater checks (plugin-manager README:57-59; plugin-market README:97).
- Note the Web-only UI limitation: the Host half would still register/pay tokens on headless profiles where the Client half never renders — document "Web/Desktop UI only; do not install in headless/SDK profiles" or gate later.

---

## 4. Artifact / manifest audit

| Item | State | Action |
|---|---|---|
| name/version/private | `@local/dsh-next-actions` 0.1.0 `private:true` | rename to owned npm scope + remove `private`; rebuild bundle id; P0-1 |
| description/icon | present; `icon:"./icon.svg"` + `./icon` export | keep; extend description with DSH/cost hint |
| type/exports | type:module; ".", "./client", "./locale/*.json", "./icon" | correct per host-plugin.md:36,48,62; no change |
| files | runtime complete: verified tarball = 10 files (index.js, client.js, lib/normalize.js, lib/view-model.js, cordis.patch.yml, locale/en.json, locale/zh.json, icon.svg, README.md, package.json) | add LICENSE/NOTICE (+ docs images if used); keep test/src/scripts/design out; `.npmignore` unnecessary because `files` is authoritative (npm still always includes README/LICENSE/package.json) |
| cordis.patch.yml | one `insert` row id `dsh-next-actions`, name `@local/…`, `config: { enabled: true }`; comment documents the user-patch override | correct (row composed in real `--dump-config` with enabled true); update name after rename; move the enable toggle explanation into the public README |
| dsh.bundle.patch | present and loaded by the fake profile | keep |
| dsh.client | platform web, immediately true, inject [locale, ui-chat, ui-conversation, ui-tool] | add `@deepseek-ai/dsh-client-ui-settings` (P1); otherwise correct (ui-plugin.md:4) |
| dsh.manifestVersion | absent | add `1` (package-manifest README:55) |
| engines/peers | absent | add `engines.dsh` (P0-3) |
| license/LICENSE | absent | add (P0-2) |
| repository/homepage/author/keywords/bugs/publishConfig | absent | add (P0-5/P1/P2); market search uses name/author/keywords (plugin-market README:68); official packages use `publishConfig.access: public` |
| locale metadata | en/zh valid JSON, `meta.title`+`meta.description` only | good; optional `meta.detail` for a curated plugin page (plugin-detail README:35); align copy — zh mentions "click only fills, never sends", en omits it |
| icon.svg | 786 B, valid XML, 36×36 viewBox, internal gradient only, no external refs/scripts, <256 KiB (host-plugin.md:52) | keep; record provenance/license statement |
| dependencies/postinstall | **none** — zero deps, no install scripts | strength: clean supply chain, no build-script approval, reproducible pack |
| size | 40.5 kB tarball / 133.5 kB unpacked / 10 files | good |

---

## 5. Isolated install test (exact commands and results)

Isolation: fake `DSH_HOME=/tmp/dsh-na-audit/fake-home`; isolated npm cache, pnpm store, XDG/PNPM/COREPACK homes under /tmp; `CI=1`; real `~/.dsh` untouched. Reproducer: research/release-audit/release/test-scripts/isolated-install-test.sh. (The host's default `~/.npm` cache is root-owned, so npm needed `npm_config_cache=/tmp/…`; audit-environment quirk, not a plugin issue.)

### 5.1 Pack
~~~
$ cd /tmp/dsh-na-audit/pkg && npm pack --pack-destination /tmp/dsh-na-audit/pack
@local/dsh-next-actions@0.1.0  →  local-dsh-next-actions-0.1.0.tgz
package size 40.5 kB · unpacked 133.5 kB · total files 10
contents: README.md client.js cordis.patch.yml icon.svg index.js
          lib/normalize.js lib/view-model.js locale/en.json locale/zh.json package.json
~~~
All runtime files present; no tests/src/scripts/design leaked into the tarball.

### 5.2 Install into a clean fake profile
~~~
$ DSH_HOME=/tmp/dsh-na-audit/fake-home dsh plugin --profile web add \
    file:/tmp/dsh-na-audit/pack/local-dsh-next-actions-0.1.0.tgz
dsh: initialized profile web at /tmp/dsh-na-audit/fake-home/profiles/web
dependencies: + @local/dsh-next-actions 0.1.0        (pnpm v11.28.5, 242 ms)   ADD_EXIT=0
~~~
Profile wiring (verified on disk):
~~~json
// /tmp/dsh-na-audit/fake-home/profiles/web/package.json
{ "dependencies": { "@local/dsh-next-actions": "file:/tmp/…/local-dsh-next-actions-0.1.0.tgz" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@local/dsh-next-actions"] } } }
~~~
Installed package directory contains all 10 files; the profile's own `cordis.patch.yml` stays `[]` (the row comes from the bundle patch, as intended). `dsh --profile web --dump-config` (1248 lines, empty stderr) ends with:
~~~
# == @local/dsh-next-actions
- id: dsh-next-actions
  name: '@local/dsh-next-actions'
  config:
    enabled: true
~~~

### 5.3 Remove
~~~
$ DSH_HOME=… dsh plugin --profile web remove @local/dsh-next-actions
dependencies: - @local/dsh-next-actions 0.1.0    Done in 173 ms.        REMOVE_EXIT=0
→ profile dependencies {}, bundles back to [dsh-base, dsh-web-app]; dump-config match count 0.
~~~

### 5.4 In-place upgrade (0.1.0 → 0.1.1 tarball)
~~~
add 0.1.0 → exit 0; add 0.1.1 → exit 0; pnpm: "- @local/dsh-next-actions 0.1.0 / + … 0.1.1"
→ dependency spec replaced, installed version 0.1.1, bundle listed once (no duplicate); exit 0.
~~~

### 5.5 Preflight behavior without/with engines (see §3.2 for the matrix)

No `engines` → install accepted (no constraint). Incompatible range → install rejected **after** install and automatically restored (manifest + lockfile + node_modules) with an actionable message and `allow-version` hint; exit 1. Compatible prerelease-aware range → accepted. This is exactly the behavior a public plugin should rely on.

**Not covered by the isolated test:** an actual public-registry install (`dsh plugin add @scope/name@version`, including inspect/listVersions update path), the Desktop GUI Plugins-page rendering of title/description/icon/detail document, and multi-OS hosts. See §9.

---

## 6. Documentation audit — what public users would see today

Current README = 221-line English dev log (milestones, triggering history, prompt-gate design, card header, live-mount reveal, icon, layout, measured budget, build, dev install). It has useful material (cost table, architecture) but addresses the developer, not a user, and references files not in the package (`design/*`, `test/*`).

Required public README (EN; mirrored zh) — minimum structure:
1. Title + one-paragraph what/why + screenshot (real card, dark+light).
2. Requirements & compatibility table (DSH 0.2.2.x; Web/Desktop UI only; tested version).
3. Install: Plugins → Add plugin → `<package name>` (or CLI `dsh plugin --profile <profile> add <package>`), then enable/restart notes; uninstall/upgrade steps.
4. **Cost & controls near top:** default-on adds ~500 tokens to every root-agent request (≈364 tool declaration + ≈143 guidance), 0 for subagents, 0 when disabled, no extra model calls; disable via the Plugins bundle toggle or the exact YAML snippet with the warning that an id-targeted patch replaces the whole config (restate `name`); settings are per-browser (localStorage) and not synced.
5. Usage: click fills the draft (never sends by default), "Send" mode, dangerous suggestions always only fill, recommended tag, dismiss/restore, per-turn count.
6. Configuration: client settings section vs Host `enabled` gate (no in-app form yet — say so), and what restart/HMR does and does not apply.
7. Limitations: Web/Desktop only; model may skip cards; subagent turns never show cards; card is a visual copy/parity layer; state is local; upgrades may need restart.
8. Privacy: no network requests, no telemetry; which localStorage keys are used; nothing leaves the machine beyond the prompt text DSH already sends.
9. Upgrade/uninstall/troubleshooting (incompatibility message, `allow-version` risk path).
10. Development, Changelog (link), License + NOTICE/attribution, "community plugin, not affiliated with DeepSeek" disclaimer.

Additional deliverables: `README.zh.md` (product/locale is already zh-first), screenshot assets in the package, `CHANGELOG.md`, `DEVELOPMENT.md` (move current dev log), `LICENSE`, `NOTICE`.

---

## 7. Proposed package.json (target state; diff vs. current)

~~~jsonc
{
  "name": "@<owned-scope>/dsh-next-actions",   // rename from @local/… (task-4 decides final name)
  "version": "0.1.0",                           // rc path: "0.1.0-rc.1" + --tag next at publish
  "description": "Shows a card under completed replies with clickable next steps that fill the input draft.",
  "icon": "./icon.svg",
  "type": "module",
  "license": "MIT",                             // NEW (+ LICENSE, + NOTICE for DSH-derived card CSS/markup)
  "author": { "name": "…" },                    // NEW
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git", "directory": "plugins/dsh-next-actions" }, // NEW
  "homepage": "https://github.com/<owner>/<repo>#readme",  // NEW
  "bugs": { "url": "https://github.com/<owner>/<repo>/issues" }, // NEW
  "keywords": ["dsh", "dsh-plugin", "deepseek-harness", "next-steps", "suggestions", "ui"], // NEW
  "engines": { "dsh": ">=0.2.2-0 <0.3.0" },     // NEW — verified accepted by 0.2.2-rc.1
  "exports": { ".": "./index.js", "./client": "./client.js", "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
  "files": ["index.js", "client.js", "cordis.patch.yml", "lib/normalize.js", "lib/view-model.js",
            "locale/*.json", "icon.svg", "README.md", "README.zh.md", "CHANGELOG.md", "LICENSE", "NOTICE",
            "docs/*.png"],                       // + license/notice/changelog/docs images
  "dsh": {
    "manifestVersion": 1,                       // NEW
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-chat",
                 "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-tool",
                 "@deepseek-ai/dsh-client-ui-settings"] }   // + ui-settings (slot owner)
  },
  "publishConfig": { "access": "public" },      // NEW (scoped public package)
  "scripts": {
    "test": "node --test",
    "build:client": "node scripts/build-client.mjs",
    "prepublishOnly": "node --test && node scripts/build-client.mjs --check"  // NEW release guard
  }
}
~~~
Remove `"private": true`. Rename touchpoints that must change together and be re-tested: package.json:2, index.js:20, cordis.patch.yml:18, src/client.js:23/32 → regenerate client.js (client.js:23,923), tests definition:90/tool:100/build:87, README, and any install-command docs.

---

## 8. Pre-publish checklist (target)

- [ ] P0-1 rename + rebuild + 181 tests + pack test on renamed tarball
- [ ] P0-2 LICENSE + NOTICE (DSH MIT attribution) + icon provenance + CI license check
- [ ] P0-3 `engines.dsh >=0.2.2-0 <0.3.0` + `dsh.manifestVersion: 1`; re-run fake-profile preflight test
- [ ] P0-4 public README (EN+zh) + move dev log to DEVELOPMENT.md + screenshots in `files`
- [ ] P0-5 git repo + repository/homepage/bugs/author/keywords + CI (tests, build check, pack-list, license) + CHANGELOG + tag↔version + provenance
- [ ] P0-6 cost/privacy/disable disclosure near top of README + locale meta copy aligned
- [ ] P1 `dsh.client.inject` + ui-settings; prepublishOnly; publishConfig; 0600 modes normalized
- [ ] Release rehearsal on a **scratch profile**: registry-style install/upgrade/remove, Plugins page metadata + icon + detail doc, preflight refusal path, no console crashes
- [ ] Publish first as `0.1.0-rc.1 --tag next`; promote to `0.1.0` (latest) after 2–4 weeks feedback + DSH 0.2.2 stable smoke test
- [ ] Submit to community plugin index (task-4); no default DSH index exists, so publication alone does not surface in Discover

---

## 9. Effort summary and recommended release path

| Track | Items | Effort |
|---|---|---|
| Identity + compatibility + guard hooks | P0-1, P0-3, prepublishOnly, publishConfig, inject | **S** (~1 d) |
| Legal/compliance | P0-2 license + NOTICE + attribution decision | **S** (~0.5–1 d, with task-4) |
| Public docs | P0-4 README EN+zh, screenshots, changelog, move dev log | **M** (~1.5–2 d) |
| Release process | P0-5 git repo, CI, CHANGELOG, provenance, tags | **M** (~1 d) |
| Disclosure/product | P0-6 cost + default-on decision | **S** |
| **Total to first public RC** | | **~3–5 focused days** |
| In-app Host settings form (+ Schemastery Config design) | P1 | M–L (~2–4 d) |
| Ongoing compatibility matrix per DSH release | support policy | S per release |

**Recommendation: staged RC, not a stable public release.**
1. **Keep the current live link install as-is** while the user continues using the plugin; do not swap the user's live profile to a registry install during release prep.
2. Close P0-1…P0-6; P0-4/P0-5 can run in parallel with P0-1/2/3.
3. Publish **`0.1.0-rc.1` under an owned npm scope with `--tag next`** (npm refuses prerelease versions on latest), verify with the §5 harness on a scratch profile + a real Desktop Plugins-page install, then list it in the community index as Experimental/RC (task-4).
4. Promote **`0.1.0` (latest)** only after 2–4 weeks of real use, no open P0/P1 card defects, and a smoke test against the next DSH 0.2.2 build. Keep `engines.dsh` narrowing; ship quick patch releases on DSH RC breakage.
5. Reach "mature/1.0" after P1 (in-app settings form or an explicit product decision, screenshots/i18n polish, compatibility matrix + RELEASING.md).

Alternative if DSH 0.2.2 stable is imminent: do the P0 work now but wait for the stable runtime before the first npm publish, then ship `0.1.0` directly — fewer RC churns, but delays user feedback and leaves the docs/process debt unchanged.

---

## 10. Audit gaps / confidence

- **Confidence high** on: artifact contents, install/remove/upgrade behavior, bundle wiring, preflight accept/reject/restore, the semver/engines trap (verified against extracted DSH 7.8.6 and end-to-end CLI), token-budget arithmetic, API-doc status (read from live 0.2.2-rc.1 asar docs), absence of VCS/license/metadata.
- **Not tested (environment constraints):** real public-registry install (needs a published package), Desktop GUI Plugins-page rendering (live GUI off-limits; fake homes are headless), npm publish/provenance (no auth; --dry-run only), multi-OS hosts, other DSH versions.
- **Scope overlap:** license choice/attribution and catalog/naming are task-4's; Host/Client behavior is host-/client-auditor's. The copied-CSS fragility risk is reported once here and should be cross-checked with client-auditor.
- **Quirk worth knowing:** `npm publish --dry-run` **succeeds** on this package despite `private:true`, and npm 11.12.1's CLI only enforces `private` for workspaces (npm lib/commands/publish.js ~line 142). Do not rely on `private:true` as an accidental-publish guard — remove it and add publishConfig/prepublishOnly/CI.

---

## Appendix — evidence index

Plugin: `plugins/dsh-next-actions/{package.json,cordis.patch.yml,README.md,index.js,client.js,src/client.js,locale/*.json,icon.svg,scripts/build-client.mjs,test/*}`; design: `design/next-step-suggestions-prd.md` (v0.8), `design/next-step-suggestions-tech.md` (v1.0: lines 71,99-101,109,130,142,240-316).

DSH 0.2.2-rc.1 asar docs (read-only): `dsh/node_modules/@deepseek-ai/dsh-app-boot/README.md:52-56,134`, `dsh-plugin-manager/README.md:51,55,57,59,78-83,127`, `dsh-tools/README.md:35-46,70,99`, `dsh-tool-web/README.md:128`, `dsh-package-manifest/README.md:37,40,55-57,97`, `dsh-client-modules/README.md:35,56`, `dsh-client-ui-conversation/README.md:52`, `dsh-client-ui-tool/README.md:39-44`, `dsh-client-ui-settings/README.md:46,48`, `dsh-client-ui-settings-general/README.md:79`, `dsh-system-prompt/README.md:57`, `dsh-agent/README.md:33`, `dsh-plugin-detail/README.md:31-39`, `dsh-plugin-market/README.md:28,32,68,97`, `dsh-client-ui-plugin-manager/README.md:41,59,66,195`, `dsh-agent-preset/skills/cordis-plugin-development/{SKILL.md,references/host-plugin.md:30-52,62-82,references/ui-plugin.md:4-12,references/practices.md:13,19,34-38}`; official package manifest reference: `dsh-action-cards/package.json` (license MIT, publishConfig public, exact peers).

Workspace mirrors: `research/app/dsh-app-boot-README.md:52` (engines rule), `research/app2/plugin-manager-README.md:67-83` (version compatibility/exemptions, install check), `research/full-readmes/dsh-app-boot.md:52`.

Reproduction scripts: `research/release-audit/release/test-scripts/{isolated-install-test.sh,engines-preflight.mjs,extract-asar.mjs,packed-package.json}`. Raw test artifacts (tarball, fake homes, logs, dump-config) were written under `/tmp/dsh-na-audit/` and are ephemeral.
