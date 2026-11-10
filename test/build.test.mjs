import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const clientPath = join(pluginRoot, 'client.js')

test('client.js is up to date with src/ and lib/', () => {
  execFileSync(process.execPath, ['scripts/build-client.mjs', '--check'], {
    cwd: pluginRoot,
    stdio: 'pipe',
  })
})

test('client.js is a single-file bundle with the package id', () => {
  const source = readFileSync(clientPath, 'utf8')
  assert.match(source, /__ModuleLoader__\.load\(/)
  assert.match(source, /'@local\/dsh-next-actions'/)
  assert.doesNotMatch(source, /@inline:/)
})

test('client.js carries the inlined data layer and definition', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['modelFromArgs', 'parseMeta', 'buildDisplay', 'nextStepsDefinition']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('client.js carries the one-line process row', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['ProcessRow', 'DisclosureRow', 'dshns-disc-row', 'dshns-row-reason', 'dshns-row-inspect']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('card keeps hover geometry-neutral with a status-row peek', () => {
  const source = readFileSync(clientPath, 'utf8')
  // Hover/focus must only swap text inside the existing status row. No preview
  // block may be inserted, so moving the pointer cannot resize the card.
  for (const symbol of ['dshns-status-peek', 'peekText', 'preview.label', 'setPeek(']) {
    assert.ok(source.includes(symbol), `expected client.js to include ${symbol}`)
  }
  assert.equal(source.includes('dshns-preview'), false)
  assert.equal(source.includes('derivePreviewText'), false)
  assert.equal(source.includes('preview !== null'), false)
  assert.ok(source.includes("'uiConversation'"))
  for (const symbol of ['deriveCardView', 'deriveActiveFill', 'deriveChipMarker']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('long text uses measured clamps and explicit expand controls', () => {
  const source = readFileSync(clientPath, 'utf8')
  // Context uses a two-line clamp measured through the DOM; conflict target and
  // draft get a click-only expand control. Both avoid hover-driven layout.
  for (const symbol of [
    'dshns-text-clamped',
    'ResizeObserver',
    'scrollHeight',
    'clientHeight',
    'ConflictCompare',
    'dshns-conflict-toggle',
    'conflict.expand',
    'conflict.collapse',
    'dshns-conflict-compare[data-expanded]',
  ]) {
    assert.ok(source.includes(symbol), `expected client.js to include ${symbol}`)
  }
})

test('card wires the draft-derived state and conflict compare UI', () => {
  const source = readFileSync(clientPath, 'utf8')
  // The view derivation is the single source of the filled/danger markers and
  // the status line; the conflict block must keep the target and the draft.
  assert.match(source, /deriveCardView\(\{/)
  assert.match(source, /deriveChipMarker\(\{ suggestion, filledId: view\.filledId \}\)/)
  assert.match(source, /mergeDraft\(\{ mode: choice, draft, prompt: conflict\.prompt \}\)/)
  assert.match(source, /applyFill\(merged, conflict, choice === 'replace'\)/)
  for (const symbol of ['dshns-conflict-compare', 'dshns-conflict-label', 'dshns-conflict-toggle', 'conflict.compareTarget', 'conflict.compareDraft', 'conflict.appendPrimary', 'conflict.expand']) {
    assert.ok(source.includes(symbol), `expected client.js to include ${symbol}`)
  }
})

test('clicking a suggestion only fills: no send mode and no submit path', () => {
  const source = readFileSync(clientPath, 'utf8')
  assert.equal(source.includes('clickMode'), false)
  assert.equal(source.includes('shouldAutoSubmit'), false)
  assert.equal(source.includes("'status.sent'"), false)
  assert.equal(source.includes('inputActions.submit'), false)
})

test('chips use one inline marker instead of tag pills', () => {
  const source = readFileSync(clientPath, 'utf8')
  assert.ok(source.includes('dshns-marker'))
  assert.ok(source.includes('dshns-marker-danger'))
  assert.ok(source.includes('dshns-warn'))
  assert.equal(source.includes('dshns-tag'), false)
  assert.equal(source.includes("'chip.optional'"), false)
})

test('conflict actions share the status row to keep the card compact', () => {
  const source = readFileSync(clientPath, 'utf8')
  // The conflict state must stay close to the resting card height: status text
  // and the three actions share one row, and no separate actions row exists.
  assert.match(source, /dshns-statusbar-conflict/)
  assert.match(source, /const conflictActions = mode === 'conflict'/)
  assert.equal(source.includes('dshns-conflict-actions'), false)
})

test('card reveals a live turn-tail mount instead of inserting it in one frame', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['dshns-reveal', 'shouldRevealCard', 'CARD_REVEAL', 'REVEAL_INITIAL_STYLE', 'data-revealing']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('card toggles dismiss/restore from the status row (minus and plus, no footer)', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['dshns-statusbar', 'dshns-dismiss', 'dshns-restore', 'MinusIcon', 'PlusIcon', 'card.restore']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
  assert.equal(source.includes('dshns-footer'), false)
})

test('client.js carries the settings section', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['SettingsSection', 'dshns-setting-note', 'dshns-segmented', 'settings.section', 'settings.hostGate', 'readSettingsFrom', 'settings.note']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('settings no longer render a client-side enabled switch', () => {
  const source = readFileSync(clientPath, 'utf8')
  assert.equal(source.includes('settings.enabled'), false)
  assert.equal(source.includes('dshns-switch'), false)
  assert.equal(source.includes("row('enabled'"), false)
})

test('client.js carries the official-copy TextShimmer', () => {
  const source = readFileSync(clientPath, 'utf8')
  for (const symbol of ['TextShimmer', 'ShimmerText', 'dshns-shimmer-sweep', 'dshns-row-shimmer-sweep']) {
    assert.ok(source.includes(symbol), `expected client.js to inline ${symbol}`)
  }
})

test('client.js loads as a classic script and registers a lazy factory', () => {
  let loaded
  const windowStub = { __ModuleLoader__: { load: (bundle) => { loaded = bundle } } }
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(clientPath, 'utf8'))(windowStub)
  assert.equal(loaded.id, '@local/dsh-next-actions')
  const module = loaded.factory(() => ({
    createElement: () => null,
    createContext: () => ({ Provider: ({ children }) => children }),
    useContext: () => undefined,
    memo: (component) => component,
    useCallback: (callback) => callback,
    useId: () => 'test-id',
    useMemo: (factory) => factory(),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }))
  assert.deepEqual(module.inject, ['slots', 'locale', 'uiConversation'])
  assert.equal(typeof module.apply, 'function')
})
