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

const RUN_CODE = 'run_code'

// Shapes captured from a real DSH 0.2.2-rc.1 PTC session log:
//   tool/ptc-dispatch-start: {rootCallId, parentCallId, subCallId, name, arguments(object)}
//   tool/ptc-dispatch:       the above + {isError, content} and meta when the Host
//                            produced a display model
// Neither record carries turn/step; only the outer run_code tool/call owns the turn.

const turnLocation = (turn) => ({ kind: 'turn', turn: { turn } })
const matchOf = (event, location) => (location === undefined ? { event } : { event, location })

const runCodeCallEvent = ({ turn = 1, callId = 'run-ptc', seq = 5 } = {}) => ({
  type: 'tool/call',
  seq,
  data: { turn, callId, name: RUN_CODE, arguments: '{"code":"return await tools.suggest_next_steps(...)"}' },
})

const ptcStartEvent = ({
  rootCallId = 'run-ptc',
  subCallId = `${rootCallId}:ptc:1`,
  name = TOOL,
  payload = args(),
  seq = 10,
} = {}) => ({
  type: 'tool/ptc-dispatch-start',
  seq,
  data: { rootCallId, parentCallId: rootCallId, subCallId, name, arguments: payload },
})

const ptcResultEvent = ({
  rootCallId = 'run-ptc',
  subCallId = `${rootCallId}:ptc:1`,
  name = TOOL,
  payload = args(),
  meta,
  isError = false,
  seq = 20,
} = {}) => ({
  type: 'tool/ptc-dispatch',
  seq,
  data: {
    rootCallId,
    parentCallId: rootCallId,
    subCallId,
    name,
    arguments: payload,
    isError,
    content: [],
    ...(meta === undefined ? {} : { meta }),
  },
})

/** Framework Match objects: dispatch records carry the turn only through the resolved location. */
function ptcMatches({ turn = 1, callId = 'run-ptc', meta, payload = args(), isError = false } = {}) {
  return [
    matchOf(ptcStartEvent({ rootCallId: callId, payload }), turnLocation(turn)),
    matchOf(ptcResultEvent({ rootCallId: callId, payload, meta, isError }), turnLocation(turn)),
  ]
}

function foldMatches(matches) {
  const [first, ...rest] = matches
  let state = definition.start({}, first)
  for (const match of rest) state = definition.update({ state }, match)
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

test('definition matches PTC dispatch events for this tool', () => {
  assert.equal(definition.match(runCodeCallEvent({ callId: 'run-ptc-match' })), null)
  assert.deepEqual(definition.match(ptcStartEvent({ rootCallId: 'run-ptc-match' })), { id: '1', role: 'start' })
  assert.deepEqual(definition.match(ptcResultEvent({ rootCallId: 'run-ptc-match' })), { id: '1', role: 'update' })
})

test('PTC dispatch turn comes from its own run_code call', () => {
  definition.match(runCodeCallEvent({ turn: 2, callId: 'run-ptc-turn2' }))
  assert.deepEqual(definition.match(ptcStartEvent({ rootCallId: 'run-ptc-turn2' })), { id: '2', role: 'start' })
})

test('definition ignores PTC dispatches without a known run_code call or for other tools', () => {
  assert.equal(definition.match(ptcStartEvent({ rootCallId: 'run-ptc-unknown' })), null)
  assert.equal(definition.match(ptcResultEvent({ rootCallId: 'run-ptc-unknown' })), null)
  definition.match(runCodeCallEvent({ callId: 'run-ptc-other' }))
  assert.equal(definition.match(ptcStartEvent({ rootCallId: 'run-ptc-other', name: 'read' })), null)
  assert.equal(definition.match(ptcResultEvent({ rootCallId: 'run-ptc-other', name: 'read' })), null)
})

test('PTC dispatch start records the object arguments and reads the turn from the match location', () => {
  definition.match(runCodeCallEvent({ turn: 7, callId: 'run-ptc-loc' }))
  const state = definition.start({}, matchOf(ptcStartEvent({ rootCallId: 'run-ptc-loc' }), turnLocation(7)))
  assert.equal(state.turn, 7)
  assert.equal(state.calls.size, 1)
  assert.equal(JSON.parse(state.calls.get('run-ptc-loc:ptc:1').argsRaw).context, context)
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
// PTC dispatch transport (run_code programs)
// ---------------------------------------------------------------------------

test('folding PTC dispatch records publishes the model from the dispatch meta', () => {
  const state = foldMatches(ptcMatches({ callId: 'run-ptc-meta', meta: hostMeta() }))
  assert.equal(state.turn, 1)
  assert.equal(state.model.shown, true)
  assert.equal(state.model.context, context)
  assert.equal(state.model.suggestions[0].id, 'sb')
})

test('PTC folding falls back to the dispatch arguments when meta is missing', () => {
  const state = foldMatches(ptcMatches({
    callId: 'run-ptc-args',
    payload: args({ context: 'PTC 上下文的兜底解析。' }),
  }))
  assert.equal(state.model.shown, true)
  assert.equal(state.model.context, 'PTC 上下文的兜底解析。')
  assert.equal(state.model.suggestions.length, 2)
})

test('an authoritative shown:false PTC meta suppresses the args fallback', () => {
  const state = foldMatches(ptcMatches({
    callId: 'run-ptc-hidden',
    meta: { shown: false, note: 'no-usable-suggestions' },
  }))
  assert.equal(state.model, null)
})

test('an errored PTC dispatch never produces a model', () => {
  const state = foldMatches(ptcMatches({
    callId: 'run-ptc-error',
    meta: hostMeta(),
    isError: true,
  }))
  assert.equal(state.model, null)
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

test('PTC events flow through the matcher into the same turn data contract', () => {
  const runCode = runCodeCallEvent({ turn: 5, callId: 'run-ptc-flow' })
  assert.equal(definition.match(runCode), null) // indexes the outer call only
  const start = ptcStartEvent({ rootCallId: 'run-ptc-flow' })
  const result = ptcResultEvent({ rootCallId: 'run-ptc-flow', meta: hostMeta() })
  assert.deepEqual(definition.match(start), { id: '5', role: 'start' })
  assert.deepEqual(definition.match(result), { id: '5', role: 'update' })
  let state = definition.start({}, matchOf(start, turnLocation(5)))
  state = definition.update({ state }, matchOf(result, turnLocation(5)))
  const location = definition.buildLocationData({ state }, 'turn')
  assert.equal(location.turn, 5)
  assert.equal(location.value.turn, 5)
  assert.equal(location.value.model.shown, true)
})

test('PTC folding publishes turn location data from the dispatch meta', () => {
  definition.match(runCodeCallEvent({ turn: 3, callId: 'run-ptc-location' }))
  const state = foldMatches(ptcMatches({ turn: 3, callId: 'run-ptc-location', meta: hostMeta() }))
  const location = definition.buildLocationData({ state }, 'turn')
  assert.equal(location.kind, 'turn')
  assert.equal(location.turn, 3)
  assert.equal(location.key, 'next-steps')
  assert.equal(location.value.turn, 3)
  assert.equal(location.value.model.shown, true)
})

test('buildLocationData tolerates a fold window without a start Match', () => {
  // A session page can begin mid-turn; never crash the whole Conversation fold.
  assert.equal(definition.buildLocationData({ state: undefined }, 'turn'), null)
})
