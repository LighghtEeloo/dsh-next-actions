/**
 * Browser half template for @local/dsh-next-actions.
 *
 * M2: turn-tail data layer — a Conversation Definition folds this tool's
 * `tool/call` + `tool/result` (preferring the Host-persisted `tool/result.meta`,
 * falling back to the arguments when compaction dropped it) into
 * `turn.data.get('next-steps')`.
 * M10 (2026-11-10): PTC (`run_code`) sessions fold `tool/ptc-dispatch-start` +
 * `tool/ptc-dispatch` into the same turn data. Those records carry `meta` and
 * `isError` directly on `data` and are placed in a turn through the outer
 * `run_code` call, which is the only record naming the turn.
 * M3: the card renders the official action-card frame (copied markup/CSS, no
 * Harness Client imports), fills the input draft on click, and owns the
 * conflict / dismiss / preview states.
 * M9: a live turn-tail card reveals itself with a short height/opacity
 * transition. DSH 0.2.2's default completion-time fold mounts the card in the
 * same frame that collapses the turn's work rows, so a full-height insert moves
 * the just-read answer up by the card height in one frame; the transition lets
 * the scroll layer follow the growth frame by frame. Historical cards
 * (session open / rebuild) and reduced-motion users keep the instant mount.
 *
 * Built by scripts/build-client.mjs, which inlines lib/view-model.js and
 * src/styles.js at the markers below. The generated client.js is a single
 * classic script; the module id must equal the package name.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-next-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
 * Client-side pure view logic for the next-steps card (M2 data layer).
 *
 * This module is import-free and side-effect-free: it is unit-tested directly
 * with `node --test` and inlined verbatim into the single-file browser bundle by
 * `scripts/build-client.mjs` (the template marks the inline site).
 *
 * Responsibilities:
 *   - defend-parse the Host-persisted `tool/result.meta` into a display model;
 *   - rebuild a conservative model from `tool/call.arguments` when compaction
 *     dropped the meta (fallback path only);
 *   - turn a model + local settings into the card's display model;
 *   - decide "fill vs conflict" for a clicked suggestion and merge drafts;
 *   - decide when a live turn-tail card reveals itself instead of appearing in
 *     the DSH completion-fold frame's single jump;
 *   - own localStorage keys, settings clamping and persisted-state codecs;
 *   - derive the process-row state/reason from a tool view's phase/block/meta.
 *
 * The risk lexicon intentionally duplicates the Host copy: this file must stay
 * import-free so it can run both in Node tests and inside the browser bundle.
 */

const DEFAULTS = Object.freeze({
  // The old client-side `enabled` switch moved to the Host config (the plugin
  // row's `enabled`), so client settings only carry display preferences now.
  // `maxPerTurn` is either 'auto' (show what the model returned, 1–6) or a
  // fixed 1–6 cap. Auto is the default: the model already picks the useful count.
  maxPerTurn: 'auto',
  // `clickMode` is 'fill' (fill the input, never send) or 'send' (fill + submit;
  // dangerous suggestions always stay 'fill').
  clickMode: 'fill',
})

const LIMITS = Object.freeze({
  maxSuggestions: 6,
  maxPerTurn: 6,
  context: 120,
  label: 40,
  labelDisplay: 20,
  prompt: 500,
})

const STANCES = Object.freeze(['verify', 'continue', 'push', 'pivot', 'optional'])

const NOTES = Object.freeze({
  invalidArguments: 'invalid-arguments',
  missingContext: 'missing-context',
  noUsableSuggestions: 'no-usable-suggestions',
})

const RISK_LEXICON = Object.freeze([
  /\brm\s+-rf\b/i,
  /\bforce[- ]?push\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bformat\s+(disk|drive|volume)\b/i,
  /\bdeploy\b/i,
  /\bpublish\b/i,
  /\bproduction\b/i,
  /删除|清空|重置|格式化|强制推送|强推|发布|部署|上线|付费|扣费|支付|授权|提权|权限|卸载|回滚|迁移|销毁/,
])

const STORAGE_PREFIX = 'dsh-next-actions:v1:'

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const asText = (value) => (typeof value === 'string' ? value : '')

function collapse(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value, max) {
  const characters = Array.from(value)
  if (characters.length <= max) return value
  return `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

function normalizeKey(value) {
  return collapse(value)
    .toLocaleLowerCase()
    .replace(/[。．.!！?？,，;；:：]+$/u, '')
}

function hashBase36(value) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function riskOf(label, prompt) {
  const haystack = `${label}\n${prompt}`
  return RISK_LEXICON.some((pattern) => pattern.test(haystack))
}

/**
 * Clean one suggestion. Ids are kept when valid (the Host already assigned
 * them); otherwise they are derived from the prompt so local state stays stable.
 */
function cleanSuggestion(raw, usedIds) {
  if (!isRecord(raw)) return undefined
  const label = truncate(collapse(asText(raw.label)), LIMITS.label)
  const promptText = truncate(collapse(asText(raw.prompt)), LIMITS.prompt)
  if (label === '' && promptText === '') return undefined
  const prompt = promptText === '' ? label : promptText
  const safeLabel = label === '' ? truncate(prompt, LIMITS.label) : label
  const stance = STANCES.includes(raw.stance) ? raw.stance : 'continue'
  const providedId = typeof raw.id === 'string' && raw.id !== '' ? raw.id : ''
  let id = providedId !== '' ? providedId : `s${hashBase36(prompt)}`
  let suffix = 1
  while (usedIds.has(id)) {
    suffix += 1
    id = `${providedId !== '' ? providedId : `s${hashBase36(prompt)}`}-${suffix}`
  }
  usedIds.add(id)
  const suggestion = { id, label: safeLabel, prompt, stance }
  if (raw.recommended === true) suggestion.recommended = true
  if (raw.danger === true || riskOf(safeLabel, prompt)) suggestion.danger = true
  return suggestion
}

/** Dedupe prompts, cap to six, order recommendation first and optional last. */
function cleanSuggestions(rawSuggestions) {
  const usedIds = new Set()
  const seen = new Set()
  const kept = []
  for (const raw of rawSuggestions) {
    const suggestion = cleanSuggestion(raw, usedIds)
    if (suggestion === undefined) continue
    const key = normalizeKey(suggestion.prompt)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    kept.push(suggestion)
    if (kept.length >= LIMITS.maxSuggestions) break
  }
  return orderSuggestions(kept)
}

function orderSuggestions(suggestions) {
  const recommendation = suggestions.find((suggestion) => suggestion.recommended)
  const optional = suggestions.find((suggestion) => suggestion.stance === 'optional' && suggestion !== recommendation)
  const middle = suggestions.filter((suggestion) => suggestion !== recommendation && suggestion !== optional)
  return [
    ...(recommendation ? [recommendation] : []),
    ...middle,
    ...(optional ? [optional] : []),
  ]
}

/**
 * Rebuild a model from raw tool arguments (compaction fallback). Never throws;
 * returns null when nothing renderable can be recovered.
 */
function modelFromArgs(rawArguments) {
  let args = rawArguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return null
    }
  }
  if (!isRecord(args)) return null
  const context = truncate(collapse(asText(args.context)), LIMITS.context)
  if (context === '') return null
  if (!Array.isArray(args.suggestions)) return null
  const suggestions = cleanSuggestions(args.suggestions)
  if (suggestions.length === 0) return null
  return { shown: true, context, suggestions }
}

/** Whether a raw meta is an authoritative record (has a boolean `shown`). */
function isAuthoritativeMeta(rawMeta) {
  let meta = rawMeta
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      return false
    }
  }
  return isRecord(meta) && typeof meta.shown === 'boolean'
}

/**
 * Defend-parse the persisted `tool/result.meta` into a display model.
 * A meta that cannot produce a card becomes `{ shown: false, note }`.
 */
function parseMeta(rawMeta, fallbackNote = '') {
  let meta = rawMeta
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      meta = undefined
    }
  }
  if (!isRecord(meta) || typeof meta.shown !== 'boolean') {
    return { shown: false, note: asText(fallbackNote) || NOTES.invalidArguments }
  }
  if (meta.shown === false) {
    return { shown: false, note: asText(meta.note) || asText(fallbackNote) || NOTES.noUsableSuggestions }
  }
  const context = truncate(collapse(asText(meta.context)), LIMITS.context)
  const suggestions = Array.isArray(meta.suggestions) ? cleanSuggestions(meta.suggestions) : []
  if (context === '' || suggestions.length === 0) {
    return { shown: false, note: asText(meta.note) || NOTES.noUsableSuggestions }
  }
  return { shown: true, context, suggestions }
}

/**
 * Clamp persisted or user-entered settings into the supported shape.
 * Unknown keys are dropped, including the removed client-side `enabled` flag:
 * legacy stored JSON from before the Host gate must still decode cleanly.
 */
function clampSettings(raw) {
  const record = isRecord(raw) ? raw : {}
  const rawCount = record.maxPerTurn
  const maxPerTurn = rawCount === 'auto'
    ? 'auto'
    : Number.isInteger(rawCount)
      ? Math.min(LIMITS.maxPerTurn, Math.max(1, rawCount))
      : DEFAULTS.maxPerTurn
  return {
    maxPerTurn,
    clickMode: record.clickMode === 'send' || record.clickMode === 'fill'
      ? record.clickMode
      : DEFAULTS.clickMode,
  }
}

/**
 * Build the card's display model. Returns null when the card must not render.
 * Whether cards exist at all is the Host's call (no tool = no model), so this
 * no longer takes a client-side enabled gate.
 */
function buildDisplay(model, settings) {
  if (!isRecord(model) || model.shown !== true) return null
  if (!Array.isArray(model.suggestions) || model.suggestions.length === 0) return null
  const resolved = clampSettings(settings)
  const limit = resolved.maxPerTurn === 'auto' ? model.suggestions.length : resolved.maxPerTurn
  const items = model.suggestions.slice(0, limit)
  return {
    context: model.context,
    items,
    moreCount: Math.max(0, model.suggestions.length - items.length),
    totalCount: model.suggestions.length,
    autoCount: resolved.maxPerTurn === 'auto',
  }
}

/**
 * Decide what a click does. `appliedPrompt` is the last text this card filled
 * and the user has not edited it yet, so another click may replace it silently.
 * @returns {{ kind: 'fill' } | { kind: 'conflict' }}
 */
function resolveDraftAction({ draft, appliedPrompt }) {
  const current = asText(draft)
  if (current.trim() === '') return { kind: 'fill' }
  if (asText(appliedPrompt) !== '' && current === appliedPrompt) return { kind: 'fill' }
  return { kind: 'conflict' }
}

/**
 * Merge a conflict choice into the draft. `null` means "leave the draft alone".
 * @param {{ mode: 'replace'|'append'|'cancel', draft: string, prompt: string }} input
 * @returns {string | null}
 */
function mergeDraft({ mode, draft, prompt }) {
  if (mode === 'replace') return asText(prompt)
  if (mode === 'append') {
    const base = asText(draft).trimEnd()
    return base === '' ? asText(prompt) : `${base}\n\n${asText(prompt)}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const storageKeys = Object.freeze({
  prefix: STORAGE_PREFIX,
  settings: `${STORAGE_PREFIX}settings`,
  stats: `${STORAGE_PREFIX}stats`,
  turn: (sessionId, turn) => `${STORAGE_PREFIX}turn:${asText(sessionId)}:${String(turn)}`,
})

function decodeSettings(rawStored) {
  let value = rawStored
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = undefined
    }
  }
  return clampSettings(value)
}

