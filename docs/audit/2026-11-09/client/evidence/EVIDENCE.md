# Client audit — raw evidence (commands + outputs)

All commands run from `/Users/arctic/Box/Terrace/deepseek-harness/default-workspace` (2026-11-09).
Nothing under the plugin or `~/.dsh` was modified; scratch copies live in `/tmp`.

## 1. Build reproducibility / freshness / tests

```
$ rm -rf /tmp/dshns-audit && cp -R plugins/dsh-next-actions /tmp/dshns-audit/plugin
$ cd /tmp/dshns-audit/plugin && node scripts/build-client.mjs --check
build-client: client.js is up to date (75344 chars)        # exit 0
$ node scripts/build-client.mjs
build-client: wrote client.js (75344 chars)
$ shasum -a 256 client.js   # same as committed artifact
c26838bd4cca33fbe5f4e61cd8b8664d889d6a97b1421656b3aa52be8d24dd0d
$ cmp /tmp/dshns-audit/plugin/client.js plugins/dsh-next-actions/client.js  → identical
$ cd plugins/dsh-next-actions && node --test
tests 181 | pass 181 | fail 0 | duration_ms 73.7
# tamper: append "// dev-only probe" to src/client.js in the scratch copy
$ node scripts/build-client.mjs --check                          # exit 1: client.js is stale
$ node scripts/build-client.mjs && grep -c "dev-only probe" client.js → 1
```

Source/artifact hashes: `client.js c26838bd…` (75,344 chars / 2,041 lines / 76,044 bytes),
`src/client.js f976eb31…`, `lib/view-model.js 1866969…`, `src/styles.js c71739b2…`.

`npm pack --dry-run` (scratch copy, `--cache /tmp/npm-cache`): 10 files, 40.5 kB tarball / 133.5 kB unpacked:
README.md, client.js, cordis.patch.yml, icon.svg, index.js, lib/normalize.js, lib/view-model.js,
locale/en.json, locale/zh.json, package.json. No src/scripts/test; no LICENSE.

## 2. B1 crash reproduction (stub loader + stub React, built artifact)

`node research/release-audit/client/evidence/def-harness.mjs` (copy of `/tmp/def-harness.mjs`):
```
id @local/dsh-next-actions | inject ["slots","locale","uiConversation"]
ORPHAN buildLocationData threw: TypeError: Cannot read properties of undefined (reading 'model')
no model -> null
identity optimization reuses previous object: false
content equal: true
```
The harness calls `__test.nextStepsDefinition.buildLocationData({ ...context, state: undefined }, 'turn')`,
which is exactly the context shape `contextSnapshot()` produces for a start-less context
(`dsh-client-ui-conversation/lib/client.js:2480-2490`), and the path
`applyDirtyLocationData` → `definition.buildLocationData` (`:3210-3255`) is unconditional.

## 3. Bundle purity inventory (built client.js)

```
$ grep -oE "require\('[^']+'\)" client.js | sort | uniq -c
      1 require('react')
$ grep -c '@deepseek-ai' client.js        → 0
$ grep -nE 'innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|eval\(|new Function|document\.write' client.js
                                          → (no matches)
$ grep -oE 'document\.[a-zA-Z]+|window\.[a-zA-Z]+' client.js | sort | uniq -c
  1 document.createElement   1 document.head
  1 window.clearTimeout      2 window.getComputedStyle   5 window.localStorage
  2 window.matchMedia        1 window.setTimeout
$ grep -oE 'setTimeout|clearTimeout|addEventListener|removeEventListener|fetch\(|WebSocket' client.js | sort | uniq -c
  1 addEventListener 1 clearTimeout 1 removeEventListener 1 setTimeout   (no network APIs)
```

## 4. Theme tokens used by src/styles.js vs the shipped theme bundle

```
tokens used: 26 (2 local --dsh-segment-count/index, 24 external)
not defined in dsh-client-ui-theme/lib/client.js: --dsh-segment-count, --dsh-segment-index,
                                                  --dsw-alias-state-warning-primary
# theme defines --dsw-alias-state-warn-primary (correct spelling), not ...-warning-primary
```

## 5. Locale key completeness (inline EN/ZH dictionaries in src/client.js)

```
EN 44 keys, ZH 44 keys
ZH-extra []            EN-missing-zh []
every t(...)/status/note key used → present in both dictionaries
placeholder parity for {n} → equal
```
`locale/en.json` + `locale/zh.json` match the Host locale-metadata schema
(`dsh-app-boot/lib/index.js:2985-3035`: `{meta:{title,description}}`, language-id filenames).

## 6. 0.2.2-rc.1 contract anchors (read-only asar inspection)

- Loader/frozen table: `dsh-client-modules/lib/client.js:22-31,53-75,760,833-844`;
  seed modules in `dsh-web-frontend/dist/assets/index-BgUyXZcc.js:196`
  (`react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis, zod, @tanstack/react-virtual,
  @deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives,
  @deepseek-ai/dsh-client-ui-dockkit`); `immediately` → boot prefetch (`:950381`);
  client bundle path = `exports["./client"]` (`dsh-client-modules/lib/index.js:786-802`).
- Slots: catalog at `dsh-cordis-client-runner/lib/client.js:3073-3105` (turnTail),
  `:7353-7463` (toolview), `:5755-5860` (settings.section / .icon); official registrations at
  `dsh-client-ui-action-cards/lib/client.js:859-880`; settings section orders at
  `dsh-client-ui-settings-general/lib/client.js:1588-1590` (0) and siblings (-10,10,15,20).
- Definition: `dsh-client-ui-conversation/lib/client.js:2480-2490` (contextSnapshot),
  `:2865-2915` (acceptMatch/orphan contexts), `:2984-2995` (markDirty), `:3210-3255`
  (buildLocationData/replace/applyDirty), `:3438` (target/buildViewNode pairing), `:4097-4099`
  (uiConversation.events); official guards `dsh-client-ui-chat/lib/client.js:10147-10166,12950,13258-13280`.
- Window paging (B1 reachability): `dsh-api-session-controller/lib/client.js:2164-2177`
  (`HISTORY_PAGE_OPTIONS = {maxMessages:500, turnWindow:{minMessages:50,minTurns:2}}`),
  `lib/index.js:1195-1233` (`paginate`: turn-aligned cut, or mid-turn cut when the 500-message cap hits),
  `:2502` ("Prepend one Turn-aligned page … capped at 500 messages").
- Input/locale APIs: `ui-conversation/lib/client.js:15369-15396` (setDraft/submit actions),
  `:16030-16062` (compose/publish — `draft`), `:16230-16245` + `:15793` (shell.focus),
  `dsh-client-locale/lib/client.js:1660-1702` (fallback chain / register / bind),
  `dsh-cordis-client-runner/lib/client.js:2383` (`SessionSnapshot.subagent`),
  `dsh-client-ui-theme/lib/client.js:1462-1485,1473` (tokens + global :focus-visible).
- Compatibility: `dsh-app-boot/lib/index.js:1069-1105` (`engines.dsh` / `@deepseek-ai/dsh*` peers).

## 7. Local-only checks (no writes outside /tmp and this dir; no plugin/tool calls)

- Live GUI page fetch was attempted read-only and is auth-gated:
  `curl http://127.0.0.1:55142/` → "dsh web authentication required; reopen the URL printed by dsh web."
  So the running bundle revision and any live behavior could not be verified from this environment.
