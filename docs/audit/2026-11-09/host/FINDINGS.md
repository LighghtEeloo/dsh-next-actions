# Host-half release audit — `@local/dsh-next-actions` v0.1.0

- **Area:** Host half only: `plugins/dsh-next-actions/index.js` (288 lines), `lib/normalize.js` (242), `test/tool.test.mjs` (31 tests), `test/normalize.test.mjs` (55 tests incl. a 6-case table).
- **Auditor:** host-auditor (teammate), 2026-11-09. Read-only audit; no plugin source touched.
- **Environment:** DSH Desktop 0.2.2-rc.1 (asar), node v24.15.0. Contract evidence read from the shipped asar; line numbers below are asar-real (my extracted copies carried a 1-line header, corrected -1).
- **Method:** source review; `node --test --experimental-test-coverage`; ~40 targeted Node experiments (fuzz, unicode, config, perf, danger battery); **a real-code lifecycle simulation**: extracted the shipped `@deepseek-ai/cordis@4.1.0`, `dsh-scope`, `dsh-system-prompt@@0.2.2-rc.1`, `dsh-tools@0.2.2-rc.1` (+ minimal `dsh-llm` stub: HarnessError only) from the asar, mounted the real plugin with the real registries, a real scoped agent context and a fake `agents` service, then drove `agent/created`, `tools.resolve`, `systemPrompt.assemble`, unload/reload. Scripts + outputs: `research/release-audit/host/gather/` (`sim-*`, `host-edge*`, `recount*`, `bench*`, `coverage-output.txt`).
- **Constraints honoured:** no live tool call, no DSH restart, no profile/plugin edits.

## Verdict

**CLOSE — the Host implementation is mature; the feature is not yet publish-ready as a community plugin.**

- The Host code itself is small, pure, deterministic and defensive; every DSH 0.2.2-rc.1 API it uses is a **documented public contract**, and a real-code simulation of mount → per-step gating → prompt assembly → unload/reload behaves as claimed. No Host-architecture blocker.
- Publish is blocked by one **safety-consistency defect** (P1-1) and one **false model/doc claim** (P1-2), both cheap to fix. P2/P3 items are robustness/doc/test debt.
- I found no crash, disposal leak, prompt-injection amplification, I/O, network, or eval path in the Host half, and no case where `execute()` throws on arguments DSH can realistically deliver.
- Confidence: **high** on code/API contracts (source + real-code sim); **medium** on live end-to-end behavior (no live GUI turn observed; no HMR toggle exercised). Gaps listed in §8.

## P1 — fix before publish

### P1-1 Dangerous-action detection is effectively zh-only; with the client's Send mode it can auto-send a destructive step
- `lib/normalize.js:36-50` `RISK_LEXICON`: 8 English patterns vs a broad Chinese alternation (`删除|清空|重置|格式化|强制推送|强推|发布|部署|上线|付费|扣费|支付|授权|提权|权限|卸载|回滚|迁移|销毁`). English lacks delete/remove/reset/overwrite/wipe/permission/paid/billing/rollback/migrate/uninstall/kill/shutdown, and the phrase regexes are brittle (`rm -r`, `rm -fr`, `git reset --hard`, `git clean -fd`, `drop column`, `truncate the orders table` all miss).
- Measured battery (`gather/host-edge2-output.txt`): **14/15 representative English destructive suggestions not flagged** (only `chmod 777` was); 6/9 benign English dev suggestions **false-positive** flagged (production logs, deploy checklist, publish docs, chmod docs, sudo man page, force-push docs). Chinese equivalents (删除/重置/权限/付费/部署…) are caught.
- Impact: `danger:true` is not cosmetic — client `src/client.js:459-461` computes `canSend = clickMode==='send' && danger!==true`; with the documented “Send” click mode (README.md:39) a false-negative destructive suggestion is submitted on one click. The plugin's public promise is “dangerous suggestions always only fill” (README.md:39, PRD §5.5 design/next-step-suggestions-prd.md:318-319). Only the model's own `danger` flag is a strong guard today; the lexicon “backstop” promised by design/next-step-suggestions-tech.md:1042 does not work in English.
- Fix (cheap): bring the EN lexicon to zh parity (verbs + common phrasings, e.g. delete/remove/reset/overwrite/wipe/drop/truncate/kill/shutdown/permission/chmod(-R)/paid/billing/charge/rollback/migrate/uninstall), add a positive/negative test battery (normalize.test.mjs currently only has 5 positive lexicon tests, lines 339-374), and mirror the same list in the client fallback copy `lib/view-model.js:71-79` (client rebuilt). Alternatively disable/remove client Send mode before publish.

