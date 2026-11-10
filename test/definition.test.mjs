import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const BUNDLE_PATH = new URL('../client.js', import.meta.url)

/** Load the built browser bundle with a stubbed module loader. */
function loadBundle() {
  let loaded
  const windowStub = {
    __ModuleLoader__: {
      load: (bundle) => {
        loaded = bundle
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(BUNDLE_PATH, 'utf8'))(windowStub)
  if (loaded === undefined) throw new Error('bundle did not register itself')
  const react = {
    createElement: () => null,
    createContext: () => ({ Provider: ({ children }) => children }),
    useContext: () => undefined,
    memo: (component) => component,
    useCallback: (callback) => callback,
    useId: () => 'test-id',
    useMemo: (factory) => factory(),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  return loaded.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require(${name})`)
  })
}

const moduleUnderTest = loadBundle()
const definition = moduleUnderTest.__test.nextStepsDefinition

const TOOL = 'suggest_next_steps'
const context = '修复已完成，改动集中在 src/api。'

const args = (overrides = {}) => ({
  context,
  suggestions: [
    { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
    { label: '加回归用例', prompt: '补一条针对边界值的回归用例。', stance: 'continue' },
  ],
  ...overrides,
})

const startEvent = (turn = 1) => ({ type: 'turn/start', data: { turn } })

const callEvent = ({ turn = 1, callId = 'c1', name = TOOL, payload = args(), seq = 10 } = {}) => ({
  type: 'tool/call',
  seq,
  data: { turn, callId, name, arguments: JSON.stringify(payload) },
})

const resultEvent = ({
  turn = 1,
  callId = 'c1',
  meta,
  isError = false,
  seq = 20,
  surfaceOp = 'append',
  content = [],
} = {}) => ({
  type: 'tool/result',
  seq,
  surfaceOp,
  data: { turn, message: { isError, source: { callId }, content }, meta },
})

function fold(events) {
  const [first, ...rest] = events
  let state = definition.start({}, { event: first })
  for (const event of rest) state = definition.update({ state }, { event })
  return state
}

// ---------------------------------------------------------------------------
// Bundle and registration surface
// ---------------------------------------------------------------------------

test('bundle registers under the package name', () => {
  let loaded
  const windowStub = { __ModuleLoader__: { load: (bundle) => { loaded = bundle } } }
  new Function('window', readFileSync(BUNDLE_PATH, 'utf8'))(windowStub)
  assert.equal(loaded.id, '@local/dsh-next-actions')
})

test('module exports the service injection and apply', () => {
  assert.deepEqual(moduleUnderTest.inject, ['slots', 'locale', 'uiConversation'])
  assert.equal(typeof moduleUnderTest.apply, 'function')
})

test('module exposes the data-layer test seam', () => {
  assert.equal(typeof moduleUnderTest.__test.parseMeta, 'function')
  assert.equal(typeof moduleUnderTest.__test.modelFromArgs, 'function')
  assert.equal(typeof definition.start, 'function')
})

// ---------------------------------------------------------------------------
// Definition matcher
// ---------------------------------------------------------------------------

test('definition focuses turn-scoped events', () => {
  assert.equal(definition.kind, 'next-steps')
  assert.deepEqual(definition.match(startEvent()), { id: '1', role: 'start' })
  assert.deepEqual(definition.match(callEvent()), { id: '1', role: 'update' })
  assert.deepEqual(definition.match(resultEvent({ surfaceOp: 'append' })), { id: '1', role: 'update' })
})

test('definition ignores other tools, non-surface results and unrelated events', () => {
  assert.equal(definition.match(callEvent({ name: 'some_other_tool' })), null)
  assert.equal(definition.match(resultEvent({ surfaceOp: null })), null)
  assert.equal(definition.match({ type: 'assistant/message', data: {} }), null)
})

// ---------------------------------------------------------------------------
// Folding: durable meta first, arguments as fallback
// ---------------------------------------------------------------------------

const hostMeta = () => ({
  shown: true,
  context,
  suggestions: [
    { id: 'sa', label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
    { id: 'sb', label: '加回归用例', prompt: '补一条回归用例。', stance: 'continue', recommended: true },
  ],
})

test('folding a durable meta publishes the turn model', () => {
  const state = fold([startEvent(3), callEvent({ turn: 3 }), resultEvent({ meta: hostMeta() })])
  assert.equal(state.turn, 3)
  assert.equal(state.model.shown, true)
  assert.equal(state.model.context, context)
  assert.equal(state.model.suggestions[0].id, 'sb')
})

test('folding falls back to the call arguments when meta is missing', () => {
  const state = fold([startEvent(), callEvent(), resultEvent({ meta: undefined })])
  assert.equal(state.model.shown, true)
  assert.equal(state.model.suggestions.length, 2)
})

test('an authoritative shown:false meta suppresses the args fallback', () => {
  const state = fold([
    startEvent(),
    callEvent(),
    resultEvent({ meta: { shown: false, note: 'no-usable-suggestions' } }),
  ])
  assert.equal(state.model, null)
})

test('an errored tool result never produces a model', () => {
  const state = fold([startEvent(), callEvent(), resultEvent({ meta: hostMeta(), isError: true })])
  assert.equal(state.model, null)
})

test('a result for an unrelated call id is ignored', () => {
  const state = fold([startEvent(), callEvent({ callId: 'c1' }), resultEvent({ callId: 'c2', meta: hostMeta() })])
  assert.equal(state.model, null)
})

test('a non-append surface result is not folded', () => {
  const state = fold([startEvent(), callEvent(), resultEvent({ surfaceOp: 'replace' })])
  assert.equal(state.model, null)
})

test('a JSON-string meta is accepted', () => {
  const state = fold([startEvent(), callEvent(), resultEvent({ meta: JSON.stringify(hostMeta()) })])
  assert.equal(state.model.shown, true)
})

test('a new turn resets calls and the published model', () => {
  const first = fold([startEvent(1), callEvent({ turn: 1 }), resultEvent({ meta: hostMeta() })])
  assert.equal(first.model.shown, true)
  const next = definition.start({}, { event: startEvent(2) })
  assert.equal(next.turn, 2)
  assert.equal(next.model, null)
  assert.equal(next.calls.size, 0)
})

test('the latest result wins inside one turn', () => {
  const state = fold([
    startEvent(),
    callEvent({ callId: 'c1' }),
    resultEvent({ callId: 'c1', meta: hostMeta() }),
    callEvent({ callId: 'c2', payload: args({ context: '新的上下文。' }) }),
    resultEvent({ callId: 'c2', meta: undefined }),
  ])
  assert.equal(state.model.context, '新的上下文。')
})

// ---------------------------------------------------------------------------
// Turn location data
// ---------------------------------------------------------------------------

test('buildLocationData publishes the turn model', () => {
  const state = fold([startEvent(4), callEvent({ turn: 4 }), resultEvent({ meta: hostMeta() })])
  const location = definition.buildLocationData({ state }, 'turn')
  assert.equal(location.kind, 'turn')
  assert.equal(location.turn, 4)
  assert.equal(location.key, 'next-steps')
  assert.equal(location.value.turn, 4)
  assert.equal(location.value.model.shown, true)
})

test('buildLocationData stays empty outside turn scope or without a model', () => {
  const state = fold([startEvent(4)])
  assert.equal(definition.buildLocationData({ state }, 'turn'), null)
  assert.equal(definition.buildLocationData({ state }, 'session'), null)
  const withModel = fold([startEvent(4), callEvent({ turn: 4 }), resultEvent({ meta: hostMeta() })])
  assert.equal(definition.buildLocationData({ state: withModel }, 'session'), null)
})