function serializeSettings(settings) {
  return JSON.stringify(clampSettings(settings))
}

function decodeTurnState(rawStored) {
  let value = rawStored
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = undefined
    }
  }
  const record = isRecord(value) ? value : {}
  return {
    dismissed: record.dismissed === true,
    filledId: typeof record.filledId === 'string' && record.filledId !== '' ? record.filledId : null,
  }
}

function serializeTurnState(state) {
  const record = isRecord(state) ? state : {}
  const filledId = typeof record.filledId === 'string' && record.filledId !== '' ? record.filledId : null
  return JSON.stringify({
    dismissed: record.dismissed === true,
    ...(filledId === null ? {} : { filledId }),
  })
}

/**
 * The status line the card should show, or null for no status.
 * @param {{ dismissed?: boolean, conflict?: boolean, filledId?: string|null, danger?: boolean }} state
 * @returns {string | null} locale key
 */
function cardStatusKey(state = {}) {
  if (state.dismissed === true) return 'status.dismissed'
  if (state.conflict === true) return 'status.conflict'
  if (typeof state.filledId === 'string' && state.filledId !== '') {
    return state.danger === true ? 'status.danger' : 'status.filled'
  }
  return null
}

/**
 * Which control block the card renders: suggestions, the conflict prompt, or
 * nothing (dismissed cards keep the card but lose their controls/footer).
 * @param {{ dismissed?: boolean, conflict?: boolean }} state
 * @returns {'suggestions'|'conflict'|'hidden'}
 */
function cardControlMode(state = {}) {
  if (state.dismissed === true) return 'hidden'
  if (state.conflict === true) return 'conflict'
  return 'suggestions'
}

// ---------------------------------------------------------------------------
// Storage helpers (tolerate unavailable storage; return defaults)
// ---------------------------------------------------------------------------

/** @param {{ getItem(key: string): string | null }} storage */
function readSettingsFrom(storage) {
  try {
    return decodeSettings(storage.getItem(storageKeys.settings))
  } catch {
    return decodeSettings(undefined)
  }
}

/** @param {{ setItem(key: string, value: string): void }} storage */
function writeSettingsTo(storage, settings) {
  try {
    storage.setItem(storageKeys.settings, serializeSettings(settings))
    return true
  } catch {
    return false
  }
}

/** Whether a localStorage key belongs to one turn's card state. */
function isTurnStateKey(key) {
  return typeof key === 'string' && key.startsWith('dsh-next-actions:v1:turn:')
}

/**
 * Remove every persisted card state (used by the settings page reset action).
 * @param {{ length: number, key(index: number): string | null, removeItem(key: string): void }} storage
 * @returns {number} number of removed entries
 */
function clearTurnStates(storage) {
  const keys = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (isTurnStateKey(key)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    return 0
  }
  return keys.length
}

// ---------------------------------------------------------------------------
// Live mount reveal (turn-tail insertion animation)
// ---------------------------------------------------------------------------

/**
 * DSH 0.2.2's default collapse timing is "on completion": `turn/end` mounts the
 * completed-turn footer (this card's turn-tail row) in the same React commit
 * that instantly folds the turn's work rows, then lands the reader through its
 * instant-fold compensation. Inserting the card's full height in that one frame
 * shifts the just-read answer up by the card height under a reader following
 * the bottom. Revealing the card over a short height/opacity transition lets
 * the transcript's scroll layer consume the growth frame by frame instead of in
 * one jump.
 */
const CARD_REVEAL = Object.freeze({
  // Short enough to feel immediate, long enough for the scrollport to follow
  // several frames instead of one.
  durationMs: 180,
  // The opacity sweep finishes slightly earlier than the height so the card is
  // fully readable while its last rows arrive.
  opacityMs: 140,
  // Only a card inserted at the live tail (the reader is following the floor)
  // is worth animating; a card mounted while reading history does not move the
  // reader (native scroll anchoring keeps the visible content still).
  maxDistanceFromTail: 96,
  // A turn that ended long ago was mounted by a chat-window rebuild, a session
  // reload, or a resync; keep those cards instant.
  maxTurnAgeMs: 5000,
})

/**
 * Decide whether a freshly mounted turn-tail card should animate itself in.
 * Pure so the policy can be unit-tested without a DOM.
 * @param {object} input - `{ reducedMotion, distanceFromTail, turnAgeMs }`.
 * @returns {boolean} whether to run the reveal transition.
 */
function shouldRevealCard(input) {
  if (!isRecord(input)) return false
  if (input.reducedMotion === true) return false
  const distance = input.distanceFromTail
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return false
  if (distance > CARD_REVEAL.maxDistanceFromTail) return false
  const age = input.turnAgeMs
  // Unknown age (missing event time or skewed clock) falls back to the reader
  // position alone; a future end time can only come from clock skew and is
  // treated as fresh.
  if (typeof age === 'number' && Number.isFinite(age) && age > CARD_REVEAL.maxTurnAgeMs) return false
  return true
}

// ---------------------------------------------------------------------------
// Process row and localization helpers
// ---------------------------------------------------------------------------

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((item) => (isRecord(item) && item.type === 'text' ? [asText(item.text)] : []))
    .join('\n')
}

/**
 * Process-row state. Mirrors the official ProposeRow state machine and extends
 * it to a successful call whose meta says no card was shown.
 * @returns {'preparing'|'running'|'ok'|'error'|'stopped'}
 */
