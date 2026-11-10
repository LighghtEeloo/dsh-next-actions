import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULTS,
  LIMITS,
  NOTES,
  CARD_REVEAL,
  buildDisplay,
  cardControlMode,
  cardStatusKey,
  clampSettings,
  clearTurnStates,
  isTurnStateKey,
  readSettingsFrom,
  writeSettingsTo,
  collapse,
  decodeSettings,
  decodeTurnState,
  deriveProcessState,
  hashBase36,
  isAuthoritativeMeta,
  mergeDraft,
  modelFromArgs,
  normalizeKey,
  noteToLocaleKey,
  parseMeta,
  processReason,
  resolveDraftAction,
  serializeSettings,
  serializeTurnState,
  shouldRevealCard,
  storageKeys,
  textOfContent,
  truncate,
} from '../lib/view-model.js'

const context = '修复已完成，改动集中在 src/api。'

const rawSuggestion = (overrides = {}) => ({
  label: '跑一下测试',
  prompt: '跑一下测试，只跑 src/api 相关用例。',
  stance: 'verify',
  ...overrides,
})

const hostMeta = () => ({
  shown: true,
  context,
  suggestions: [
    { id: 'sa', ...rawSuggestion() },
    { id: 'sb', ...rawSuggestion({ label: '加回归用例', prompt: '补一条回归用例。', stance: 'continue', recommended: true }) },
  ],
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test('clampSettings returns defaults for missing input', () => {
  assert.deepEqual(clampSettings(undefined), DEFAULTS)
  assert.deepEqual(clampSettings(null), DEFAULTS)
  assert.deepEqual(clampSettings('nope'), DEFAULTS)
  assert.deepEqual(clampSettings({}), DEFAULTS)
})

test('clampSettings keeps valid values', () => {
  assert.deepEqual(clampSettings({ maxPerTurn: 5 }), { maxPerTurn: 5 })
  assert.deepEqual(clampSettings({ maxPerTurn: 'auto' }), { maxPerTurn: 'auto' })
})

test('clampSettings bounds maxPerTurn to 1..6', () => {
  assert.equal(clampSettings({ maxPerTurn: 0 }).maxPerTurn, 1)
  assert.equal(clampSettings({ maxPerTurn: 99 }).maxPerTurn, LIMITS.maxPerTurn)
})

test('clampSettings rejects non-integer maxPerTurn', () => {
  assert.equal(clampSettings({ maxPerTurn: 3.5 }).maxPerTurn, DEFAULTS.maxPerTurn)
  assert.equal(clampSettings({ maxPerTurn: '4' }).maxPerTurn, DEFAULTS.maxPerTurn)
  assert.equal(clampSettings({ maxPerTurn: 'auto' }).maxPerTurn, 'auto')
})

test('clampSettings drops the removed client-side enabled switch and legacy click mode', () => {
  assert.deepEqual(clampSettings({ enabled: false }), DEFAULTS)
  assert.deepEqual(clampSettings({ enabled: true, maxPerTurn: 2 }), { maxPerTurn: 2 })
  assert.equal('enabled' in clampSettings({ enabled: false }), false)
  assert.equal('clickMode' in clampSettings({ clickMode: 'send' }), false)
  assert.deepEqual(
    Object.keys(clampSettings({ enabled: false, maxPerTurn: 3, clickMode: 'send' })).sort(),
    ['maxPerTurn'],
  )
})

test('clampSettings drops the removed title preference', () => {
  assert.equal('showTitle' in clampSettings({ showTitle: false }), false)
})

// ---------------------------------------------------------------------------
// parseMeta
// ---------------------------------------------------------------------------

test('parseMeta builds a model from a valid meta', () => {
  const model = parseMeta(hostMeta())
  assert.equal(model.shown, true)
  assert.equal(model.context, context)
  assert.equal(model.suggestions.length, 2)
})

test('parseMeta orders the recommendation first and optional last', () => {
  const meta = {
    shown: true,
    context,
    suggestions: [
      { label: 'C', prompt: 'keep', stance: 'optional' },
      { label: 'A', prompt: 'verify', stance: 'verify' },
      { label: 'B', prompt: 'go', stance: 'continue', recommended: true },
    ],
  }
  const model = parseMeta(meta)
  assert.equal(model.suggestions[0].prompt, 'go')
  assert.equal(model.suggestions.at(-1).prompt, 'keep')
})

test('parseMeta keeps provided ids and derives missing ones', () => {
  const model = parseMeta(hostMeta())
  assert.deepEqual(model.suggestions.map((s) => s.id).sort(), ['sa', 'sb'])
  const derived = parseMeta({ shown: true, context, suggestions: [{ label: 'x', prompt: 'y' }] })
  assert.match(derived.suggestions[0].id, /^s[0-9a-z]+$/)
})

test('parseMeta de-duplicates prompts', () => {
  const model = parseMeta({
    shown: true,
    context,
    suggestions: [rawSuggestion(), rawSuggestion({ label: '另一个' })],
  })
  assert.equal(model.suggestions.length, 1)
})

test('parseMeta clamps the suggestion list to six', () => {
  const suggestions = Array.from({ length: 9 }, (_, index) => ({
    label: `L${index}`,
    prompt: `任务 ${index}`,
  }))
  assert.equal(parseMeta({ shown: true, context, suggestions }).suggestions.length, LIMITS.maxSuggestions)
})

test('parseMeta upgrades danger from the lexicon', () => {
  const model = parseMeta({
    shown: true,
    context,
    suggestions: [{ label: '清理', prompt: '删除旧的构建产物。' }],
  })
  assert.equal(model.suggestions[0].danger, true)
})

test('parseMeta accepts a JSON string meta', () => {
  const model = parseMeta(JSON.stringify(hostMeta()))
  assert.equal(model.shown, true)
})

test('parseMeta keeps an explicit shown:false with its note', () => {
  const model = parseMeta({ shown: false, note: NOTES.noUsableSuggestions })
  assert.deepEqual(model, { shown: false, note: NOTES.noUsableSuggestions })
})

test('parseMeta falls back to the given note for malformed meta', () => {
  assert.equal(parseMeta(undefined, 'fallback').note, 'fallback')
  assert.equal(parseMeta('{not json', 'fallback').note, 'fallback')
})

test('parseMeta rejects an empty context', () => {
  const model = parseMeta({ shown: true, context: '   ', suggestions: [rawSuggestion()] })
  assert.equal(model.shown, false)
  assert.equal(model.note, NOTES.noUsableSuggestions)
})

test('parseMeta rejects an empty suggestion list', () => {
  const model = parseMeta({ shown: true, context, suggestions: [] })
  assert.equal(model.shown, false)
})

test('parseMeta never throws on fuzz input', () => {
  for (const value of [null, undefined, 42, [], 'x', { shown: 'yes' }, { shown: true, suggestions: [null] }]) {
    const model = parseMeta(value)
    assert.equal(typeof model.shown, 'boolean')
  }
})

// ---------------------------------------------------------------------------
// modelFromArgs (compaction fallback)
// ---------------------------------------------------------------------------

test('modelFromArgs rebuilds a model from an object', () => {
  const model = modelFromArgs({ context, suggestions: [rawSuggestion()] })
  assert.equal(model.shown, true)
  assert.equal(model.suggestions.length, 1)
})

test('modelFromArgs rebuilds a model from a JSON string', () => {
  const model = modelFromArgs(JSON.stringify({ context, suggestions: [rawSuggestion()] }))
  assert.equal(model.shown, true)
})

test('modelFromArgs returns null for malformed input', () => {
  assert.equal(modelFromArgs('{not json'), null)
  assert.equal(modelFromArgs(null), null)
  assert.equal(modelFromArgs({ suggestions: [rawSuggestion()] }), null)
  assert.equal(modelFromArgs({ context, suggestions: [] }), null)
  assert.equal(modelFromArgs({ context, suggestions: 'x' }), null)
})

test('modelFromArgs fills a missing label from the prompt', () => {
  const model = modelFromArgs({ context, suggestions: [{ prompt: '只有一个提示' }] })
  assert.equal(model.suggestions[0].label, '只有一个提示')
})

test('modelFromArgs caps and de-duplicates like the host', () => {
  const suggestions = [
    { label: 'A', prompt: '跑测试' },
    { label: 'B', prompt: '  跑测试  ' },
    ...Array.from({ length: 8 }, (_, index) => ({ label: `L${index}`, prompt: `任务 ${index}` })),
  ]
  const model = modelFromArgs({ context, suggestions })
  assert.equal(model.suggestions.length, LIMITS.maxSuggestions)
})

test('modelFromArgs does not re-run explicit stance de-duplication', () => {
  const model = modelFromArgs({
    context,
    suggestions: [
      { label: 'A', prompt: '任务一', stance: 'verify' },
      { label: 'B', prompt: '任务二', stance: 'verify' },
    ],
  })
  assert.equal(model.suggestions.length, 2)
})

// ---------------------------------------------------------------------------
// isAuthoritativeMeta
// ---------------------------------------------------------------------------

test('isAuthoritativeMeta recognises records with a boolean shown', () => {
  assert.equal(isAuthoritativeMeta({ shown: true }), true)
  assert.equal(isAuthoritativeMeta({ shown: false, note: 'x' }), true)
  assert.equal(isAuthoritativeMeta('{"shown":true}'), true)
})

test('isAuthoritativeMeta rejects missing/corrupt/malformed meta', () => {
  assert.equal(isAuthoritativeMeta(undefined), false)
  assert.equal(isAuthoritativeMeta(null), false)
  assert.equal(isAuthoritativeMeta({}), false)
  assert.equal(isAuthoritativeMeta('{bad'), false)
  assert.equal(isAuthoritativeMeta({ shown: 'yes' }), false)
})

// ---------------------------------------------------------------------------
// buildDisplay
// ---------------------------------------------------------------------------

const displayModel = () => ({
  shown: true,
  context,
  suggestions: Array.from({ length: 5 }, (_, index) => ({
    id: `s${index}`,
    label: `L${index}`,
    prompt: `任务 ${index}`,
    stance: 'continue',
  })),
})

test('buildDisplay defaults to 3 suggestions and counts the rest', () => {
  const display = buildDisplay(displayModel(), DEFAULTS)
  assert.equal(display.items.length, 3)
  assert.equal(display.moreCount, 2)
  assert.equal(display.totalCount, 5)
  assert.equal(display.autoCount, false)
  assert.equal(display.context, context)
})

test('buildDisplay auto mode shows every normalized suggestion', () => {
  const display = buildDisplay(displayModel(), { maxPerTurn: 'auto' })
  assert.equal(display.autoCount, true)
  assert.equal(display.items.length, 5)
  assert.equal(display.moreCount, 0)
  assert.equal(display.totalCount, 5)
})

test('buildDisplay honours a custom maxPerTurn', () => {
  const display = buildDisplay(displayModel(), { maxPerTurn: 5 })
  assert.equal(display.items.length, 5)
  assert.equal(display.moreCount, 0)
})

test('buildDisplay ignores a legacy enabled setting', () => {
  // The Host config now owns the global gate: with no tool there is no model,
  // so a stale client-side `enabled: false` must not hide the card.
  const display = buildDisplay(displayModel(), { enabled: false, maxPerTurn: 'auto' })
  assert.notEqual(display, null)
  assert.equal(display.items.length, 5)
})

test('buildDisplay returns null for non-shown or empty models', () => {
  assert.equal(buildDisplay(null), null)
  assert.equal(buildDisplay({ shown: false }), null)
  assert.equal(buildDisplay({ shown: true, suggestions: [] }), null)
})

test('buildDisplay no longer carries the title preference', () => {
  assert.equal('showTitle' in buildDisplay(displayModel(), {}), false)
})

// ---------------------------------------------------------------------------
// Draft interactions
// ---------------------------------------------------------------------------

test('resolveDraftAction fills when the draft is empty', () => {
  assert.deepEqual(resolveDraftAction({ draft: '', appliedPrompt: '' }), { kind: 'fill' })
  assert.deepEqual(resolveDraftAction({ draft: '   \n ', appliedPrompt: '' }), { kind: 'fill' })
})

test('resolveDraftAction fills when the draft is still ours', () => {
  assert.deepEqual(
    resolveDraftAction({ draft: '跑一下测试', appliedPrompt: '跑一下测试' }),
    { kind: 'fill' },
  )
})

test('resolveDraftAction keeps a conflict when the user edited the draft', () => {
  assert.deepEqual(
    resolveDraftAction({ draft: '我自己的输入', appliedPrompt: '跑一下测试' }),
    { kind: 'conflict' },
  )
})

test('resolveDraftAction keeps a conflict when there is no applied prompt', () => {
  assert.deepEqual(
    resolveDraftAction({ draft: '我自己的输入', appliedPrompt: null }),
    { kind: 'conflict' },
  )
})

test('mergeDraft replaces the draft', () => {
  assert.equal(mergeDraft({ mode: 'replace', draft: 'old', prompt: 'new' }), 'new')
})

test('mergeDraft appends with one blank line', () => {
  assert.equal(mergeDraft({ mode: 'append', draft: 'old', prompt: 'new' }), 'old\n\nnew')
  assert.equal(mergeDraft({ mode: 'append', draft: 'old  \n', prompt: 'new' }), 'old\n\nnew')
})

test('mergeDraft appends plainly to an empty draft', () => {
  assert.equal(mergeDraft({ mode: 'append', draft: '   ', prompt: 'new' }), 'new')
})

test('mergeDraft returns null for cancel and unknown modes', () => {
  assert.equal(mergeDraft({ mode: 'cancel', draft: 'old', prompt: 'new' }), null)
  assert.equal(mergeDraft({ mode: 'nope', draft: 'old', prompt: 'new' }), null)
})

// ---------------------------------------------------------------------------
// Storage codecs
// ---------------------------------------------------------------------------

test('storage keys are namespaced per version', () => {
  assert.equal(storageKeys.settings, 'dsh-next-actions:v1:settings')
  assert.equal(storageKeys.stats, 'dsh-next-actions:v1:stats')
  assert.equal(storageKeys.turn('sess-1', 7), 'dsh-next-actions:v1:turn:sess-1:7')
})

test('decodeSettings parses JSON, objects and defaults', () => {
  assert.equal(decodeSettings('{"maxPerTurn":5}').maxPerTurn, 5)
  assert.equal('enabled' in decodeSettings({ enabled: false }), false)
  assert.deepEqual(decodeSettings('{bad'), DEFAULTS)
  assert.deepEqual(decodeSettings(undefined), DEFAULTS)
})

test('settings round-trip through serializeSettings', () => {
  const settings = { maxPerTurn: 6 }
  assert.deepEqual(decodeSettings(serializeSettings(settings)), settings)
  assert.deepEqual(decodeSettings(serializeSettings({ maxPerTurn: 'auto' })), { maxPerTurn: 'auto' })
})

test('legacy settings JSON with the removed enabled key and clickMode decodes without them', () => {
  const legacy = decodeSettings('{"enabled":false,"maxPerTurn":3,"clickMode":"send"}')
  assert.deepEqual(legacy, { maxPerTurn: 3 })
  assert.equal('enabled' in legacy, false)
  assert.equal('clickMode' in legacy, false)
  const roundTripped = decodeSettings(serializeSettings({ enabled: false, maxPerTurn: 3, clickMode: 'send' }))
  assert.deepEqual(roundTripped, { maxPerTurn: 3 })
  assert.deepEqual(Object.keys(roundTripped), ['maxPerTurn'])
})

test('decodeTurnState and serializeTurnState round-trip', () => {
  assert.deepEqual(decodeTurnState(serializeTurnState({ dismissed: true })), { dismissed: true, filledId: null })
  assert.deepEqual(decodeTurnState(undefined), { dismissed: false, filledId: null })
  assert.deepEqual(decodeTurnState('{bad'), { dismissed: false, filledId: null })
  assert.deepEqual(decodeTurnState({ dismissed: 'yes' }), { dismissed: false, filledId: null })
})

test('turn state persists the last filled suggestion id', () => {
  const state = { dismissed: false, filledId: 'sabc' }
  assert.deepEqual(decodeTurnState(serializeTurnState(state)), state)
  assert.deepEqual(decodeTurnState(serializeTurnState({ filledId: 42 })), { dismissed: false, filledId: null })
  assert.deepEqual(decodeTurnState({ dismissed: true, filledId: '' }), { dismissed: true, filledId: null })
})

test('cardStatusKey prioritizes dismissed and conflict over the active fill', () => {
  assert.equal(cardStatusKey({}), null)
  assert.equal(cardStatusKey({ dismissed: true }), 'status.dismissed')
  assert.equal(cardStatusKey({ conflict: true }), 'status.conflict')
  assert.equal(cardStatusKey({ activeFill: { danger: false } }), 'status.filled')
  assert.equal(cardStatusKey({ activeFill: { danger: true } }), 'status.danger')
  assert.equal(cardStatusKey({ dismissed: true, conflict: true }), 'status.dismissed')
})

test('cardControlMode hides controls after dismissal', () => {
  assert.equal(cardControlMode({}), 'suggestions')
  assert.equal(cardControlMode({ conflict: true }), 'conflict')
  assert.equal(cardControlMode({ dismissed: true }), 'hidden')
})

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    entries: () => [...map.entries()],
  }
}

