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

export const DEFAULTS = Object.freeze({
  // The old client-side `enabled` switch moved to the Host config (the plugin
  // row's `enabled`), so client settings only carry display preferences now.
  // `maxPerTurn` is either 'auto' (show what the model returned, 1–6) or a
  // fixed 1–6 cap. Auto is the default: the model already picks the useful count.
  maxPerTurn: 'auto',
  // `clickMode` is 'fill' (fill the input, never send) or 'send' (fill + submit;
  // dangerous suggestions always stay 'fill').
  clickMode: 'fill',
})

export const LIMITS = Object.freeze({
  maxSuggestions: 6,
  maxPerTurn: 6,
  context: 120,
  label: 40,
  labelDisplay: 20,
  prompt: 500,
})

export const STANCES = Object.freeze(['verify', 'continue', 'push', 'pivot', 'optional'])

export const NOTES = Object.freeze({
  invalidArguments: 'invalid-arguments',
  missingContext: 'missing-context',
  noUsableSuggestions: 'no-usable-suggestions',
})

export const RISK_LEXICON = Object.freeze([
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

export function collapse(value) {
  return value.replace(/\s+/g, ' ').trim()
}

export function truncate(value, max) {
  const characters = Array.from(value)
  if (characters.length <= max) return value
  return `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

export function normalizeKey(value) {
  return collapse(value)
    .toLocaleLowerCase()
    .replace(/[。．.!！?？,，;；:：]+$/u, '')
}

export function hashBase36(value) {
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
export function modelFromArgs(rawArguments) {
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
export function isAuthoritativeMeta(rawMeta) {
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
export function parseMeta(rawMeta, fallbackNote = '') {
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
export function clampSettings(raw) {
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
export function buildDisplay(model, settings) {
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
export function resolveDraftAction({ draft, appliedPrompt }) {
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
export function mergeDraft({ mode, draft, prompt }) {
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

export const storageKeys = Object.freeze({
  prefix: STORAGE_PREFIX,
  settings: `${STORAGE_PREFIX}settings`,
  stats: `${STORAGE_PREFIX}stats`,
  turn: (sessionId, turn) => `${STORAGE_PREFIX}turn:${asText(sessionId)}:${String(turn)}`,
})

export function decodeSettings(rawStored) {
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

export function serializeSettings(settings) {
  return JSON.stringify(clampSettings(settings))
}

export function decodeTurnState(rawStored) {
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

export function serializeTurnState(state) {
  const record = isRecord(state) ? state : {}
  const filledId = typeof record.filledId === 'string' && record.filledId !== '' ? record.filledId : null
  return JSON.stringify({
    dismissed: record.dismissed === true,
    ...(filledId === null ? {} : { filledId }),
  })
}

/**
 * The status line the card should show, or null for no status.
 *
 * Priority: dismissed > conflict > sent > filled/danger. `activeFill` must come
 * from {@link deriveActiveFill}: a persisted id or a click that the user has
 * since edited must not keep claiming "filled".
 * @param {{ dismissed?: boolean, conflict?: boolean, sent?: boolean,
 *   activeFill?: { danger?: boolean }|null }} state
 * @returns {string | null} locale key
 */
export function cardStatusKey(state = {}) {
  if (state.dismissed === true) return 'status.dismissed'
  if (state.conflict === true) return 'status.conflict'
  if (state.sent === true) return 'status.sent'
  if (isRecord(state.activeFill)) return state.activeFill.danger === true ? 'status.danger' : 'status.filled'
  return null
}

/**
 * The suggestion the card filled that is still actually present in the draft.
 *
 * The draft is authoritative. `applied` records the text this card wrote in
 * the current mount; `persistedId` is the localStorage hint restored after a
 * reload. Neither counts unless the draft still equals the written text
 * (`applied`) or the suggestion's own prompt (`persistedId`), so editing,
 * clearing, or a stale restored id never leaves a false "filled" state.
 *
 * @param {{ suggestions?: Array, draft?: string, persistedId?: string|null,
 *   applied?: { id?: string, text?: string, prompt?: string, danger?: boolean }|null }} input
 * @returns {{ id: string, prompt: string, danger: boolean, text: string }|null}
 */
export function deriveActiveFill({ suggestions, draft, persistedId, applied } = {}) {
  const current = asText(draft)
  const record = isRecord(applied) ? applied : null
  if (record !== null && typeof record.text === 'string' && record.text !== '' && record.text === current) {
    return {
      id: asText(record.id),
      prompt: asText(record.prompt),
      danger: record.danger === true,
      text: current,
    }
  }
  if (typeof persistedId !== 'string' || persistedId === '') return null
  const list = Array.isArray(suggestions) ? suggestions : []
  const persisted = list.find((item) => isRecord(item) && item.id === persistedId)
  if (persisted === undefined || current === '' || current !== persisted.prompt) return null
  return {
    id: asText(persisted.id),
    prompt: asText(persisted.prompt),
    danger: persisted.danger === true,
    text: current,
  }
}

/** Prompt of a normalized suggestion id, or '' when the id is unknown. */
function promptOfSuggestion(suggestions, id) {
  if (typeof id !== 'string' || id === '') return ''
  const list = Array.isArray(suggestions) ? suggestions : []
  const suggestion = list.find((item) => isRecord(item) && item.id === id)
  return suggestion === undefined ? '' : asText(suggestion.prompt)
}

/**
 * The preview line under the controls.
 *
 * Hover/focus wins; otherwise the last suggestion this card picked (and which
 * therefore still owns the preview even after the draft is edited), then the
 * restored suggestion id, then the recommended/first suggestion. Keeping the
 * picked prompt ahead of the recommended one is what stops the preview from
 * jumping back to the recommended item after a non-recommended click.
 * @param {{ suggestions?: Array, preview?: string|null, pickedPrompt?: string }} input
 * @returns {string}
 */
export function derivePreviewText({ suggestions, preview, pickedPrompt } = {}) {
  const hovered = asText(preview)
  if (hovered !== '') return hovered
  const picked = asText(pickedPrompt)
  if (picked !== '') return picked
  const list = Array.isArray(suggestions) ? suggestions : []
  const fallback = list.find((item) => isRecord(item) && item.recommended === true)
    ?? list.find((item) => isRecord(item) && asText(item.prompt) !== '')
  return fallback === undefined ? '' : asText(fallback.prompt)
}

/**
 * Derive everything the card renders that depends on mutable UI state, so the
 * state combinations can be tested without React. `filledId` is null unless
 * the draft really contains the fill and that fill was not just sent;
 * `statusKey` obeys the documented priority; `previewText` never snaps back to
 * the recommendation after a non-recommended pick.
 * @param {object} input
 * @returns {{ activeFill: object|null, filledId: string|null, statusKey: string|null, previewText: string }}
 */
export function deriveCardView({
  suggestions,
  draft,
  persistedId,
  applied,
  preview,
  sent = false,
  conflict = false,
  dismissed = false,
  canWrite = true,
} = {}) {
  const list = Array.isArray(suggestions) ? suggestions : []
  // A submitted pick was consumed by the send, so it must not also keep the
  // chip marked as merely filled while the composer catches up.
  const activeFill = sent === true
    ? null
    : deriveActiveFill({ suggestions: list, draft, persistedId, applied })
  const appliedPrompt = isRecord(applied) ? asText(applied.prompt) : ''
  const persistedPrompt = promptOfSuggestion(list, persistedId)
  const pickedPrompt = appliedPrompt !== '' ? appliedPrompt : persistedPrompt
  return {
    activeFill,
    filledId: activeFill === null ? null : activeFill.id,
    statusKey: canWrite === false
      ? 'status.unavailable'
      : cardStatusKey({ dismissed, conflict, sent, activeFill }),
    previewText: derivePreviewText({ suggestions: list, preview, pickedPrompt }),
  }
}

/**
 * Whether picking a suggestion should submit immediately. Only the explicit
 * Send-mode opt-in may submit, and only for safe suggestions that are not being
 * resolved through a draft conflict; conflict resolution is always fill-only.
 * @param {{ clickMode?: string, danger?: boolean, conflict?: boolean }} input
 * @returns {boolean}
 */
export function shouldAutoSubmit({ clickMode, danger = false, conflict = false } = {}) {
  return clickMode === 'send' && danger !== true && conflict !== true
}

/**
 * Merge one draft-conflict choice. The result is always fill-only (`submit:
 * false`): the user is deciding how to combine their draft, not authorizing a
 * send, and a Send-mode card must not submit text it has not shown yet.
 * @param {{ draft?: string, prompt?: string, mode?: string }} input
 * @returns {{ text: string, submit: boolean }|null} null for cancel/invalid
 */
export function resolveConflictFill({ draft, prompt, mode } = {}) {
  const text = mergeDraft({ mode, draft, prompt })
  if (text === null) return null
  return { text, submit: false }
}

/**
 * Which control block the card renders: suggestions, the conflict prompt, or
 * nothing (dismissed cards keep the card but lose their controls/footer).
 * @param {{ dismissed?: boolean, conflict?: boolean }} state
 * @returns {'suggestions'|'conflict'|'hidden'}
 */
export function cardControlMode(state = {}) {
  if (state.dismissed === true) return 'hidden'
  if (state.conflict === true) return 'conflict'
  return 'suggestions'
}

// ---------------------------------------------------------------------------
// Storage helpers (tolerate unavailable storage; return defaults)
// ---------------------------------------------------------------------------

/** @param {{ getItem(key: string): string | null }} storage */
export function readSettingsFrom(storage) {
  try {
    return decodeSettings(storage.getItem(storageKeys.settings))
  } catch {
    return decodeSettings(undefined)
  }
}

/** @param {{ setItem(key: string, value: string): void }} storage */
export function writeSettingsTo(storage, settings) {
  try {
    storage.setItem(storageKeys.settings, serializeSettings(settings))
    return true
  } catch {
    return false
  }
}

/** Whether a localStorage key belongs to one turn's card state. */
export function isTurnStateKey(key) {
  return typeof key === 'string' && key.startsWith('dsh-next-actions:v1:turn:')
}

/**
 * Remove every persisted card state (used by the settings page reset action).
 * @param {{ length: number, key(index: number): string | null, removeItem(key: string): void }} storage
 * @returns {number} number of removed entries
 */
export function clearTurnStates(storage) {
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
export const CARD_REVEAL = Object.freeze({
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
export function shouldRevealCard(input) {
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

export function textOfContent(content) {
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
export function deriveProcessState({ phase, isError, errorCode, meta } = {}) {
  if (phase === 'preparing') return 'preparing'
  if (phase === 'start') return 'running'
  if (errorCode === 'interrupted') return 'stopped'
  if (isError === true) return 'error'
  const parsed = parseMeta(meta)
  if (parsed.shown === false) return 'error'
  return 'ok'
}

/** Expansion reason: only failed or not-shown calls have one. */
export function processReason({ phase, isError, errorCode, meta, content, note } = {}) {
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

export function noteToLocaleKey(note) {
  return NOTE_LOCALE_KEYS[asText(note)] ?? null
}