function deriveProcessState({ phase, isError, errorCode, meta } = {}) {
  if (phase === 'preparing') return 'preparing'
  if (phase === 'start') return 'running'
  if (errorCode === 'interrupted') return 'stopped'
  if (isError === true) return 'error'
  const parsed = parseMeta(meta)
  if (parsed.shown === false) return 'error'
  return 'ok'
}

/** Expansion reason: only failed or not-shown calls have one. */
function processReason({ phase, isError, errorCode, meta, content, note } = {}) {
  if (phase !== 'result') return ''
  if (errorCode === 'interrupted') return asText(note) || 'interrupted'
  if (isError === true) return textOfContent(content)
  const parsed = parseMeta(meta)
  return parsed.shown === false ? asText(parsed.note) : ''
}

const NOTE_LOCALE_KEYS = Object.freeze({
  [NOTES.invalidArguments]: 'note.invalidArguments',
  [NOTES.missingContext]: 'note.missingContext',
  [NOTES.noUsableSuggestions]: 'note.noUsableSuggestions',
})

function noteToLocaleKey(note) {
  return NOTE_LOCALE_KEYS[asText(note)] ?? null
}

    /**
 * Card CSS for the browser half (M3).
 *
 * Values are copied from the official action card and its primitives in DSH
 * 0.2.2-rc.1 (design/next-step-suggestions-tech.md appendix A/B). Classes are
 * renamed under the `dshns-` prefix and only theme tokens are referenced, per
 * the official external-plugin guidance. Additions for our own controls
 * (controls row, tags, prompt preview, conflict row) reuse the same tokens and
 * spacing scale. M9 adds the reveal wrapper: the script owns the height/opacity
 * transition, the stylesheet only guarantees reduced-motion safety.
 */