test('readSettingsFrom returns defaults for empty or corrupt storage', () => {
  assert.deepEqual(readSettingsFrom(fakeStorage()), DEFAULTS)
  assert.deepEqual(readSettingsFrom(fakeStorage({ [storageKeys.settings]: '{bad' })), DEFAULTS)
})

test('writeSettingsTo round-trips clamped settings', () => {
  const storage = fakeStorage()
  assert.equal(writeSettingsTo(storage, { maxPerTurn: 99 }), true)
  assert.deepEqual(readSettingsFrom(storage), { maxPerTurn: 6 })
})

test('writeSettingsTo reports unavailable storage', () => {
  const storage = fakeStorage()
  storage.setItem = () => { throw new Error('quota') }
  assert.equal(writeSettingsTo(storage, DEFAULTS), false)
})

test('isTurnStateKey matches only turn entries', () => {
  assert.equal(isTurnStateKey('dsh-next-actions:v1:turn:sess:3'), true)
  assert.equal(isTurnStateKey('dsh-next-actions:v1:settings'), false)
  assert.equal(isTurnStateKey(undefined), false)
})

test('clearTurnStates removes only turn entries', () => {
  const storage = fakeStorage({
    [storageKeys.settings]: '{}',
    [storageKeys.stats]: '{}',
    'dsh-next-actions:v1:turn:a:1': '{}',
    'dsh-next-actions:v1:turn:a:2': '{}',
    'other-plugin:key': '{}',
  })
  assert.equal(clearTurnStates(storage), 2)
  assert.deepEqual(storage.entries().map(([key]) => key).sort(), [
    'dsh-next-actions:v1:settings',
    'dsh-next-actions:v1:stats',
    'other-plugin:key',
  ])
})

