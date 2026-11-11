import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const TOOL = 'suggest_next_actions'

/** Load the built bundle with a stub module loader and a tree-building React stub. */
function loadBundle() {
  let bundle
  new Function('window', readFileSync(new URL('../client.js', import.meta.url), 'utf8'))({
    __ModuleLoader__: { load: (value) => { bundle = value } },
  })
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useRef: (current) => ({ current }),
  }
  return bundle.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require(${name})`)
  })
}

const plugin = loadBundle()
const { definition, modelOf, fillMode, fill, rowState, usageOf, usagesOf, nextSent } = plugin.__test

const args = {
  context: '修复已完成。',
  suggestions: [
    { label: '跑测试', prompt: '跑一下测试。' },
    { label: '推送', prompt: 'git push --force' },
  ],
}
const meta = { shown: true, context: '修复已完成。', suggestions: [{ label: '跑测试', prompt: '跑一下测试。' }] }

function fold(events) {
  const matches = events.map((event) => (event.event ? event : { event }))
  let state = definition.start({}, matches[0])
  for (const match of matches.slice(1)) state = definition.update({ state }, match)
  return state
}

const call = (turn = 1, payload = args) => ({ type: 'tool/call', data: { turn, callId: 'c1', name: TOOL, arguments: JSON.stringify(payload) } })
const result = (turn = 1, extra = {}) => ({
  type: 'tool/result',
  surfaceOp: 'append',
  data: { turn, message: { isError: false, source: { callId: 'c1' } }, ...extra },
})

test('built client.js is up to date', () => {
  execFileSync(process.execPath, ['scripts/build-client.mjs', '--check'], { cwd: new URL('..', import.meta.url) })
})

test('native call + result folds the persisted meta into turn data', () => {
  const state = fold([{ type: 'turn/start', data: { turn: 1 } }, call(), result(1, { meta })])
  assert.deepEqual(state.model, meta)
  const location = definition.buildLocationData({ state }, 'turn', undefined)
  assert.deepEqual(location, { kind: 'turn', turn: 1, key: 'next-actions', value: { model: meta, sent: '' } })
  assert.equal(definition.buildLocationData({ state }, 'turn', location), location)
  assert.equal(definition.buildLocationData({ state }, 'session', undefined), null)
})

test('missing meta falls back to the call arguments; a not-shown meta is authoritative', () => {
  assert.equal(fold([{ type: 'turn/start', data: { turn: 1 } }, call(), result()]).model.suggestions.length, 2)
  assert.equal(fold([{ type: 'turn/start', data: { turn: 1 } }, call(), result(1, { meta: { shown: false, note: 'x' } })]).model, null)
  assert.equal(modelOf({ shown: true, context: '', suggestions: [] }, args), null)
})

test('errors, replacement results and unknown calls never publish a card', () => {
  const start = { type: 'turn/start', data: { turn: 1 } }
  const error = { ...result(1, { meta }), data: { turn: 1, meta, message: { isError: true, source: { callId: 'c1' } } } }
  assert.equal(fold([start, call(), error]).model, null)
  assert.equal(fold([start, result(1, { meta })]).model, null)
  assert.equal(definition.match({ ...result(1), surfaceOp: 'replace' }), null)
  assert.equal(definition.match({ type: 'tool/call', data: { turn: 1, name: 'other' } }), null)
})

test('PTC dispatch resolves its turn through the outer run_code call', () => {
  const ptc = (type, extra = {}) => ({ type, data: { rootCallId: 'run-1', subCallId: 'run-1:1', name: TOOL, arguments: args, ...extra } })
  assert.equal(definition.match(ptc('tool/ptc-dispatch')), null)
  assert.equal(definition.match({ type: 'tool/call', data: { turn: 4, callId: 'run-1', name: 'run_code', arguments: '{}' } }), null)
  assert.deepEqual(definition.match(ptc('tool/ptc-dispatch-start')), { id: '4', role: 'start' })
  assert.deepEqual(definition.match(ptc('tool/ptc-dispatch', { meta })), { id: '4', role: 'update' })

  const location = { kind: 'turn', turn: { turn: 4 } }
  const state = fold([{ event: ptc('tool/ptc-dispatch-start'), location }, { event: ptc('tool/ptc-dispatch', { meta }), location }])
  assert.equal(state.turn, 4)
  assert.deepEqual(state.model, meta)
  assert.equal(fold([{ event: ptc('tool/ptc-dispatch-start'), location }, { event: ptc('tool/ptc-dispatch', { isError: true }), location }]).model, null)
})

test('fillMode replaces empty or card-owned drafts and inserts otherwise', () => {
  assert.equal(fillMode('', null), 'replace')
  assert.equal(fillMode('  \n', null), 'replace')
  assert.equal(fillMode('跑一下测试。', '跑一下测试。'), 'replace')
  assert.equal(fillMode('我自己写的', null), 'insert')
  assert.equal(fillMode('跑一下测试。 改过', '跑一下测试。'), 'insert')
})

function actions({ insert = true } = {}) {
  const calls = []
  return {
    calls,
    setDraft: (text) => calls.push(['setDraft', text]),
    captureInsertion: () => ({ start: 3, end: 3, draftRev: 7 }),
    insertText: (text, span) => {
      calls.push(['insertText', text, span])
      return insert
    },
  }
}

test('fill replaces with setDraft and owns the text', () => {
  const input = actions()
  assert.equal(fill(input, '', null, '跑一下测试。', 's'), '跑一下测试。')
  assert.deepEqual(input.calls, [['setDraft', '跑一下测试。']])
})

test('fill inserts at the caret as one editor edit, keeping the user draft', () => {
  const input = actions()
  assert.equal(fill(input, '我的草稿', null, '跑一下测试。', 's'), null)
  assert.deepEqual(input.calls, [['insertText', '\n\n跑一下测试。', { start: 3, end: 3, draftRev: 7 }]])
})

test('fill appends with setDraft when the editor refuses or lacks insertText', () => {
  const refused = actions({ insert: false })
  fill(refused, '我的草稿  ', null, '跑一下测试。', 's')
  assert.deepEqual(refused.calls.at(-1), ['setDraft', '我的草稿\n\n跑一下测试。'])
  const legacy = { calls: [], setDraft(text) { this.calls.push(text) } }
  fill(legacy, '我的草稿', null, '跑一下测试。', 's')
  assert.deepEqual(legacy.calls, ['我的草稿\n\n跑一下测试。'])
})

function renderCard({ sent = '', end = true, closing = true, subagent = false, model = buildModel(), inputActions = actions(), draft = '' } = {}) {
  const Card = cardComponent()
  const data = new Map([['next-actions', { model }], ['turn-tail', { closing: closing ? {} : undefined }]])
  return Card({
    turn: { turn: 1, end: end ? {} : undefined, data },
    inputActions,
    useInput: (select) => select({ draft }),
    useChat: (select) => select({
      timeline: { turnOrder: [1, 2], turns: new Map([[2, { data: new Map([['next-actions', { model: null, sent }]]) }]]) },
    }),
    useSession: (select) => select({ subagent }),
    sessionId: 's',
    t: (key) => ({ 'card.title': '下一步建议', 'chip.recommended': '推荐', 'chip.danger': '需确认', 'chip.sent': '已发送', 'chip.edited': '改后发送' })[key] ?? key,
  })
}

function buildModel() {
  return modelOf(undefined, args)
}

let Card
function cardComponent() {
  if (Card !== undefined) return Card
  const slots = []
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {} },
    uiConversation: { events: { register: () => () => {} } },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => slots.push({ options, component }) },
  }
  globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } }
  plugin.apply(ctx)
  delete globalThis.document
  Card = slots.find((slot) => slot.options.name === 'conversation.chat.turnTail').component
  return Card
}

const find = (node, predicate, found = []) => {
  if (node === null || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) find(child, predicate, found)
  return found
}

test('card renders context and one chip per suggestion on an ended turn', () => {
  const tree = renderCard()
  assert.equal(tree.children[0].props['aria-label'], '下一步建议')
  const chips = find(tree, (node) => node.props?.className === 'dshns-chip')
  assert.equal(chips.length, 2)
  assert.equal(chips[0].props.title, '跑一下测试。')
  assert.equal(chips[0].props['aria-label'], '跑测试：跑一下测试。')
  assert.equal(chips[1].props['aria-label'], '推送（需确认）：git push --force')
  assert.equal(chips[0].props.disabled, false)
})

test('card is hidden for unfinished turns, subagents and missing models', () => {
  assert.equal(renderCard({ end: false }), null)
  assert.equal(renderCard({ closing: false }), null)
  assert.equal(renderCard({ subagent: true }), null)
  assert.equal(renderCard({ model: null }), null)
})

test('chips are disabled without input actions and a click fills the draft', () => {
  const disabled = find(renderCard({ inputActions: null }), (node) => node.props?.className === 'dshns-chip')
  assert.equal(disabled[0].props.disabled, true)
  const input = actions()
  const chips = find(renderCard({ inputActions: input }), (node) => node.props?.className === 'dshns-chip')
  chips[0].props.onClick()
  assert.deepEqual(input.calls, [['setDraft', '跑一下测试。']])
})

const chipsOf = (tree) => find(tree, (node) => node.props?.className === 'dshns-chip')

test('a recommended chip is marked and leads the card', () => {
  const model = modelOf(undefined, { context: 'c', suggestions: [{ label: 'A', prompt: 'a' }, { label: 'B', prompt: 'b', recommended: true }] })
  const chips = chipsOf(renderCard({ model }))
  assert.equal(chips[0].props['data-recommended'], '')
  assert.equal(chips[0].props['aria-label'], 'B（推荐）：b')
  assert.equal(chips[1].props['data-recommended'], undefined)
})

test('user messages fold into their turn as the sent text', () => {
  const user = (text, kind = 'user', surfaceOp = 'append') => ({ type: 'user/message', surfaceOp, data: { id: text, content: [{ type: 'text', text }], source: { kind } } })
  assert.deepEqual(definition.match({ type: 'turn/start', data: { turn: 2 } }), { id: '2', role: 'start' })
  assert.deepEqual(definition.match(user('a')), { id: '2', role: 'update' })
  assert.equal(definition.match(user('a', 'inject')), null)
  assert.equal(definition.match(user('a', 'user', 'replace')), null)

  const state = fold([{ type: 'turn/start', data: { turn: 2 } }, user('跑一下测试。'), user('另外看下日志')])
  assert.equal(state.sent, '跑一下测试。\n另外看下日志')
  assert.deepEqual(definition.buildLocationData({ state }, 'turn', undefined).value, { model: null, sent: '跑一下测试。\n另外看下日志' })
  assert.equal(definition.buildLocationData({ state: fold([{ type: 'turn/start', data: { turn: 2 } }]) }, 'turn', undefined), null)
})

test('nextSent reads the following turn of the timeline', () => {
  const snapshot = { timeline: { turnOrder: [3, 5], turns: new Map([[5, { data: new Map([['next-actions', { sent: 'hi' }]]) }]]) } }
  assert.equal(nextSent(snapshot, 3), 'hi')
  assert.equal(nextSent(snapshot, 5), '')
  assert.equal(nextSent(snapshot, 4), '')
  assert.equal(nextSent(undefined, 3), '')
})

test('usageOf tells sent as-is, sent with edits, and unrelated apart', () => {
  const prompt = '跑一下测试，只跑 src/api 相关用例。'
  assert.equal(usageOf(prompt, `先说一句\n\n${prompt}`), 'full')
  assert.equal(usageOf(prompt, '跑一下测试，只跑src/api相关用例。'), 'full')
  assert.equal(usageOf(prompt, '跑一下测试，只跑 src/api 和 src/db 的相关用例'), 'partial')
  assert.equal(usageOf(prompt, '帮我写一份发布说明'), null)
  assert.equal(usageOf(prompt, ''), null)
  assert.equal(usageOf('ok', 'ok then'), 'full')
  assert.equal(usageOf('okay', 'kay'), null)
})

test('a full match hides partial marks; otherwise several partial marks may show', () => {
  const suggestions = [{ prompt: 'run the api tests' }, { prompt: 'run the db tests' }, { prompt: 'write docs' }]
  assert.deepEqual(usagesOf(suggestions, 'run the api tests'), ['full', null, null])
  assert.deepEqual(usagesOf(suggestions, 'run the tests'), ['partial', 'partial', null])
})

test('chips show a check for sent and a pencil for edited', () => {
  const full = chipsOf(renderCard({ sent: '跑一下测试。' }))
  assert.equal(full[0].props['data-used'], 'full')
  assert.equal(full[0].props['aria-label'], '跑测试（已发送）：跑一下测试。')
  assert.equal(full[0].children[0].type.name, 'CheckIcon')
  assert.equal(full[1].props['data-used'], undefined)

  const edited = chipsOf(renderCard({ sent: 'git push origin' }))
  assert.equal(edited[1].props['data-used'], 'partial')
  assert.equal(edited[1].props['aria-label'], '推送（需确认，改后发送）：git push --force')
  assert.equal(edited[1].children[0].type.name, 'EditedIcon')
  assert.equal(chipsOf(renderCard())[0].props['data-used'], undefined)
})

test('process row maps call phases to running, ok and error', () => {
  assert.equal(rowState('start', undefined), 'running')
  assert.equal(rowState('result', { meta }), 'ok')
  assert.equal(rowState('result', { meta: { shown: false, note: 'x' } }), 'error')
  assert.equal(rowState('result', { isError: true }), 'error')
  assert.equal(rowState('result', { error: { code: 'interrupted' } }), 'error')
})