### P1-2 Model-facing tool description and security docs assert a guarantee the shipped feature no longer has
- Tool description tells the model: “clicking a suggestion fills the message input” (`index.js:32`). False in Send mode: the click calls `inputActions.submit()` (`src/client.js:444-465`). The model uses this sentence to reason about consequence of its suggestions and to decide `danger`; under Send mode a suggestion it believes is a draft can execute immediately.
- Same stale claim in release docs: README.md:4 (“only fills the input draft — it never sends”), design/next-step-suggestions-tech.md:1040 (“零自动发送：代码路径中不存在 `submit()` 调用”), and tech.md:1043-1044 (injection risk “只填入草稿、不自动发送”). All false as shipped (tech.md:1040 is contradicted by src/client.js:461; PRD §5.6 already documents Send).
- Fix: description → neutral/staged wording (e.g. “stages a next step the user can send; clicking fills the input unless the user enabled direct send”); correct README/dev log and technical-design §9 before anything is published. If Send mode is kept, the security section must state the residual risk and the danger-flag contract.

## P2 — should fix (safety/robustness/claims), not strictly publish-blocking

1. **No Host `Config` schema and no in-app switch.** The package is zero-import (`index.js:1-16`) so it cannot export Schemastery `Config`; `normalizeConfig` (`index.js:185-190`) only treats literally `false` as off. Consequences for catalog users: no Settings form; the only off switch is editing the profile `cordis.patch.yml`; writing `config: false` or `enabled: "false"` silently keeps the feature **on** (verified matrix: `gather/host-edge2-output.txt`). Once installed as a normal dependency (no `link:`), ship `Config = z.object({enabled: z.boolean().default(true)})` + a settings page; until then document the exact YAML and the strict-`false` rule.
2. **Token-budget claims are slightly stale / mode-dependent** (measured in `gather/recount-output.txt`):
   - guidance **570 chars = 142.5 tok** — claim verified exactly (README.md:192, tech.md:565).
   - declaration claimed **1,456 chars / 364 tok** (README.md:191, tech.md:543) but measured **1,435** (name+description+parameters 1,291 + output.schema 144). Actual model-visible native declaration is **1,291 chars ≈ 323 tok** because the native executor projects only name/description/parameters (`dsh-tool-executor-native/lib/index.js:12-14`); output.schema reaches the model only through the PTC tools-SDK section (`dsh-tool-executor-ptc/lib/index.js:1744-1753`). Always-on actual ≈ **501 tok (PTC formula) / 465 tok (native)** vs claimed 507. Conservative direction, but the numbers should be corrected (and it matters for the “−364/subagent” claim, which is ~−323 in native mode).
   - `buildMeta` claim 4.39 µs verified (3.58–3.69 µs/call, 5×200k, `gather/bench-output.txt`).
   - “meta max ~4 KB” (tech.md §5.5): worst-case 6 suggestions measured 3,154 chars / **8,784 UTF-8 bytes**; typical fine, wording should say chars/bytes.
3. **`when` fail-open has a silent-regression failure mode and one unguarded edge.**
   - If `agents.roots()` throws/renames, `isRootAgent` fail-opens (`index.js:203-210`) → subagent requests silently pay the declaration again, and the guidance gate (which uses the same roots() inside a swallowed try, `index.js:238-251`) stays off for new roots: tool visible without guidance (verified S7). That is the documented trade-off, but a one-time `ctx.logger.warn` (or a comment pointing at the upgrade check) would make the degradation observable.
   - `when: ({ agent }) => …` (`index.js:224`) destructures the context before `isRootAgent`’s try/catch; a future DSH calling the condition with a null/undefined context would throw → `TOOL_ACTIVATION_FAILED` step-preparation failure (fail-closed, the opposite of the intent). Use `(context) => isRootAgent(ctx, context?.agent)`. Low probability (0.2.2 always passes an object), cheap hardening.