test('clearTurnStates is safe on unavailable storage', () => {
  const storage = fakeStorage()
  storage.removeItem = () => { throw new Error('nope') }
  assert.equal(clearTurnStates(storage), 0)
})

// ---------------------------------------------------------------------------
// Process row
// ---------------------------------------------------------------------------

test('deriveProcessState mirrors the official phases', () => {
  assert.equal(deriveProcessState({ phase: 'preparing' }), 'preparing')
  assert.equal(deriveProcessState({ phase: 'start' }), 'running')
  assert.equal(deriveProcessState({ phase: 'result', errorCode: 'interrupted' }), 'stopped')
  assert.equal(deriveProcessState({ phase: 'result', isError: true }), 'error')
  assert.equal(
    deriveProcessState({ phase: 'result', meta: { shown: true, context, suggestions: [rawSuggestion()] } }),
    'ok',
  )
})

test('deriveProcessState marks successful no-card results as error/not shown', () => {
  assert.equal(
    deriveProcessState({ phase: 'result', isError: false, meta: { shown: false, note: 'x' } }),
    'error',
  )
})

test('processReason reads error content', () => {
  const reason = processReason({
    phase: 'result',
    isError: true,
    content: [{ type: 'text', text: 'Tool failed' }, { type: 'image' }],
  })
  assert.equal(reason, 'Tool failed')
})