const STYLES = `
.dshns-card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  font-family: var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
  margin: 16px 0;
  overflow: hidden;
}
/* M9: live mount reveal wrapper (see CARD_REVEAL / shouldRevealCard). The
 * script owns the max-height/opacity transition and hides overflow only while
 * it runs, so the settled card clips nothing. */
.dshns-reveal { min-width: 0; }
.dshns-reveal[data-revealing] { will-change: max-height, opacity; }
@media (prefers-reduced-motion: reduce) {
  .dshns-reveal { transition: none !important; }
  .dshns-reveal[data-revealing] { max-height: none !important; opacity: 1 !important; overflow: visible !important; }
}
.dshns-body { padding: 14px 20px 18px; }
.dshns-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
.dshns-mark {
  display: inline-block;
  vertical-align: -3px;
  margin-right: 6px;
}
.dshns-toggle {
  height: auto;
  min-height: 24px;
  margin: 8px 0 0;
  padding-inline: 0;
  font-size: 12px;
}
.dshns-statusbar {
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  min-height: 28px;
  display: flex;
}
.dshns-status {
  color: var(--dsw-alias-label-secondary);
  margin: 0 auto 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.dshns-btn.dshns-dismiss,
.dshns-btn.dshns-restore {
  flex: none;
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
}
.dshns-btn.dshns-dismiss:hover:not(:disabled),
.dshns-btn.dshns-restore:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.dshns-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.dshns-chip { max-width: 100%; text-align: left; }
.dshns-chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshns-tag {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent));
}
.dshns-tag-info { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-secondary)); }
.dshns-tag-warning { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.dshns-preview {
  /* Fixed slot: hovering between chips only changes the text, never the layout. */
  box-sizing: border-box;
  height: 56px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent));
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.dshns-conflict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.dshns-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  padding: 0 14px;
}
.dshns-btn:disabled { cursor: not-allowed; opacity: .4; }
.dshns-btn-sm {
  height: 28px;
  font-size: 12px;
  line-height: 18px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-sm);
}
.dshns-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dshns-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshns-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshns-btn-ghost:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dshns-btn-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

/* TextShimmer: copied from the official primitive (dshns- renames, tokens only). */
.dshns-shimmer {
  position: relative;
  display: inline-grid;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  vertical-align: top;
  color: inherit;
}
.dshns-shimmer-content { display: flex; align-items: center; min-width: 0; }
.dshns-shimmer-text { color: inherit; }
.dshns-shimmer-text[data-shimmer-text]:after { content: attr(data-shimmer-text); }
.dshns-shimmer-decoration {
  position: absolute;
  inset: 0;
  overflow: clip;
  pointer-events: none;
  user-select: none;
}
.dshns-shimmer-sweep {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-shimmer);
  mask-image: linear-gradient(105deg, transparent 0%, black 40% 60%, transparent 100%);
  transform: translate(-100%);
  animation-name: dshns-row-shimmer-sweep;
}
.dshns-shimmer-sweep * { color: inherit !important; }
.dshns-shimmer-sweep [data-shimmer-decoration] { background: currentColor; }
.dshns-shimmer-highlight {
  width: 100%;
  height: 100%;
  transform: translate(100%);
  animation-name: dshns-row-shimmer-highlight;
}
.dshns-shimmer-sweep,
.dshns-shimmer-highlight {
  animation-duration: 1.5s;
  animation-delay: .3s;
  animation-timing-function: steps(48, end);
  animation-iteration-count: infinite;
}
@keyframes dshns-row-shimmer-sweep {
  0% { transform: translate(-100%); }
  66.6667%, to { transform: translate(100%); }
}
@keyframes dshns-row-shimmer-highlight {
  0% { transform: translate(100%); }
  66.6667%, to { transform: translate(-100%); }
}
@media (prefers-reduced-motion: reduce) {
  .dshns-shimmer-decoration { display: none; }
  .dshns-shimmer-sweep,
  .dshns-shimmer-highlight { animation: none; }
}

/* Settings section (copied SegmentedControl styles + row layout). */
.dshns-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 8px 20px 24px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 1.6;
}
.dshns-settings-heading {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  margin: 8px 0 12px;
}
.dshns-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 0;
  border-top: .5px solid var(--dsw-alias-border-l3);
}
.dshns-setting-label { min-width: 0; color: var(--dsw-alias-label-primary); }
.dshns-setting-note {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0 0;
}
.dshns-settings-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.dshns-settings-status {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.dshns-segmented {
  position: relative;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 4px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshns-segmented-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc((100% - 8px - 2px * (var(--dsh-segment-count) - 1)) / var(--dsh-segment-count));
  height: calc(100% - 8px);
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft);
  transform: translate(calc(var(--dsh-segment-index) * (100% + 2px)));
  transition: transform .16s ease;
  pointer-events: none;
}
.dshns-segmented-tab {
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color .12s ease;
}
.dshns-segmented-tab[aria-selected=true] { color: var(--dsw-alias-label-primary); }
.dshns-segmented-tab:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshns-segmented-tab:disabled { cursor: default; opacity: .4; }

/* Process row: copied from the official action-card DisclosureRow/ProposeRow. */
.dshns-disc-root { display: flex; flex-direction: column; width: 100%; min-width: 0; }
.dshns-disc-header { display: flex; align-items: center; min-width: 0; }
.dshns-disc-header[data-has-accessory] { gap: 8px; }
.dshns-disc-header[data-has-accessory] .dshns-disc-row { flex: 0 1 auto; }
.dshns-disc-row {
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  transition: color .1s ease;
}
.dshns-disc-row[data-expandable] { cursor: pointer; }
.dshns-disc-row:hover { color: var(--dsw-alias-label-secondary); }
.dshns-disc-leading {
  position: relative;
  flex: none;
  width: calc(16px + var(--dsh-content-font-delta, 0px));
  height: calc(16px + var(--dsh-content-font-delta, 0px));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
}
.dshns-disc-leading svg:not([data-state]) {
  width: calc(14px + var(--dsh-content-font-delta, 0px));
  height: calc(14px + var(--dsh-content-font-delta, 0px));
}
button.dshns-disc-leading { cursor: pointer; }
.dshns-disc-iconIdle { display: inline-flex; opacity: 1; transition: opacity .1s ease; }
.dshns-disc-chevronHover { position: absolute; inset: 0; margin: auto; opacity: 0; transition: opacity .1s ease; }
.dshns-disc-row:hover .dshns-disc-iconIdle { opacity: 0; }
.dshns-disc-row:hover .dshns-disc-chevronHover { opacity: 1; }
.dshns-disc-content { display: flex; align-items: center; min-width: 0; }
.dshns-disc-title {
  flex: none;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: inherit;
}
.dshns-row-summary {
  min-width: 0;
  color: inherit;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  font-size: 12px;
  display: flex;
}
.dshns-row-summary > :first-child { flex-shrink: 0; }
.dshns-row-title { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.dshns-row-reason {
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 8px 0;
  padding: 12px;
  font-size: 12px;
}
.dshns-row-inspect {
  color: var(--dsw-alias-link);
  font: inherit;
  cursor: pointer;
  background: 0 0;
  border: none;
  align-self: flex-start;
  padding: 4px 0;
  font-size: 12px;
}
`

    const PKG = '@local/dsh-next-actions'
    const NS = 'nextSteps'
    const TOOL_NAME = 'suggest_next_steps'
    const DEFINITION_KEY = 'next-steps'
    const CARD_ORDER = -10

    // -----------------------------------------------------------------------
    // Locale dictionaries (official frame copy + this plugin's keys)
    // -----------------------------------------------------------------------

    const EN = Object.freeze({
      'card.title': 'Suggested next steps',
      'card.expand': 'Show more',
      'card.collapse': 'Show less',
      'card.dismiss': 'Not now',
      'card.restore': 'Restore suggestions',
      'card.more': 'More ({n})',
      'chip.recommended': 'Recommended',
      'chip.danger': 'Needs confirmation',
      'chip.optional': 'Optional',
      'chip.filled': 'Filled',
      'status.filled': 'Filled into the input — review and send',
      'status.danger': 'This may be irreversible — review before sending',
      'status.dismissed': 'Dismissed',
      'status.conflict': 'The input already has content',
      'status.unavailable': 'The composer is unavailable',
      'conflict.replace': 'Replace',
      'conflict.append': 'Append',
      'conflict.cancel': 'Cancel',
      'fallback.context': 'Here are a few natural next steps.',
      'note.invalidArguments': 'The tool arguments were invalid',
      'note.missingContext': 'No context was provided',
      'note.noUsableSuggestions': 'No usable suggestions were produced',
      'note.interrupted': 'The call was interrupted',
      'row.title': 'Suggested next steps',
      'row.preparing': 'Preparing suggestions',
      'row.running': 'Writing suggestions',
      'row.ok': 'Suggested',
      'row.error': 'Not shown',
      'row.stopped': 'Interrupted',
      'row.inspect': 'Inspect call',
      'settings.title': 'Next steps',
      'settings.hostGate': 'Cards are controlled by the plugin Host config (profile cordis.patch.yml → dsh-next-actions → enabled). Turning it off removes the tool and the prompt guidance.',
      'settings.maxPerTurn': 'Suggestions per reply',
      'settings.auto': 'Auto',
      'settings.clickMode': 'Clicking a suggestion',
      'settings.clickFill': 'Fill input',
      'settings.clickSend': 'Send',
      'status.sent': 'Sent as your message',
      'settings.note': 'Clicking a suggestion fills the input; choose Send to submit immediately. Dangerous suggestions always fill only.',
      'settings.reset': 'Reset card states',
      'settings.saved': 'Saved',
      'settings.resetDone': 'Card states cleared',
      'settings.resetEmpty': 'Nothing to clear',
      'settings.storageUnavailable': 'Could not save in this browser',
    })

    const ZH = Object.freeze({
      'card.title': '下一步建议',
      'card.expand': '展开',
      'card.collapse': '收起',
      'card.dismiss': '暂不需要',
      'card.restore': '恢复建议',
      'card.more': '还有 {n} 条',
      'chip.recommended': '推荐',
      'chip.danger': '需确认',
      'chip.optional': '可以不做',
      'chip.filled': '已填入',
      'status.filled': '已填入输入框，可修改后发送',
      'status.danger': '该操作可能不可逆，请确认后发送',
      'status.dismissed': '已忽略',
      'status.conflict': '输入框已有内容',
      'status.unavailable': '输入框暂不可用',
      'conflict.replace': '替换',
      'conflict.append': '追加',
      'conflict.cancel': '取消',
      'fallback.context': '接下来可以：',
      'note.invalidArguments': '工具参数无效',
      'note.missingContext': '缺少上下文说明',
      'note.noUsableSuggestions': '没有可用的建议',
      'note.interrupted': '调用已中断',
      'row.title': '下一步建议',
      'row.preparing': '正在准备建议',
      'row.running': '正在生成建议',
      'row.ok': '已生成',
      'row.error': '未显示',
      'row.stopped': '已中断',
      'row.inspect': '查看调用',
      'settings.title': '下一步建议',
      'settings.hostGate': '卡片总开关已移到插件的 Host 配置（profile 的 cordis.patch.yml → dsh-next-actions → enabled）；关闭后不再注册工具与提示词。',
      'settings.maxPerTurn': '每轮建议条数',
      'settings.auto': '自动',
      'settings.clickMode': '点击建议时',
      'settings.clickFill': '填入输入框',
      'settings.clickSend': '直接发送',
      'status.sent': '已作为你的消息发送',
      'settings.note': '点击建议默认只填入输入框；选择“直接发送”会立即发出；危险建议始终只填入。',
      'settings.reset': '重置卡片状态',
      'settings.saved': '已保存',
      'settings.resetDone': '卡片状态已清理',
      'settings.resetEmpty': '没有可清理的状态',
      'settings.storageUnavailable': '当前浏览器无法保存',
    })

    // -----------------------------------------------------------------------
    // Client helpers
    // -----------------------------------------------------------------------

    let sharedCtx = null

    function injectStyles(css) {
      const element = document.createElement('style')
      element.dataset.plugin = PKG
      element.dataset.pluginCss = `${PKG}/client.css`
      element.textContent = css
      document.head.appendChild(element)
      return element
    }

    function readSettings() {
      return readSettingsFrom(window.localStorage)
    }

    function readTurnState(sessionId, turn) {
      try {
        return decodeTurnState(window.localStorage.getItem(storageKeys.turn(sessionId, turn)))
      } catch {
        return decodeTurnState(undefined)
      }
    }

    function writeTurnState(sessionId, turn, state) {
      try {
        window.localStorage.setItem(storageKeys.turn(sessionId, turn), serializeTurnState(state))
      } catch {
        // Storage can be unavailable (privacy mode, quota); the card still works.
      }
    }

    /** Focus the composer through the conversation service when it is available. */
    function focusComposer(sessionId) {
      try {
        sharedCtx?.get?.('conversation')?.input?.shell?.(sessionId)?.focus?.()
      } catch {
        // Focusing is optional; the draft is already filled.
      }
    }

    // -----------------------------------------------------------------------
    // Live reveal (M9) — see CARD_REVEAL / shouldRevealCard
    // -----------------------------------------------------------------------

    const REVEAL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

    /**
     * First-render box of the reveal wrapper: collapsed so DSH's same-commit
     * instant-fold measurement (which runs after this commit's DOM mutations)
     * sees no card height. The layout effect below either expands it with the
     * reveal transition or clears the style before the first paint.
     * A stable object identity keeps React from rewriting the imperative
     * transition styles on later re-renders of the same card.
     */
    const REVEAL_INITIAL_STYLE = Object.freeze({ overflow: 'hidden', maxHeight: '0px', opacity: 0 })

    /** Nearest transcript scrollport: DSH's shared one, or a scrolling ancestor. */
    function findCardScrollport(element) {
      let node = element === null || element === undefined ? null : element.parentElement
      while (node !== null) {
        if (node.hasAttribute('data-conversation-scroll')) return node
        const overflowY = window.getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return node
        node = node.parentElement
      }
      return null
    }

    /** Distance from the scrollport floor, or null when it cannot be measured. */
    function distanceFromTail(scrollport) {
      if (scrollport === null) return null
      const distance = scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop
      return Number.isFinite(distance) ? Math.max(0, distance) : null
    }

    function prefersReducedMotion() {
      try {
        return typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        return false
      }
    }

    /** Age of the turn's `turn/end` event in milliseconds, or undefined. */
    function turnEndAge(turn) {
      const end = turn === undefined || turn === null ? undefined : turn.end
      const time = end === undefined || end === null ? undefined : end.time
      const value = typeof time === 'number' ? time : typeof time === 'string' ? Date.parse(time) : NaN
      return Number.isFinite(value) ? Date.now() - value : undefined
    }

    /** Remove the reveal transition styles, leaving the card at its natural box. */
    function clearReveal(wrapper) {
      if (wrapper === null) return
      delete wrapper.dataset.revealing
      wrapper.style.transition = ''
      wrapper.style.maxHeight = ''
      wrapper.style.opacity = ''
      wrapper.style.overflow = ''
    }

    /** Height the wrapper must reach for the card plus its own vertical margins to fit. */
    function revealTargetHeight(card) {
      try {
        const rect = card.getBoundingClientRect()
        const computed = window.getComputedStyle(card)
        const marginTop = Number.parseFloat(computed.marginTop) || 0
        const marginBottom = Number.parseFloat(computed.marginBottom) || 0
        const height = rect.height + marginTop + marginBottom
        return Number.isFinite(height) && height > 0 ? Math.ceil(height) : 0
      } catch {
        return 0
      }
    }

    // -----------------------------------------------------------------------
    // Copied primitives (markup + CSS behavior; see official guidance)
    // -----------------------------------------------------------------------

    function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }) {
      const classes = ['dshns-btn', `dshns-btn-${variant}`, size === 'sm' ? 'dshns-btn-sm' : '', className ?? '']
        .filter((value) => value !== '')
        .join(' ')
      return h('button', { type: 'button', className: classes, ...rest },
        icon !== undefined && icon !== null ? h('span', { className: 'dshns-btn-icon' }, icon) : null,
        children)
    }

    function Tag({ tone = 'muted', children }) {
      return h('span', { className: `dshns-tag dshns-tag-${tone}` }, children)
    }

    // -----------------------------------------------------------------------
    // FoldedText — copied algorithm from the official card frame
    // -----------------------------------------------------------------------

    const WIDE_GRAPHEME = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-｠￠-￦]/u
    const FOLD_WIDTH = 260

    function FoldedText({ text, lead, expandLabel, collapseLabel }) {
      const id = React.useId()
      const [expanded, setExpanded] = React.useState(false)
      const preview = React.useMemo(() => {
        const compact = text.replace(/\s+/g, ' ').trim()
        const characters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(compact), (part) => part.segment)
        let width = 0
        for (const [index, character] of characters.entries()) {
          width += WIDE_GRAPHEME.test(character) ? 2 : 1
          if (width > FOLD_WIDTH) return `${characters.slice(0, index).join('').trimEnd()}…`
        }
        return undefined
      }, [text])
      return h(React.Fragment, null,
        h('p', { id, className: 'dshns-text' }, lead ?? null, expanded || preview === undefined ? text : preview),
        preview !== undefined
          ? h(Button, {
            variant: 'ghost',
            size: 'sm',
            className: 'dshns-toggle',
            'aria-expanded': expanded,
            'aria-controls': id,
            onClick: () => { setExpanded((value) => !value) },
          }, expanded ? collapseLabel : expandLabel)
          : null)
    }

    /**
     * Small brand mark: the plugin icon reduced to an inline glyph. Solid fills
     * only (no gradient defs) so several cards on one page cannot collide on a
     * document-wide SVG id. Decorative: the card still carries its aria-label.
     */
    function NextStepsMark({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 36 36',
        fill: 'none',
        className: 'dshns-mark',
        'aria-hidden': 'true',
      },
      h('g', { transform: 'translate(-1.5 0.5)' },
        h('rect', { x: 5, y: 7.6, width: 21, height: 5.4, rx: 2.7, fill: '#5E9DF5' }),
        h('rect', { x: 5, y: 15.3, width: 16, height: 5.4, rx: 2.7, fill: '#7AAEFF' }),
        h('rect', { x: 5, y: 23, width: 11, height: 5.4, rx: 2.7, fill: '#9CC3FF' }),
        h('path', {
          d: 'M29.6 6.6C29.88 8.65 31.25 10.02 33.3 10.3C31.25 10.58 29.88 11.95 29.6 14C29.32 11.95 27.95 10.58 25.9 10.3C27.95 10.02 29.32 8.65 29.6 6.6Z',
          fill: '#41E1AC',
        })))
    }

    // -----------------------------------------------------------------------
    // Turn-tail card (M3)
    // -----------------------------------------------------------------------

    function NextStepsCard(props) {
      const { turn, inputActions, useInput, useSession, sessionId, t } = props
      const turnNumber = turn === undefined || turn === null ? undefined : turn.turn

      const [settings] = React.useState(readSettings)
      const [turnState, setTurnState] = React.useState(() => readTurnState(sessionId, turnNumber))
      const [expanded, setExpanded] = React.useState(false)
      const [conflict, setConflict] = React.useState(null)
      const [filledId, setFilledId] = React.useState(turnState.filledId)
      const [statusKey, setStatusKey] = React.useState(null)
      const [preview, setPreview] = React.useState(null)
      const dangerRef = React.useRef(false)
      const appliedRef = React.useRef(null)

      const draft = typeof useInput === 'function'
        ? useInput((state) => (state === undefined || state === null ? '' : state.draft))
        : ''
      const subagent = typeof useSession === 'function'
        ? useSession((state) => (state === undefined || state === null ? null : state.subagent))
        : null

      // Resolve the card data before the reveal effect so `hasCard` can gate it.
      // The normal turn/tail event order makes the card available on its first
      // render; a late-published model must not leave the wrapper collapsed.
      const tail = turn === undefined || turn === null || turn.end === undefined || turn.data === undefined
        ? undefined
        : turn.data.get('turn-tail')
      const data = turn === undefined || turn === null || turn.data === undefined
        ? undefined
        : turn.data.get(DEFINITION_KEY)
      const model = data === undefined || data === null ? undefined : data.model
      const display = model === undefined ? null : buildDisplay(model, settings)
      const hasCard = turn !== undefined && turn !== null && turn.end !== undefined
        && tail !== undefined && tail !== null
        && tail.closing !== undefined && tail.closing !== null
        && !subagent && display !== null

      // M9: reveal the card instead of inserting its full height in one frame.
      // The wrapper starts collapsed so DSH's instant-fold measurement in this
      // same commit sees no card height; then either the transition runs or the
      // style is cleared before the first paint.
      const revealRef = React.useRef(null)
      const revealStartedRef = React.useRef(false)
      React.useLayoutEffect(() => {
        const wrapper = revealRef.current
        if (!hasCard || wrapper === null || revealStartedRef.current) return undefined
        revealStartedRef.current = true
        const card = wrapper.firstElementChild
        let targetHeight = 0
        try {
          const animate = card !== null && shouldRevealCard({
            reducedMotion: prefersReducedMotion(),
            distanceFromTail: distanceFromTail(findCardScrollport(wrapper)),
            turnAgeMs: turnEndAge(turn),
          })
          targetHeight = animate ? revealTargetHeight(card) : 0
        } catch {
          // A layout or matchMedia failure must never leave the card collapsed.
          targetHeight = 0
        }
        if (targetHeight <= 0) {
          clearReveal(wrapper)
          return undefined
        }
        let timer = null
        const finish = () => {
          if (timer !== null) window.clearTimeout(timer)
          timer = null
          wrapper.removeEventListener('transitionend', onEnd)
          clearReveal(wrapper)
        }
        const onEnd = (event) => {
          if (event.target === wrapper && event.propertyName === 'max-height') finish()
        }
        wrapper.dataset.revealing = ''
        wrapper.style.transition = 'none'
        wrapper.style.overflow = 'hidden'
        wrapper.style.maxHeight = '0px'
        wrapper.style.opacity = '0'
        // Commit the collapsed box before transitioning; otherwise the first
        // resolved style is already the target and no transition runs.
        void wrapper.offsetHeight
        wrapper.style.transition = `max-height ${CARD_REVEAL.durationMs}ms ${REVEAL_EASING}, `
          + `opacity ${CARD_REVEAL.opacityMs}ms ease-out`
        wrapper.style.maxHeight = `${targetHeight}px`
        wrapper.style.opacity = '1'
        wrapper.addEventListener('transitionend', onEnd)
        timer = window.setTimeout(finish, CARD_REVEAL.durationMs + 160)
        return finish
      }, [hasCard])

      if (!hasCard) return null

      const canWrite = inputActions !== undefined && inputActions !== null && typeof inputActions.setDraft === 'function'
      const mode = cardControlMode({ dismissed: turnState.dismissed, conflict: conflict !== null })
      const statusFromState = cardStatusKey({
        dismissed: turnState.dismissed,
        conflict: conflict !== null,
        filledId,
        danger: dangerRef.current,
      }) ?? statusKey
      const status = canWrite ? statusFromState : 'status.unavailable'
      const items = expanded ? model.suggestions : display.items
      const moreCount = expanded ? 0 : display.moreCount
      const title = t('card.title')
      const recommended = model.suggestions.find((suggestion) => suggestion.recommended === true)
      const defaultPreview = (recommended ?? model.suggestions[0]).prompt
      const previewText = preview === null ? defaultPreview : preview

      function applyFill(text, suggestion, owned = true) {
        const mode = readSettings().clickMode
        const danger = suggestion.danger === true
        inputActions.setDraft(text)
        // An appended draft contains the user's own text, so a later click must
        // ask before replacing it; only pure "replace/empty" fills stay owned.
        appliedRef.current = owned ? { prompt: text, id: suggestion.id } : null
        const next = { ...turnState, filledId: suggestion.id }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setFilledId(suggestion.id)
        setConflict(null)
        setPreview(null)
        dangerRef.current = danger
        // Dangerous suggestions always fill only; "send" needs a real submit.
        const canSend = mode === 'send' && danger !== true && typeof inputActions.submit === 'function'
        if (canSend) {
          inputActions.submit()
          setStatusKey('status.sent')
          return
        }
        setStatusKey(danger ? 'status.danger' : 'status.filled')
        focusComposer(sessionId)
      }

      function onPick(suggestion) {
        if (!canWrite) return
        const action = resolveDraftAction({
          draft,
          appliedPrompt: appliedRef.current === null ? '' : appliedRef.current.prompt,
        })
        if (action.kind === 'conflict') {
          setConflict(suggestion)
          setPreview(null)
          return
        }
        applyFill(suggestion.prompt, suggestion)
      }

      function onConflictChoice(choice) {
        if (conflict === null) return
        setConflict(null)
        if (choice === 'cancel') return
        const merged = mergeDraft({ mode: choice, draft, prompt: conflict.prompt })
        if (merged === null) return
        applyFill(merged, conflict, choice === 'replace')
      }

      function onDismiss() {
        const next = { ...turnState, dismissed: true }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPreview(null)
        setStatusKey(null)
      }

      function onRestore() {
        const next = { ...turnState, dismissed: false }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPreview(null)
        setStatusKey(null)
      }

      function renderChip(suggestion) {
        const filled = suggestion.id === filledId
        return h(Button, {
          key: suggestion.id,
          variant: suggestion.recommended === true ? 'primary' : 'ghost',
          size: 'sm',
          className: 'dshns-chip',
          'aria-label': suggestion.prompt,
          disabled: !canWrite,
          onClick: () => { onPick(suggestion) },
          onMouseEnter: () => { setPreview(suggestion.prompt) },
          onMouseLeave: () => { setPreview(null) },
          onFocus: () => { setPreview(suggestion.prompt) },
          onBlur: () => { setPreview(null) },
        },
        h('span', { className: 'dshns-chip-label' }, suggestion.label),
        filled ? h(Tag, { tone: 'muted' }, t('chip.filled')) : null,
        suggestion.recommended === true ? h(Tag, { tone: 'info' }, t('chip.recommended')) : null,
        suggestion.danger === true ? h(Tag, { tone: 'warning' }, t('chip.danger')) : null,
        suggestion.stance === 'optional' ? h(Tag, { tone: 'muted' }, t('chip.optional')) : null)
      }

      const controls = mode === 'suggestions'
        ? h('div', { className: 'dshns-controls' },
          ...items.map(renderChip),
          moreCount > 0
            ? h(Button, {
              variant: 'ghost',
              size: 'sm',
              className: 'dshns-toggle',
              onClick: () => { setExpanded(true) },
            }, t('card.more').replace('{n}', String(moreCount)))
            : null,
          expanded
            ? h(Button, {
              variant: 'ghost',
              size: 'sm',
              className: 'dshns-toggle',
              onClick: () => { setExpanded(false) },
            }, t('card.collapse'))
            : null)
        : mode === 'conflict'
          ? h('div', { className: 'dshns-conflict' },
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('replace') } }, t('conflict.replace')),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('append') } }, t('conflict.append')),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('cancel') } }, t('conflict.cancel')))
          : null

      // Always mounted with a fixed height: moving the pointer between chips only
      // swaps the text, so nothing reflows (that reflow was the "zoom" flicker).
      const previewBlock = mode === 'suggestions'
        ? h('div', { className: 'dshns-preview', role: 'note' }, previewText)
        : null

      const statusText = status === null || status === undefined ? null : t(status)
      // One quiet state toggle at the end of the status row: minus dismisses the
      // suggestions, plus restores them — the two directions of the same action.
      const dismissed = turnState.dismissed === true
      const stateButton = mode === 'suggestions'
        ? h(Button, {
          variant: 'ghost',
          size: 'sm',
          className: 'dshns-dismiss',
          icon: h(MinusIcon, { size: 16 }),
          onClick: onDismiss,
          title: t('card.dismiss'),
          'aria-label': t('card.dismiss'),
        })
        : dismissed
          ? h(Button, {
            variant: 'ghost',
            size: 'sm',
            className: 'dshns-restore',
            icon: h(PlusIcon, { size: 16 }),
            onClick: onRestore,
            title: t('card.restore'),
            'aria-label': t('card.restore'),
          })
          : null
      const statusBar = statusText === null && stateButton === null
        ? null
        : h('div', { className: 'dshns-statusbar' },
          statusText === null ? null : h('p', { className: 'dshns-status', role: 'status' }, statusText),
          stateButton)

      return h('div', {
        className: 'dshns-reveal',
        ref: revealRef,
        style: REVEAL_INITIAL_STYLE,
      },
      h('section', {
        className: 'dshns-card',
        'aria-label': title,
        'data-next-steps-card': '',
      },
      h('div', { className: 'dshns-body' },
        h(FoldedText, {
          text: model.context === '' ? t('fallback.context') : model.context,
          lead: h(NextStepsMark, { size: 16 }),
          expandLabel: t('card.expand'),
          collapseLabel: t('card.collapse'),
        }),
        controls,
        previewBlock,
        statusBar)))
    }

    // -----------------------------------------------------------------------
    // Settings section (M6): copied SegmentedControl primitive + row layout.
    // The old "show cards" Switch moved to the Host config, so the section only
    // renders a read-only note pointing at that gate.
    // -----------------------------------------------------------------------

    function SegmentedControl({ value, options, onChange, label }) {
      const index = Math.max(0, options.findIndex((option) => option.value === value))
      const style = {
        '--dsh-segment-count': String(options.length),
        '--dsh-segment-index': String(index),
      }
      const onKeyDown = (event) => {
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0
        if (delta === 0) return
        event.preventDefault()
        const next = options[(index + delta + options.length) % options.length]
        if (next.value !== value) onChange(next.value)
      }
      return h('div', {
        role: 'tablist',
        'aria-label': label,
        className: 'dshns-segmented',
        style,
        onKeyDown,
      },
      h('span', { 'aria-hidden': 'true', className: 'dshns-segmented-indicator' }),
      ...options.map((option) => h('button', {
        key: String(option.value),
        type: 'button',
        role: 'tab',
        'aria-selected': option.value === value,
        tabIndex: option.value === value ? 0 : -1,
        className: 'dshns-segmented-tab',
        onClick: () => { if (option.value !== value) onChange(option.value) },
      }, option.label)))
    }

    function SettingsSection(props) {
      const { t } = props
      const [settings, setSettings] = React.useState(() => readSettings())
      const [status, setStatus] = React.useState(null)

      function update(patch) {
        const next = clampSettings({ ...settings, ...patch })
        setSettings(next)
        setStatus(writeSettingsTo(window.localStorage, next) ? 'settings.saved' : 'settings.storageUnavailable')
      }

      function resetStates() {
        const removed = clearTurnStates(window.localStorage)
        setStatus(removed > 0 ? 'settings.resetDone' : 'settings.resetEmpty')
      }

      const options = [
        { value: 'auto', label: t('settings.auto') },
        ...[1, 2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) })),
      ]
      const row = (key, label, control) => h('div', { className: 'dshns-setting-row', key },
        h('span', { className: 'dshns-setting-label' }, label),
        control)
      return h('div', { className: 'dshns-settings' },
        h('h2', { className: 'dshns-settings-heading' }, t('settings.title')),
        h('p', { className: 'dshns-setting-note' }, t('settings.hostGate')),
        row('maxPerTurn', t('settings.maxPerTurn'), h(SegmentedControl, {
          value: settings.maxPerTurn,
          options,
          onChange: (value) => { update({ maxPerTurn: value }) },
          label: t('settings.maxPerTurn'),
        })),
        row('clickMode', t('settings.clickMode'), h(SegmentedControl, {
          value: settings.clickMode,
          options: [
            { value: 'fill', label: t('settings.clickFill') },
            { value: 'send', label: t('settings.clickSend') },
          ],
          onChange: (value) => { update({ clickMode: value }) },
          label: t('settings.clickMode'),
        })),
        h('p', { className: 'dshns-setting-note' }, t('settings.note')),
        h('div', { className: 'dshns-settings-actions' },
          h(Button, { variant: 'ghost', size: 'sm', onClick: resetStates }, t('settings.reset')),
          status === null ? null : h('span', { className: 'dshns-settings-status', role: 'status' }, t(status))))
    }

    // -----------------------------------------------------------------------
    // Process-group row (M5) — one-line record, copied from the official
    // ProposeRow + DisclosureRow markup/CSS and behavior.
    // -----------------------------------------------------------------------

    function AppsAddIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      },
      h('rect', { x: '2.25', y: '2.25', width: '4', height: '4', rx: '1' }),
      h('rect', { x: '2.25', y: '9.75', width: '4', height: '4', rx: '1' }),
      h('rect', { x: '9.75', y: '9.75', width: '4', height: '4', rx: '1' }),
      h('path', { d: 'M11.75 1.75v5M9.25 4.25h5' }))
    }

    function MinusIcon({ size = 16, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M4 8H12',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }

    function PlusIcon({ size = 16, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className,
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M4 8H12M8 4V12',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }

    function ChevronDownIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6',
        stroke: 'currentColor',
      }))
    }

    function ChevronUpIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10',
        stroke: 'currentColor',
      }))
    }

    /**
     * Monochrome 16px companion to `icon.svg`: the same suggestion-list + sparkle
     * mark, inked in `currentColor` for the Settings navigation row.
     */
    function SectionIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M2.8 4.3H9.6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M2.8 7.8H7.4',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M2.8 11.3H6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M12.5 2.2C12.7 3.45 13.5 4.25 14.75 4.45C13.5 4.65 12.7 5.45 12.5 6.7C12.3 5.45 11.5 4.65 10.25 4.45C11.5 4.25 12.3 3.45 12.5 2.2Z',
        fill: 'currentColor',
      }))
    }

    // -----------------------------------------------------------------------
    // TextShimmer (copied from the official primitive): the running-state sweep
    // over a row's title/summary. Context flag avoids double-decoration inside
    // the duplicated highlight copy.
    // -----------------------------------------------------------------------

    const ShimmerContext = React.createContext(undefined)

    function ShimmerText({ children, className }) {
      const inside = React.useContext(ShimmerContext) === true && typeof children === 'string'
      return h('span', {
        className: `dshns-shimmer-text ${className ?? ''}`,
        'data-shimmer-text': inside ? children : undefined,
      }, inside ? null : children)
    }

    const TextShimmer = React.memo(function TextShimmer({ children, active = false, className, contentClassName }) {
      const inside = React.useContext(ShimmerContext)
      if (inside !== undefined) return h(ShimmerText, { className }, children)
      const content = typeof children === 'string'
        ? h(ShimmerText, null, children)
        : children
      return h('span', {
        className: `dshns-shimmer ${className ?? ''}`,
        'data-shimmer': active ? '' : undefined,
      },
      h(ShimmerContext.Provider, { value: false },
        h('span', { className: `dshns-shimmer-content ${contentClassName ?? ''}` }, content)),
      active
        ? h('span', { className: 'dshns-shimmer-decoration', 'aria-hidden': 'true', inert: '' },
          h('span', { className: 'dshns-shimmer-sweep' },
            h(ShimmerContext.Provider, { value: true },
              h('span', { className: `dshns-shimmer-content dshns-shimmer-highlight ${contentClassName ?? ''}` }, content))))
        : null)
    })

    /**
     * Copied DisclosureRow: root[data-open] > header[data-disclosure-header] >
     * row[data-disclosure-row][data-expandable] with leading icon/chevron and a
     * title + collapsedContent; expands on row click or Enter/Space.
     */
    function DisclosureRow({
      icon,
      title,
      open,
      expandable,
      onToggle,
      running = false,
      expandOnRowClick = false,
      previewChevron = true,
      keepContentWhenOpen = false,
      collapsedContent,
      headerAccessory,
      children,
      className,
      rowClassName,
      leadingClassName,
      chevronClassName,
      titleClassName,
    }) {
      const rowExpandable = expandable === true && expandOnRowClick === true
      const onKeyDown = (event) => {
        if (!rowExpandable) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onToggle()
      }
      const idle = previewChevron
        ? h(React.Fragment, null,
          h('span', { className: 'dshns-disc-iconIdle' }, icon),
          h(ChevronDownIcon, { className: `dshns-disc-chevronHover ${chevronClassName ?? ''}` }))
        : icon
      const leadingIcon = open ? h(ChevronUpIcon, { className: chevronClassName }) : idle
      const leading = expandable === true && rowExpandable === false
        ? h('button', {
          type: 'button',
          className: `dshns-disc-leading ${leadingClassName ?? ''}`,
          'aria-label': title,
          'aria-expanded': open,
          onClick: (event) => {
            event.stopPropagation()
            onToggle()
          },
        }, leadingIcon)
        : h('span', { className: `dshns-disc-leading ${leadingClassName ?? ''}` }, leadingIcon)
      return h('div', {
        className: `dshns-disc-root ${className ?? ''}`,
        'data-open': open ? '' : undefined,
      },
      h('div', {
        className: 'dshns-disc-header',
        'data-disclosure-header': '',
        'data-has-accessory': headerAccessory === undefined || headerAccessory === null ? undefined : '',
      },
      h('div', {
        className: `dshns-disc-row ${rowClassName ?? ''}`,
        'data-disclosure-row': '',
        'data-expandable': rowExpandable ? '' : undefined,
        role: rowExpandable ? 'button' : undefined,
        tabIndex: rowExpandable ? 0 : undefined,
        'aria-expanded': rowExpandable ? open : undefined,
        onClick: rowExpandable ? onToggle : undefined,
        onKeyDown: rowExpandable ? onKeyDown : undefined,
      },
      leading,
      h(TextShimmer, {
        active: running,
        contentClassName: 'dshns-disc-content',
      },
      h(ShimmerText, { className: `dshns-disc-title ${titleClassName ?? ''}` }, title),
      keepContentWhenOpen || !open ? collapsedContent : null)),
      headerAccessory),
      open && children !== undefined && children !== null ? children : null)
    }

    /** Localize the machine-readable reasons the view model returns. */
    function localizeProcessReason(reason, t) {
      if (reason === '') return ''
      if (reason === 'interrupted') return t('note.interrupted')
      const key = noteToLocaleKey(reason)
      return key === null ? reason : t(key)
    }

    /** Context snippet shown after the status in the collapsed row. */
    function processSummary(phase, block) {
      try {
        if (phase === 'result') {
          const meta = parseMeta(block === undefined ? undefined : block.meta)
          return meta.shown === true ? meta.context : ''
        }
        if (phase === 'start' && block !== undefined && block.args !== undefined) {
          return block.args.text('context') ?? ''
        }
        return ''
      } catch {
        return ''
      }
    }

    function ProcessRow(props) {
      const { phase, block, inspect, t } = props
      const [open, setOpen] = React.useState(false)
      const isError = block !== undefined && block !== null && block.isError === true
      const errorCode = block !== undefined && block !== null && block.error !== undefined
        ? block.error.code
        : undefined
      const meta = block !== undefined && block !== null ? block.meta : undefined
      const state = deriveProcessState({ phase, isError, errorCode, meta })
      const reason = localizeProcessReason(
        processReason({
          phase,
          isError,
          errorCode,
          meta,
          content: block !== undefined && block !== null ? block.content : undefined,
        }),
        t,
      )
      const summary = processSummary(phase, block)
      const expandable = reason !== ''
      const collapsedContent = h('span', { className: 'dshns-row-summary' },
        h('span', null, t(`row.${state}`)),
        summary === '' ? null : h('span', { className: 'dshns-row-title' }, summary))
      return h('div', { 'data-tool': TOOL_NAME, 'data-state': state },
        h(DisclosureRow, {
          icon: h(AppsAddIcon, { size: 14 }),
          title: t('row.title'),
          open: open && expandable,
          expandable,
          running: state === 'preparing' || state === 'running',
          onToggle: () => { setOpen((value) => !value) },
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          collapsedContent,
        },
        h('pre', { className: 'dshns-row-reason' }, reason),
        typeof inspect === 'function'
          ? h('button', {
            type: 'button',
            className: 'dshns-row-inspect',
            onClick: () => { inspect() },
          }, t('row.inspect'))
          : null))
    }

    // -----------------------------------------------------------------------
    // Conversation Definition (turn-scoped fold of this tool's events)
    //
    // Two transports reach the Session log:
    //   - native: `tool/call` (arguments are a JSON string) plus an append
    //     `tool/result` whose `message` carries the result and whose `meta`
    //     carries the normalized display model;
    //   - PTC (`run_code` programs): `tool/ptc-dispatch-start` and
    //     `tool/ptc-dispatch`, where `arguments` is already a JSON value and
    //     `meta`/`isError` hang directly off `data`. Those records carry no
    //     `turn`; only the outer `run_code` call names it, so the matcher
    //     keeps a small call-id -> turn index while it forwards events.
    // -----------------------------------------------------------------------

    const SURFACE_EVENT_TYPES = new Set([
      'system/message',
      'developer/message',
      'user/message',
      'assistant/message',
      'tool/result',
    ])
    const isSurfaceEvent = (event) => SURFACE_EVENT_TYPES.has(event.type) && event.surfaceOp !== undefined
    const isAppendSurfaceEvent = (event) => isSurfaceEvent(event) && event.surfaceOp === 'append'

    /** Reserved PTC transport: its `tool/call` record is the only turn owner. */
    const RUN_CODE_TOOL = 'run_code'
    const MAX_RUN_CODE_TURNS = 1024
    /** run_code callId -> turn, for PTC dispatches that carry no turn themselves. */
    const runCodeTurns = new Map()

    /**
     * Remember one `run_code` call's turn. The matcher sees the outer call
     * before its dispatch records, so a bounded insertion-ordered index is
     * enough; it only ever maps immutable call identities.
     */
    function rememberRunCodeTurn(event) {
      const data = event.data
      if (typeof data.callId !== 'string' || !Number.isSafeInteger(data.turn)) return
      if (runCodeTurns.size >= MAX_RUN_CODE_TURNS) {
        const oldest = runCodeTurns.keys().next().value
        if (oldest !== undefined) runCodeTurns.delete(oldest)
      }
      runCodeTurns.set(data.callId, data.turn)
    }

    /** Turn of a PTC dispatch event, resolved through its outer `run_code` call. */
    function ptcTurnOf(event) {
      const data = event.data
      const callId = typeof data.rootCallId === 'string' ? data.rootCallId : data.parentCallId
      return typeof callId === 'string' ? runCodeTurns.get(callId) : undefined
    }

    /** Turn carried by a native call/result event. */
    function eventTurn(event) {
      const turn = event.data.turn
      return Number.isSafeInteger(turn) && turn >= 0 ? turn : undefined
    }

    /**
     * Turn of one framework Match. Matcher functions only receive the raw
     * event (0.2.2), while `start`, `update` and `buildLocationData` also
     * receive the resolved Match location; prefer the location and fall back
     * to the event payload for direct (test) folds.
     */
    function matchTurn(match) {
      const location = match.location
      if (location !== undefined && location !== null && (location.kind === 'turn' || location.kind === 'step')) {
        const turn = location.turn === undefined || location.turn === null ? undefined : location.turn.turn
        if (Number.isSafeInteger(turn) && turn >= 0) return turn
      }
      const event = match.event
      return event === undefined || event === null ? undefined : eventTurn(event)
    }

    const nextStepsDefinition = {
      kind: DEFINITION_KEY,
      match: (event) => {
        if (event.type === 'turn/start') {
          return { id: String(event.data.turn), role: 'start' }
        }
        if (event.type === 'tool/call') {
          if (event.data.name === RUN_CODE_TOOL) rememberRunCodeTurn(event)
          return event.data.name === TOOL_NAME
            ? { id: String(event.data.turn), role: 'update' }
            : null
        }
        if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
          return { id: String(event.data.turn), role: 'update' }
        }
        if (event.type === 'tool/ptc-dispatch-start' && event.data.name === TOOL_NAME) {
          const turn = ptcTurnOf(event)
          return turn === undefined ? null : { id: String(turn), role: 'start' }
        }
        if (event.type === 'tool/ptc-dispatch' && event.data.name === TOOL_NAME) {
          const turn = ptcTurnOf(event)
          return turn === undefined ? null : { id: String(turn), role: 'update' }
        }
        return null
      },
      start: (_context, match) => {
        const event = match.event
        const calls = new Map()
        // A window can begin at the dispatch instead of `turn/start`; record
        // that first call here so the settled record can still fall back to it.
        if (event.type === 'tool/ptc-dispatch-start') {
          calls.set(String(event.data.subCallId), {
            argsRaw: JSON.stringify(event.data.arguments === undefined ? {} : event.data.arguments),
            seq: event.seq,
          })
        }
        return { turn: matchTurn(match), calls, model: null }
      },
      update: (context, match) => {
        const state = context.state
        const event = match.event
        if (event.type === 'tool/call') {
          const calls = new Map(state.calls)
          calls.set(String(event.data.callId), {
            argsRaw: event.data.arguments,
            seq: event.seq,
          })
          return { ...state, calls }
        }
        if (event.type === 'tool/ptc-dispatch-start') {
          const calls = new Map(state.calls)
          calls.set(String(event.data.subCallId), {
            argsRaw: JSON.stringify(event.data.arguments === undefined ? {} : event.data.arguments),
            seq: event.seq,
          })
          return { ...state, calls }
        }
        // Both transports expose the same durable meta; the recorded arguments
        // only back a pruned or missing meta.
        let callId
        let meta
        if (event.type === 'tool/result') {
          // Replacement copies of a result must not re-publish the card.
          if (!isAppendSurfaceEvent(event)) return state
          const message = event.data.message
          if (message === undefined || message.isError === true) return state
          const source = message.source ?? {}
          callId = String(source.callId ?? message.toolCallId ?? '')
          meta = event.data.meta
        } else if (event.type === 'tool/ptc-dispatch') {
          if (event.data.isError === true) return state
          callId = String(event.data.subCallId)
          meta = event.data.meta
        } else {
          return state
        }
        const call = state.calls.get(callId)
        if (call === undefined) return state
        // A persisted meta with a boolean `shown` is authoritative even when it
        // says "no card"; only a missing/corrupt meta falls back to the arguments.
        const model = isAuthoritativeMeta(meta) ? parseMeta(meta) : modelFromArgs(call.argsRaw)
        if (model === null || model.shown !== true || state.model === model) return state
        return { ...state, model }
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state === undefined || context.state.model === null) return null
        const turn = context.state.turn
        if (!Number.isSafeInteger(turn) || turn < 0) return null
        const value = { turn, model: context.state.model }
        if (
          previous !== undefined
          && previous !== null
          && previous.kind === 'turn'
          && previous.turn === value.turn
          && previous.key === DEFINITION_KEY
          && previous.value === value
        ) {
          return previous
        }
        return { kind: 'turn', turn: value.turn, key: DEFINITION_KEY, value }
      },
    }

    // -----------------------------------------------------------------------
    // Plugin entry
    // -----------------------------------------------------------------------

    function apply(ctx) {
      sharedCtx = ctx

      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-next-actions: locale')
      const t = ctx.locale.bind(NS)
      if (STYLES !== '') {
        ctx.effect(() => {
          const element = injectStyles(STYLES)
          return () => element.remove()
        }, 'dsh-next-actions: styles')
      }

      ctx.effect(
        () => ctx.uiConversation.events.register(nextStepsDefinition),
        'dsh-next-actions: definition',
      )

      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: PKG,
        order: CARD_ORDER,
        locale: NS,
      }, NextStepsCard))

      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: TOOL_NAME,
        locale: NS,
      }, ProcessRow))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: PKG,
        order: 60,
        label: () => t('settings.title'),
        locale: NS,
      }, SettingsSection))

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: PKG,
        order: 60,
        label: () => t('settings.title'),
        locale: NS,
      }, SectionIcon))
    }

    return {
      // `uiConversation` is injected (not looked up lazily) so the plugin only
      // activates once the Conversation service exists; otherwise a cold boot
      // would skip the definition registration and lose the card after restart.
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      // Test seam for the built bundle (DSH ignores additional exports).
      __test: { nextStepsDefinition, parseMeta, modelFromArgs, buildDisplay },
    }
  },
})