4. **Cross-surface truthfulness.** The Host half registers the tool and the result text says “Next steps shown below your answer (N)” (`index.js:150-155`) regardless of whether the Client half is active. The manifest is web-only (`package.json dsh.client.platform: web`); in CLI/headless/SDK use, or if the client bundle fails, the model is told a card exists that never renders (and may tell the user so). Not fixable purely host-side, but the render text could be capability-neutral, or the catalog entry must state “Web client required”.
5. **Prompt sections are not scope-checked against tool visibility.** Official convention: a section registered globally must render `""` when its tool is hidden, via `text({scope, toolSet})` (`dsh-system-prompt/README.md:162`). This plugin instead installs a per-root-agent section and never checks restrictions; simulation S6 (real `tools.restrict({deny:['suggest_next_steps']})` in an agent scope) shows **tool removed, guidance still in the prompt** → the model is instructed to call a tool that will fail UNKNOWN_TOOL. Current shipped 0.2.2 paths only restrict child agents (dsh-subagent), where `when` already hides both, so this is latent — but it is a documented-API violation likely to bite presets/custom restrictions. Cheap fix: keep the per-agent install but make the section text a function returning `""` when `agentCtx.tools.get(TOOL_NAME, agentCtx, …)` is absent (or move to the official global scope-checked pattern).
6. **`agent/created` re-entrancy/duplication is only guarded in-process.** One plugin row = one section per root (verified); a second row/fiber for the same package fails at tool registration with the registry’s clear duplicate error (S2) rather than corrupting state — acceptable Cordis behaviour, but the README/dev-log should not imply multi-instance safety.

## P3 — minor correctness / claims / test debt

1. **“No rule is repeated across prompt layers” is not true.** Trigger sentence is duplicated in description and guidance (“Call it once when this turn leaves follow-up work” vs “call suggest_next_steps once when this turn leaves real follow-up work”); the display rule appears in **description + guidance + result render** (“Never list…” / “Put those steps only in the card… never numbers or bullets” / “do not list or number them… one lead-in sentence”) — measured ≈160 duplicated chars ≈40 tokens, and tests do not guard this claim. README.md:48-50 / tech.md:587-588 should either be softened (“reinforced at decision points”) or one copy dropped. The other layer boundaries are respected: field rules live only in JSON-Schema descriptions; after-call contract lives only in the result text (verified K1-K3 in `gather/host-edge-output.txt`).
2. **Host/Client rule duplication with no parity test.** `lib/view-model.js:17-19,29-79` deliberately copies `RISK_LEXICON`, `LIMITS`, `STANCES`, `NOTES`, `normalizeKey` for the compaction fallback; nothing asserts the copies still match `lib/normalize.js` (build test only checks freshness). A P1-1 lexicon fix applied to one copy would silently diverge between live meta and the fallback card. Add a parity test (import both in one test file) — cheap and high value.
3. **Tolerance gaps in argument normalization:** stance is exact-match (`STANCES.includes`, `normalize.js:140`) — `'verify '`, `'Verify'`, `'VERIFY'` fall back to `continue` and lose explicit-stance uniqueness; `recommended:"true"`/`danger:1`/`danger:"true"` are silently ignored (`=== true` only, `normalize.js:146-147`). Models do emit both. Coercing trimmed/case-folded stances and `danger` string/number truthiness (for danger, erring safe) is low-risk. Also `toLocaleLowerCase()` (`normalize.js:96`) makes dedupe locale-dependent (e.g. Turkish İ); use `toLowerCase()` for determinism.
4. **Recommendation can disappear.** Pipeline order is dedupe → capability stance-dedupe → `singleRecommendation` (`normalize.js:154-178,238`); if the only `recommended:true` entry is dropped by prompt-dedupe (same prompt earlier without the flag) the card silently loses its recommendation. Design §5.6 only says “carry over if dropped by the stance step”. Either re-flag the kept duplicate or state the behaviour. (Not a safety issue; no test.)
5. **Text is single-lined but not otherwise sanitized.** `collapse()` (`normalize.js:66-68`) guarantees one display line and clamps lengths (`truncate` by code point, good), but bidi overrides (U+202E), zero-width chars and NUL/control chars pass through verbatim (verified). Client renders text nodes and has no `innerHTML`/`eval` (grep), so this is display-spoofing/polish, not XSS. Grapheme clusters are not preserved under truncation (ZWJ families split at 40 code points) — acceptable, but a `Intl.Segmenter` clamp would match the official card's width logic.
6. **Test gaps** (see §6): no restriction/scope-check test, no guidance-install-failure isolation test, no `getSectionOrder`-not-a-function branch, no reload/duplicate-row test, no token-budget guard, weak “agent disposal drops the tracked disposer” test (it asserts the section still exists, not the map), no host/client parity test.
7. **`label ≤16 chars` schema rule vs `LIMITS.label=40` host clamp** (`index.js:106`, `normalize.js:24`): host is deliberately lenient; doc/comment should say the schema target is 16 while the host guard is 40. Not a bug.
8. **Executor-mode nuance in claims:** “subagent steps save 364 tokens” (README.md:194) assumes PTC mode; native mode saves ~323 (see P2-2). Minor.
9. **README self-contradiction** (P1-2 adjacent): line 4 “never sends” vs line 39 “Send” setting.

