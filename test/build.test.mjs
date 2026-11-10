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

test('card keeps a fixed preview slot and injects the conversation service', () => {
  const source = readFileSync(clientPath, 'utf8')
  assert.ok(source.includes('dshns-preview'))
  assert.ok(source.includes("'uiConversation'"))
  assert.ok(source.includes('defaultPreview'))
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
  for (const symbol of ['SettingsSection', 'dshns-setting-note', 'dshns-segmented', 'settings.section', 'settings.hostGate', 'readSettingsFrom', 'clickMode', 'status.sent']) {
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