test('processReason explains a successful no-card result', () => {
  assert.equal(
    processReason({ phase: 'result', isError: false, meta: { shown: false, note: 'no-usable-suggestions' } }),
    'no-usable-suggestions',
  )
})

test('processReason is empty for a shown result and for non-result phases', () => {
  assert.equal(
    processReason({ phase: 'result', meta: { shown: true, context, suggestions: [rawSuggestion()] } }),
    '',
  )
  assert.equal(processReason({ phase: 'start' }), '')
  assert.equal(processReason({}), '')
})

test('noteToLocaleKey maps known notes and rejects unknown ones', () => {
  assert.equal(noteToLocaleKey(NOTES.invalidArguments), 'note.invalidArguments')
  assert.equal(noteToLocaleKey('something-else'), null)
  assert.equal(noteToLocaleKey(undefined), null)
})

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

test('textOfContent joins text blocks only', () => {
  assert.equal(textOfContent([{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }]), 'a\nb')
  assert.equal(textOfContent('nope'), '')
})

test('hashBase36 is stable and base36', () => {
  assert.equal(hashBase36('跑一下测试'), hashBase36('跑一下测试'))
  assert.match(hashBase36('x'), /^[0-9a-z]+$/)
})

test('collapse and normalizeKey are defensive', () => {
  assert.equal(collapse('  a\n b  '), 'a b')
  assert.equal(normalizeKey('  Run  Tests！ '), 'run tests')
  assert.equal(truncate('上'.repeat(10), 5), '上'.repeat(4) + '…')
  assert.equal(truncate('abc', 5), 'abc')
})

