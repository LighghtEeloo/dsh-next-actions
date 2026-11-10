/**
 * State-combination tests for the turn-tail card's view derivation.
 *
 * The React component composes these pure helpers on every render; testing the
 * combinations here catches the cross-state bugs that single-function tests
 * miss (edit/clear vs persisted fill, danger after reload, preview ownership,
 * one-marker-per-chip, conflict merging). No DOM or React needed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveActiveFill,
  deriveCardView,
  deriveChipMarker,
  derivePreviewText,
} from '../lib/view-model.js'

const suggestions = [
  { id: 'sa', label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify', recommended: true },
  { id: 'sb', label: '补一个回归用例', prompt: '补一个回归用例，覆盖刚才修复的边界。', stance: 'continue' },
  { id: 'sc', label: '强推当前分支', prompt: '强制推送到 origin/main，覆盖远端历史。', stance: 'push', danger: true },
]

const byId = (id) => suggestions.find((suggestion) => suggestion.id === id)
const appliedFor = (id, overrides = {}) => {
  const suggestion = byId(id)
  return {
    id: suggestion.id,
    text: suggestion.prompt,
    prompt: suggestion.prompt,
    danger: suggestion.danger === true,
    owned: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// deriveActiveFill — the draft is authoritative
// ---------------------------------------------------------------------------

test('deriveActiveFill marks the fill only while the draft is still what the card wrote', () => {
  const picked = appliedFor('sb')
  assert.deepEqual(
    deriveActiveFill({ suggestions, draft: picked.text, persistedId: null, applied: picked }),
    { id: 'sb', prompt: picked.prompt, danger: false, text: picked.text },
  )
  assert.equal(
    deriveActiveFill({ suggestions, draft: `${picked.text} 再改一下`, persistedId: null, applied: picked }),
    null,
    'an edited draft must not keep reporting filled',
  )
  assert.equal(
    deriveActiveFill({ suggestions, draft: '', persistedId: null, applied: picked }),
    null,
    'a cleared draft must not keep reporting filled',
  )
  assert.equal(deriveActiveFill({ suggestions, draft: picked.text, persistedId: null, applied: null }), null)
})

test('deriveActiveFill restores a persisted fill only when the draft equals the suggestion prompt', () => {
  assert.deepEqual(
    deriveActiveFill({ suggestions, draft: byId('sb').prompt, persistedId: 'sb', applied: null }),
    { id: 'sb', prompt: byId('sb').prompt, danger: false, text: byId('sb').prompt },
  )
  assert.equal(deriveActiveFill({ suggestions, draft: '', persistedId: 'sb', applied: null }), null)
  assert.equal(deriveActiveFill({ suggestions, draft: 'user text', persistedId: 'sb', applied: null }), null)
  assert.equal(deriveActiveFill({ suggestions, draft: byId('sb').prompt, persistedId: 'missing', applied: null }), null)
})

test('deriveActiveFill keeps the danger flag when a dangerous fill is restored after reload', () => {
  const active = deriveActiveFill({
    suggestions,
    draft: byId('sc').prompt,
    persistedId: 'sc',
    applied: null,
  })
  assert.deepEqual(active, { id: 'sc', prompt: byId('sc').prompt, danger: true, text: byId('sc').prompt })
  // After an edit the stale id no longer proves anything, so danger must go too.
  assert.equal(deriveActiveFill({ suggestions, draft: 'edited', persistedId: 'sc', applied: null }), null)
})

test('deriveActiveFill accepts an appended draft as written text but not as the raw prompt', () => {
  const merged = `用户草稿\n\n${byId('sc').prompt}`
  const applied = appliedFor('sc', { text: merged, owned: false })
  assert.equal(deriveActiveFill({ suggestions, draft: merged, persistedId: 'sc', applied }).id, 'sc')
  // A restored id cannot reconstruct the user prefix, so refresh must not
  // claim the dangerous prompt is the whole draft.
  assert.equal(deriveActiveFill({ suggestions, draft: merged, persistedId: 'sc', applied: null }), null)
})

// ---------------------------------------------------------------------------
// deriveCardView — status and preview combinations
// ---------------------------------------------------------------------------

test('deriveCardView hides the filled marker after edit, clear and reload', () => {
  const picked = appliedFor('sb')
  const edited = deriveCardView({ suggestions, draft: `${picked.text} 再改一下`, applied: picked })
  assert.equal(edited.filledId, null)
  assert.equal(edited.statusKey, null)
  assert.equal(edited.previewText, picked.prompt, 'the preview keeps the picked prompt, not the recommendation')

  const reloaded = deriveCardView({ suggestions, draft: '', persistedId: 'sb', applied: null })
  assert.equal(reloaded.filledId, null)
  assert.equal(reloaded.statusKey, null)

  const restored = deriveCardView({ suggestions, draft: byId('sb').prompt, persistedId: 'sb', applied: null })
  assert.equal(restored.filledId, 'sb')
  assert.equal(restored.statusKey, 'status.filled')
})

test('deriveCardView follows the status priority dismissed > conflict > filled', () => {
  const safeFill = { draft: byId('sa').prompt, applied: appliedFor('sa') }
  const dangerFill = { draft: byId('sc').prompt, applied: appliedFor('sc') }
  const cases = [
    [{ dismissed: true, conflict: true, ...safeFill }, 'status.dismissed'],
    [{ conflict: true, ...safeFill }, 'status.conflict'],
    [safeFill, 'status.filled'],
    [dangerFill, 'status.danger'],
    [{}, null],
  ]
  for (const [state, expected] of cases) {
    assert.equal(deriveCardView({ suggestions, ...state }).statusKey, expected)
  }
})

test('deriveCardView only reports danger while the dangerous fill is active', () => {
  assert.equal(
    deriveCardView({ suggestions, draft: byId('sc').prompt, applied: appliedFor('sc') }).statusKey,
    'status.danger',
  )
  assert.equal(
    deriveCardView({ suggestions, draft: `${byId('sc').prompt} 但先别发`, applied: appliedFor('sc') }).statusKey,
    null,
  )
  assert.equal(
    deriveCardView({ suggestions, draft: '', persistedId: 'sc', applied: null }).statusKey,
    null,
  )
})

test('deriveCardView keeps the preview on the last picked suggestion after edits', () => {
  const picked = appliedFor('sb')

  // Hover/focus wins while it is active.
  assert.equal(
    deriveCardView({ suggestions, draft: picked.text, applied: picked, preview: 'h' }).previewText,
    'h',
  )
  // Picked non-recommended beat the recommended default, even after the draft
  // no longer matches (the old bug snapped back to `sa`).
  assert.equal(
    deriveCardView({ suggestions, draft: 'edited', applied: picked }).previewText,
    byId('sb').prompt,
  )
  // Nothing picked yet: the recommended item is the resting preview.
  assert.equal(deriveCardView({ suggestions, draft: '' }).previewText, byId('sa').prompt)
  // Restored state still prefers the restored suggestion over the recommendation.
  assert.equal(
    deriveCardView({ suggestions, draft: '', persistedId: 'sb', applied: null }).previewText,
    byId('sb').prompt,
  )
  // A stale/unknown id falls back to the recommendation.
  assert.equal(
    deriveCardView({ suggestions, draft: '', persistedId: 'gone', applied: null }).previewText,
    byId('sa').prompt,
  )
})

test('deriveCardView reports an unavailable composer independently of the remembered fill', () => {
  const view = deriveCardView({
    suggestions,
    draft: byId('sa').prompt,
    applied: appliedFor('sa'),
    canWrite: false,
  })
  assert.equal(view.statusKey, 'status.unavailable')
  assert.equal(view.filledId, 'sa')
})

test('deriveCardView maps conflict resolution to a filled/danger marker', () => {
  const merged = `用户草稿\n\n${byId('sc').prompt}`
  const view = deriveCardView({
    suggestions,
    draft: merged,
    applied: appliedFor('sc', { text: merged, owned: false }),
  })
  assert.equal(view.filledId, 'sc')
  assert.equal(view.statusKey, 'status.danger')
  assert.equal(view.previewText, byId('sc').prompt)
})

// ---------------------------------------------------------------------------
// derivePreviewText / deriveChipMarker
// ---------------------------------------------------------------------------

test('derivePreviewText falls back from hover to picked to recommended to first', () => {
  assert.equal(derivePreviewText({ suggestions, preview: 'hover', pickedPrompt: 'picked' }), 'hover')
  assert.equal(derivePreviewText({ suggestions, preview: null, pickedPrompt: 'picked' }), 'picked')
  assert.equal(derivePreviewText({ suggestions, preview: '' }), byId('sa').prompt)
  assert.equal(derivePreviewText({ suggestions: [{ id: 'x', prompt: 'only' }] }), 'only')
  assert.equal(derivePreviewText({ suggestions: [] }), '')
})

test('deriveChipMarker keeps exactly one marker and lets danger win', () => {
  assert.equal(deriveChipMarker({ suggestion: byId('sc'), filledId: 'sc' }), 'danger')
  assert.equal(deriveChipMarker({ suggestion: byId('sb'), filledId: 'sb' }), 'filled')
  assert.equal(deriveChipMarker({ suggestion: byId('sa'), filledId: null }), 'recommended')
  assert.equal(deriveChipMarker({ suggestion: byId('sb'), filledId: null }), null)
  // Optional stance is ordering metadata, not a chip marker.
  assert.equal(
    deriveChipMarker({ suggestion: { id: 'so', stance: 'optional', prompt: 'p' }, filledId: null }),
    null,
  )
  assert.equal(deriveChipMarker({}), null)
  assert.equal(deriveChipMarker({ suggestion: null, filledId: 'x' }), null)
})