## 3. What I verified works (evidence)

All run through the shipped 0.2.2-rc.1 code + the plugin as-is; `gather/sim-output.txt` S1-S9.

| Contract / behaviour | Evidence | Result |
|---|---|---|
| `ctx.tools.register(plainDefinition, {when})` accepts this hand-written definition (raw params + output schema) | dsh-tools/lib/index.js:432-444; real register accepted plugin in sim S1 | PASS |
| `when` evaluated once per model step with `{agent, modelSelection, signal}`; false removes declaration from executor description, PTC bindings, execution | dsh-tools/README.md:67-69; index.js:542-558; agent-loop:673-681; sim S1 | PASS — root admitted, subagent absent from real `assembly.tools` |
| Unknown agent / broken `roots()` fail-open (no step failure) | index.js:203-210; sim S1, S7 | PASS (tool admitted; guidance skipped in S7) |
| Root-only guidance via `agent.ctx.systemPrompt.section`; only roots get it | dsh-agent/README.md:74; index.js:71-81,238-251; sim S1 | PASS |
| Existing roots get the section at mount; duplicate `agent/created` does not duplicate; recreated agent gets it again | index.js:253-278; sim S4, S9 | PASS |
| Unload disposes tool + section; remount on a live agent re-installs exactly one section, no duplicate-name error | dsh-system-prompt/lib/index.js:255-258; cordis/lib/index.js:693,756; sim S3 | PASS |
| `systemPrompt.getSectionOrder('TOOL_REPORT')` = 2900; fallback 2950 finite; sections ordered centrally | dsh-system-prompt/lib/index.js:10-66 (TOOL_REPORT:36),:264; sim S1 | PASS |
| `presentationMeta(args, value)` projected to `tool/result.meta`, JSON-lossless; output.schema validated before render | dsh-tools/lib/pipeline.js:712-738,208; sim S8; normalize.test "meta is JSON-lossless" | PASS |
| Raw config passthrough with no `Config` export; `enabled:false` registers nothing | cordis/lib/index.js:244-249; index.js:185-190; sim S5 | PASS (`enabled:"no"`/absent keep ON by design) |
| `inject = ['tools','systemPrompt','agents']` resolves; apply runs only when all present | index.js:21; sim mount | PASS |
| `execute()` never throws / always `{shown:boolean,count:number}` for JSON-deliverable args | index.js:161-169; fuzz (`host-edge-output.txt` A-A3; F3) | PASS (only a hostile throwing getter can throw — unreachable: pipeline delivers `deepFreeze(snapshotJsonValue(JSON.parse(args)))`, dsh-tools/lib/pipeline.js:326-332) |
| No I/O, network, eval, timers, randomness; only import is `./lib/normalize.js`; ids stable and order-independent | index.js:18; static scan | PASS |
| Zero throw/side effect in normalization on null/wrong types/arrays/JSON strings/extra props/huge strings/unicode | `host-edge-output.txt` A,B,E,F | PASS |

Additional measured properties: normalization cap (6) protects the recommendation and the optional entry in every ordering (D5); explicit duplicate stances collapse to first; recommendation always first; ids `s<base36>` stable across calls and order; 2,000-entry adversarial suggestions ≈11 ms (first call) — no realistic DoS because model args are token-bounded; worst-case meta 3,154 chars.

## 4. DSH 0.2.2-rc.1 API-contract verification (asar)