// ---------------------------------------------------------------------------
// Live mount reveal (M9)
// ---------------------------------------------------------------------------

test('CARD_REVEAL stays within the designed 150-200ms window', () => {
  assert.ok(CARD_REVEAL.durationMs >= 150 && CARD_REVEAL.durationMs <= 200)
  assert.ok(CARD_REVEAL.opacityMs > 0 && CARD_REVEAL.opacityMs <= CARD_REVEAL.durationMs)
  assert.ok(CARD_REVEAL.maxDistanceFromTail >= 0)
  assert.ok(CARD_REVEAL.maxTurnAgeMs > 0)
})

test('a live card at the tail reveals itself', () => {
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: 0, turnAgeMs: 24 }), true)
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: CARD_REVEAL.maxDistanceFromTail, turnAgeMs: 0 }), true)
  // A missing/unknown end time falls back to the reader position alone.
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: 12, turnAgeMs: undefined }), true)
  // A clock ahead of the Host (negative age) still counts as fresh.
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: 0, turnAgeMs: -800 }), true)
})

test('historical, scrolled-away, or reduced-motion cards mount instantly', () => {
  assert.equal(shouldRevealCard({ reducedMotion: true, distanceFromTail: 0, turnAgeMs: 0 }), false)
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: 400, turnAgeMs: 0 }), false)
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: 0, turnAgeMs: CARD_REVEAL.maxTurnAgeMs + 1 }), false)
})

test('shouldRevealCard is defensive about its input', () => {
  assert.equal(shouldRevealCard(null), false)
  assert.equal(shouldRevealCard(undefined), false)
  assert.equal(shouldRevealCard({ reducedMotion: false, distanceFromTail: Number.NaN, turnAgeMs: 0 }), false)
  assert.equal(shouldRevealCard({ reducedMotion: false, turnAgeMs: 0 }), false)
})