| API used | Documented? | Where (shipped asar) | Notes / upgrade risk |
|---|---|---|---|
| `tools.register(def, {when})`, plain-object definitions | **Yes** — `dsh-tools/README.md` §Conditional tools (lines 67-69); repo register validation at `dsh-tools/lib/index.js:432-444` only checks output/schema/timeoutMs/reserved name | `dsh-tools/lib/index.js:432-444` | `when` naming/shape could change; plugin is otherwise immune (register call is isolated) |
| `when` per-step semantics, thrown → `TOOL_ACTIVATION_FAILED` | **Yes** — README.md:69 (“must observe cancellation… thrown condition fails step preparation”) | `dsh-tools/lib/index.js:542-558`; `dsh-agent-loop/lib/index.js:673-681` | plugin’s sync condition ignores `signal` (harmless); see P2-3 |
| `definitions/get/schemas(scope, toolSet)` drive native + PTC projections | Yes | `dsh-tools/lib/index.js:520-620`; native `dsh-tool-executor-native/lib/index.js:12-14`; PTC `dsh-tool-executor-ptc/lib/index.js:1744-1753` | output.schema only model-visible in PTC mode (P2-2) |
| `systemPrompt.section / getSectionOrder` | **Yes** — `dsh-system-prompt/README.md:56` (external contributions may use any finite order) | `dsh-system-prompt/lib/index.js:255-266` | `+50` offset is plugin-local heuristic; `TOOL_REPORT` key removal falls back to 2950 (guarded by `typeof`) |
| `agents.roots()` = live runtime roots (owner===undefined; a resumed fork may still be a root) | **Yes** — `dsh-agent/README.md:32` | `dsh-agent/lib/index.js:752-754` | subagents set `parentAgent` (`dsh-subagent/lib/index.js:1815-1823`), so exclusion holds; a future “root-created subagent” would get tool+guidance but the client hides by `session.subagent` (two notions of “subagent” must stay aligned) |
| `agent/created` / `agent/disposed`; `enter` before `announce`; resume re-announces | **Yes** — `dsh-agent/README.md:80,207` | `dsh-agent/lib/index.js:678-691,710-713`; `dsh-agent-loop/lib/index.js:1578-1580` | safe; listener is sync and swallows errors (creation listeners must not await — compliant) |
| `agent.ctx` = scoped registrations, unwound on disposal | **Yes** — `dsh-agent/README.md:74` | `dsh-agent-loop/lib/index.js:543` (`createScope(loopCtx, this)`); loop injects tools/systemPrompt (`:1299-1306`) so `agent.ctx.systemPrompt` is reachable | per-agent section is a valid but less common pattern than official global `text({scope})`; see P2-5 |
| `presentationMeta → tool/result.meta` (session log; replay) | **Yes** — `dsh-tools/README.md:37,99` | `dsh-tools/lib/pipeline.js:712-738,208` | meta is display-only, not model context; client fallback covers loss |
| raw config passthrough when plugin has no `Config` | Code-verified, not explicitly documented in cordis README | `cordis/lib/index.js:244-249` (`if (!runtime.Config) return config`), update at `:756` | if DSH ever requires/normalizes config schemas, this plugin must add `Config` |
| loader reload = dispose-then-apply | Code-verified | `cordis/lib/index.js:693-712` (`_unload` awaited before `_reload`) | idempotency holds under HMR row update (S3); duplicate rows still collide |
| No model-argument validation for raw definitions | code-verified | `dsh-tools/lib/schema.js:296-299` (validation is added by `defineTool` only); pipeline has no arg validation | so the plugin’s own never-throw normalize is load-bearing; if a future DSH adds validation for plain definitions, invalid model args would become tool error results instead of `shown:false` (upgrade watch item) |

## 5. Prompt-layer responsibility and budget

- Intended split (tech.md:587-588): description = capability + display rule; guidance = trigger/skip; JSON-Schema = field quality; result render = after-call instructions. Verified K1-K3: field rules do not leak into description/guidance; trigger mostly in guidance; render is the only after-call layer. Residual overlaps listed P3-1.
- Token recount (`gather/recount-output.txt`): declaration 1,435 chars (claimed 1,456, −21); guidance 570 (claimed 570 ✓); always-on 2,005 chars by the design formula (claimed “507 tok”, measured ≈501 tok @4 chars/tok; native mode ≈465 tok). Result render shown 173 chars / hidden 57 (claim 173/57 ✓).
- Injection / display: model-controlled text is persisted in meta only, never re-injected into model-visible text (render is static, guidance is static) — no prompt-injection amplification. Card display relies on client text rendering (no `innerHTML`/eval found); single-line collapse prevents layout injection; bidi/zero-width/NUL survive (P3-5).

## 6. Test-quality judgement

- **Good:** host coverage from `node --test --experimental-test-coverage`: `index.js` 99.31% lines / 92.68% branches / 100% funcs; `normalize.js` 98.76% / 98.88% / 100%. Normalize tests are mostly **behavioural** (inputs → outputs) and cover the risk matrix: invalid shapes, empty, context truncation, label/prompt fallbacks and clamps, dedupe variants, stance uniqueness, recommendation uniqueness/order, cap/protected entries, id stability/order-independence, JSON-losslessness, no-mutation. Fuzz test (normalize.test.mjs:124-142) is genuinely adversarial for its scope.
- **Mirroring/brittleness:** tool.test.mjs asserts exact prompt strings and exact internal event ordering (`events[0]==='effect:…'`, `:104-108`); that is deliberate regression-guarding of prompt text but tautological for “correctness”. The hand-rolled `mount()` fake (`:40-97`) does not model real scoping, duplicate-name errors, or argument validation — the real risk area (agent-scoped sections, registry `when`, reload) is only covered by simulation, not by committed tests.
- **Weak test:** “agent disposal drops the tracked disposer” (`:361-367`) asserts the section still exists; it cannot observe the internal map, so it would pass even if the handler were deleted.
- **Gaps:** restriction/scope-check (P2-5); guidance-registration-failure isolation (index.js:247 catch untested); `getSectionOrder` not being a function (fallback branch untested); duplicate plugin row / reload idempotency (no test; verified only by my sim); token-budget/char-count guard for prompt text (claims unguarded); host/client constant parity (P3-2); no test that `render` is static w.r.t. args (injection-regression guard); no test for danger false-negative battery (P1-1).
- Uncovered lines corroborate the above: `index.js:273-274` (disposal catch), `normalize.js:201-203` (hash-collision suffix). Both benign.

## 7. Audit gaps / confidence

- No live GUI turn/tool call observed (forbidden to call `suggest_next_steps`); meta→client path verified from pipeline source + client code, not from a live session log.
- HMR/profile-patch toggle not exercised (no restart/profile edits allowed); reload verified through the shipped Cordis `_unload/_reload` path in simulation and by source reading.
- Real-code simulation stubbed `dsh-llm` (HarnessError/createToolResultMessage only) and used a fake `agents` service; the registries under test (cordis tools/systemPrompt/scope) are the shipped 0.2.2-rc.1 code. PTC SDK generation was inspected statically, not executed for this schema.
- Behaviour in non-Web/headless profiles not exercised (see P2-4).
- Token estimates use the design’s 4-chars/token convention; no token-meter measurement.
- Test-quality assessment is by inspection + line/branch coverage, not mutation testing.

## 8. Required fix list before publish (host area)

1. **P1-1** Expand/align EN danger lexicon (+ mirrored client copy) and add destructive/benign battery tests — or disable client Send mode.
2. **P1-2** Fix model-facing description wording and the “never sends / zero auto-send” claims in README and tech design §9.
3. **P2-1** Add a real `Config` schema + settings entry once no longer `link:`-installed (and document strict-`false` semantics meanwhile).
4. **P2-2/P2-3** Correct token-budget numbers; harden `when` (`context?.agent`) and make fail-open observable.
5. **P2-5** Make the guidance section scope-checked (`text({scope, toolSet})` returning `""` when hidden) — latent tool-guidance mismatch.
6. **P3** Parity test for host/client constants; tolerance fixes (stance trim/case, danger coercion, `toLowerCase`); soften “no rule repeated” claim; back the `label ≤16` vs 40 note; add the missing tests listed in §6.
7. Pick up the stale security paragraph in tech design §9 and README line 4 with the release auditor (cross-area doc defect).

## 9. Artifacts (reproducible)

`research/release-audit/host/gather/`:
- `sim-extract.mjs` + `sim-host-lifecycle.mjs` + `sim-output.txt` — extracts shipped packages to `/tmp/sim/node_modules`, mounts the real plugin with real cordis/systemPrompt/tools/scope and drives S1-S9 (root/subagent gating, fail-open, reload, restriction, prompt assembly, meta losslessness).
- `host-edge-experiments.mjs` / `host-edge2.mjs` + outputs — never-throw fuzz, unicode/bidi/truncation, danger FP/FN battery, dedupe/recommended order, config matrix, perf, prompt-layer duplication.
- `recount.mjs` + output — declaration/guidance chars and token estimates; `bench.mjs` + output — buildMeta timing; `coverage-output.txt` — node test coverage.
