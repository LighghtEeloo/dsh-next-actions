import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const TOOL = 'suggest_next_actions'
let cardMemo

/** Load client.js with a stub module loader and a tree-building React stub. */
function loadBundle() {
  let bundle
  new Function('window', readFileSync(new URL('../client.js', import.meta.url), 'utf8'))({
    __ModuleLoader__: { load: (value) => { bundle = value } },
  })
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useRef: (current) => ({ current }),
    useMemo: (compute, deps) => {
      if (cardMemo.deps?.length !== deps.length || deps.some((dep, index) => !Object.is(dep, cardMemo.deps[index]))) {
        Object.assign(cardMemo, { deps, value: compute() })
      }
      return cardMemo.value
    },
  }
  return bundle.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require(${name})`)
  })
}

const plugin = loadBundle()
const { cardDefinition, sentDefinition, modelOf, fillMode, fill, rowState, usageOf, nextSent, tailOrder } = plugin.__test

const args = {
  context: '修复已完成。',
  suggestions: [
    { label: '跑测试', prompt: '跑一下测试。' },
    { label: '推送', prompt: 'git push --force', danger: true },
  ],
}
const meta = { shown: true, context: '修复已完成。', suggestions: [{ label: '跑测试', prompt: '跑一下测试。' }] }
const model = { context: meta.context, suggestions: meta.suggestions }

/**
 * Minimal stand-in for the DSH ConversationNodeAssembler: Location comes from
 * the event's position in its own session window (like the Engine's index),
 * Contexts are keyed by kind + id, `reader.previous` sees the nearest earlier
 * started Context of a kind, and a turn's Location key may have one owner.
 */
const definitions = [cardDefinition, sentDefinition]

function locate(events) {
  const locations = new Map()
  let current
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.type === 'turn/start') current = event.data.turn
    const turn = Number.isSafeInteger(event.data?.turn) ? event.data.turn : current
    locations.set(event.seq, turn === undefined ? { kind: 'session' } : { kind: 'turn', turn: { turn } })
    if (event.type === 'turn/end' && current === event.data.turn) current = undefined
  }
  return locations
}

/** Run `match` over events in the given order (a prepend matches older pages later). */
function collect(events) {
  const records = []
  for (const event of events) {
    for (const definition of definitions) {
      const result = definition.match(event)
      if (result !== null) records.push({ definition, ...result, event })
    }
  }
  return records
}

/** Fold collected matches over the session window the way the Engine settles them; returns turn → key → value. */
function build(records, window) {
  const locations = locate(window)
  const contexts = new Map()
  for (const record of [...records].sort((a, b) => a.event.seq - b.event.seq)) {
    const key = `${record.definition.kind}:${record.id}`
    if (!contexts.has(key)) contexts.set(key, { definition: record.definition, matches: [] })
    contexts.get(key).matches.push({ event: record.event, role: record.role, location: locations.get(record.event.seq) })
  }
  const started = [...contexts.values()]
    .filter((context) => context.matches[0].role === 'start')
    .sort((a, b) => a.matches[0].event.seq - b.matches[0].event.seq)
  const done = []
  for (const context of started) {
    const [first, ...rest] = context.matches
    const kind = context.definition.kind
    const reader = { previous: (wanted) => {
      const previous = done.filter((other) => other.definition.kind === wanted).at(-1)
      return previous === undefined ? undefined : { state: previous.state }
    } }
    context.state = context.definition.start({}, first, reader)
    for (const match of rest) context.state = context.definition.update({ state: context.state }, match)
    done.push(context)
    assert.equal(kind, context.definition.kind)
  }
  const turns = new Map()
  for (const context of done) {
    const data = context.definition.buildLocationData({ state: context.state }, 'turn', null)
    if (data === null) continue
    assert.equal(data.key, context.definition.kind, 'Location data key must be the Definition kind')
    const values = turns.get(data.turn) ?? new Map()
    assert.equal(values.has(data.key), false, `turn ${data.turn} already has ${data.key}`)
    values.set(data.key, data.value)
    turns.set(data.turn, values)
  }
  return turns
}

const assemble = (events) => build(collect(events), events)
const dataOf = (turns, turn, key) => turns.get(turn)?.get(key)

let seq = 0
const at = (event) => ({ seq: ++seq, ...event })
const turnStart = (turn) => at({ type: 'turn/start', data: { turn } })
const turnEnd = (turn) => at({ type: 'turn/end', data: { turn, reason: 'completed' } })
const call = (turn, callId = 'c1') => at({ type: 'tool/call', data: { turn, step: 1, callId, name: TOOL, arguments: JSON.stringify(args) } })
const result = (turn, callId = 'c1', extra = {}) => at({
  type: 'tool/result',
  surfaceOp: 'append',
  data: { turn, step: 1, message: { isError: false, source: { callId } }, ...extra },
})
const user = (text, { id = text, kind = 'user', surfaceOp = 'append' } = {}) =>
  at({ type: 'user/message', surfaceOp, data: { id, role: 'user', content: [{ type: 'text', text }], source: { kind } } })

test('native call + result publishes the persisted meta as the turn card', () => {
  const turns = assemble([turnStart(1), call(1), result(1, 'c1', { meta })])
  assert.deepEqual(dataOf(turns, 1, 'next-actions'), { model })
  const state = { turn: 1, model, taken: false }
  const location = cardDefinition.buildLocationData({ state }, 'turn', null)
  assert.deepEqual(location, { kind: 'turn', turn: 1, key: 'next-actions', value: { model } })
  assert.equal(cardDefinition.buildLocationData({ state }, 'turn', location), location)
  assert.equal(cardDefinition.buildLocationData({ state }, 'step', null), null)
})

test('a missing, not-shown or malformed meta publishes no card', () => {
  assert.equal(assemble([turnStart(1), call(1), result(1)]).size, 0)
  assert.equal(assemble([turnStart(1), call(1), result(1, 'c1', { meta: { shown: false, note: 'x' } })]).size, 0)
  assert.equal(modelOf({ shown: true, context: 'c', suggestions: [] }), null)
  assert.equal(modelOf({ shown: true, suggestions: meta.suggestions }), null)
  assert.equal(modelOf({ shown: true, context: 'c', suggestions: [{ label: 'x' }, null] }), null)
})

test('older metas keep at most three suggestions with their marks', () => {
  const suggestions = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, label: `L${n}`, prompt: `P${n}`, stance: 'continue' }))
  suggestions[0].recommended = true
  const kept = modelOf({ shown: true, context: 'c', suggestions }).suggestions
  assert.deepEqual(kept.map((item) => item.label), ['L1', 'L2', 'L3'])
  assert.equal(kept[0].recommended, true)
})

test('errors, replacement results and other calls never publish a card', () => {
  const error = at({ type: 'tool/result', surfaceOp: 'append', data: { turn: 1, meta, message: { isError: true, source: { callId: 'c1' } } } })
  assert.equal(assemble([turnStart(1), call(1), error]).size, 0)
  assert.equal(assemble([turnStart(1), result(1, 'c1', { meta })]).size, 0, 'a result without our call has no started Context')
  assert.equal(assemble([turnStart(1), call(1), result(1, 'other', { meta })]).size, 0)
  assert.equal(cardDefinition.match({ ...result(1), surfaceOp: 'replace' }), null)
  assert.equal(cardDefinition.match({ type: 'tool/call', data: { turn: 1, callId: 'c9', name: 'other' } }), null)
  assert.equal(cardDefinition.match({ type: 'tool/call', data: { turn: 1, name: TOOL } }), null)
})

const ptc = (type, extra = {}) => at({ type, data: { rootCallId: 'run-1', subCallId: 'run-1:1', name: TOOL, arguments: args, ...extra } })

test('PTC dispatch is keyed by its root call and placed by its resolved location', () => {
  assert.deepEqual(cardDefinition.match(ptc('tool/ptc-dispatch-start')), { id: 'ptc:run-1', role: 'start' })
  assert.deepEqual(cardDefinition.match(ptc('tool/ptc-dispatch', { meta })), { id: 'ptc:run-1', role: 'update' })
  assert.equal(cardDefinition.match(ptc('tool/ptc-dispatch', { rootCallId: undefined })), null)

  const runCode = at({ type: 'tool/call', data: { turn: 4, step: 1, callId: 'run-1', name: 'run_code', arguments: '{}' } })
  assert.equal(cardDefinition.match(runCode), null)
  const turns = assemble([turnStart(4), runCode, ptc('tool/ptc-dispatch-start'), ptc('tool/ptc-dispatch', { meta })])
  assert.deepEqual(dataOf(turns, 4, 'next-actions'), { model })
  assert.equal(assemble([turnStart(4), ptc('tool/ptc-dispatch-start'), ptc('tool/ptc-dispatch', { isError: true, meta })]).size, 0)
  assert.equal(assemble([ptc('tool/ptc-dispatch-start'), ptc('tool/ptc-dispatch', { meta })]).size, 0, 'no turn, no card')
})

test('one card per turn: the first call that produced a card owns it', () => {
  const second = { ...meta, context: '第二次。' }
  const both = assemble([turnStart(1), call(1, 'a'), result(1, 'a', { meta }), call(1, 'b'), result(1, 'b', { meta: second })])
  assert.deepEqual(dataOf(both, 1, 'next-actions'), { model })

  const failedFirst = assemble([turnStart(1), call(1, 'a'), result(1, 'a'), call(1, 'b'), result(1, 'b', { meta: second })])
  assert.equal(dataOf(failedFirst, 1, 'next-actions').model.context, '第二次。')

  const parallel = assemble([turnStart(1), call(1, 'a'), call(1, 'b'), result(1, 'b', { meta: second }), result(1, 'a', { meta })])
  assert.deepEqual(dataOf(parallel, 1, 'next-actions'), { model })

  const mixed = assemble([turnStart(1), call(1, 'a'), result(1, 'a', { meta }), ptc('tool/ptc-dispatch-start'), ptc('tool/ptc-dispatch', { meta: second })])
  assert.deepEqual(dataOf(mixed, 1, 'next-actions'), { model })
})

test('the first human message of a turn is its sent text', () => {
  assert.deepEqual(sentDefinition.match(user('a')), { id: 'a', role: 'start' })
  assert.equal(sentDefinition.match(user('a', { kind: 'inject' })), null)
  assert.equal(sentDefinition.match(user('a', { surfaceOp: 'replace' })), null)
  assert.equal(sentDefinition.match(user('a', { id: null })), null)

  const turns = assemble([turnStart(2), user('跑一下测试。'), user('另外看下日志'), turnEnd(2), turnStart(3), user('', { id: 'empty' }), user('后来的')])
  assert.deepEqual(dataOf(turns, 2, 'next-actions-sent'), { text: '跑一下测试。' })
  assert.deepEqual(dataOf(turns, 3, 'next-actions-sent'), { text: '' }, 'a textless opening message still owns the turn')
  assert.equal(assemble([user('before any turn')]).size, 0)
})

test('regression: a prepended older page does not move live messages to an older turn', () => {
  const older = [turnStart(4), user('第四轮'), call(4), result(4, 'c1', { meta }), turnEnd(4)]
  const tail = [turnStart(5)]
  const live = user('跑一下测试。')
  const inOrder = assemble([...older, ...tail, live])
  // Open the tail, then load the older page (matched after the tail), then the live message arrives.
  const prepended = build([...collect(tail), ...collect(older), ...collect([live])], [...older, ...tail, live])
  assert.deepEqual(prepended, inOrder)
  assert.deepEqual(dataOf(prepended, 5, 'next-actions-sent'), { text: '跑一下测试。' })
  assert.deepEqual(dataOf(prepended, 4, 'next-actions-sent'), { text: '第四轮' })
})

test('regression: interleaved feeds of two sessions keep their own turns', () => {
  const sessionA = [turnStart(4), call(4), result(4, 'c1', { meta }), turnEnd(4), turnStart(5), user('跑一下测试。', { id: 'a5' })]
  const sessionB = [turnStart(6), turnEnd(6), turnStart(7), user('别的会话', { id: 'b7' })]
  const records = { a: [], b: [] }
  for (let index = 0; index < Math.max(sessionA.length, sessionB.length); index += 1) {
    if (sessionB[index]) records.b.push(...collect([sessionB[index]]))
    if (sessionA[index]) records.a.push(...collect([sessionA[index]]))
  }
  const a = build(records.a, sessionA)
  const b = build(records.b, sessionB)
  assert.deepEqual(dataOf(a, 5, 'next-actions-sent'), { text: '跑一下测试。' })
  assert.equal(dataOf(a, 7, 'next-actions-sent'), undefined)
  assert.deepEqual(dataOf(b, 7, 'next-actions-sent'), { text: '别的会话' })
  assert.deepEqual(a, assemble(sessionA))
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

function warningsFrom(run) {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => { warnings.push(args) }
  try {
    run()
  } finally {
    console.warn = original
  }
  return warnings
}

test('fill appends with setDraft when the editor refuses or lacks insertText, and reports it', () => {
  const warnings = warningsFrom(() => {
    const refused = actions({ insert: false })
    fill(refused, '我的草稿  ', null, '跑一下测试。', 's')
    assert.deepEqual(refused.calls.at(-1), ['setDraft', '我的草稿\n\n跑一下测试。'])
    const legacy = { calls: [], setDraft(text) { this.calls.push(text) } }
    fill(legacy, '我的草稿', null, '跑一下测试。', 's')
    assert.deepEqual(legacy.calls, ['我的草稿\n\n跑一下测试。'])
    const broken = {
      calls: [],
      setDraft(text) { this.calls.push(text) },
      captureInsertion: () => ({ start: 3, end: 3, draftRev: 7 }),
      insertText() { throw new Error('editor gone') },
    }
    fill(broken, '我的草稿', null, '跑一下测试。', 's')
    assert.deepEqual(broken.calls, ['我的草稿\n\n跑一下测试。'])
  })
  assert.equal(warnings.length, 3)
  assert.match(String(warnings[0][0]), /^\[dsh-next-actions\] insertText declined/)
  assert.match(String(warnings[1][0]), /^\[dsh-next-actions\] insert at caret failed/)
  assert.equal(warnings[2][1].message, 'editor gone')
})

function renderCard({ sent = '', end = true, closing = true, subagent = false, model = buildModel(), inputActions = actions(), draft = '', lang = 'zh', memo = {} } = {}) {
  const Card = cardComponent()
  const messages = locales[lang]
  const data = new Map([['next-actions', { model }], ['turn-tail', { closing: closing ? {} : undefined }]])
  cardMemo = memo
  return Card({
    turn: { turn: 1, end: end ? {} : undefined, data },
    inputActions,
    useInput: (select) => select({ draft }),
    useChat: (select) => select({
      timeline: { turnOrder: [1, 2], turns: new Map([[2, { data: new Map([['next-actions-sent', { text: sent }]]) }]]) },
    }),
    useSession: (select) => select({ subagent }),
    sessionId: 's',
    // Same `{name}` interpolation as DSH's locale `t`.
    t: (key, params = {}) => (messages[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) => params[name] ?? whole),
  })
}

function buildModel() {
  return modelOf({ shown: true, ...args })
}

let Card
let locales
let tailOptions
function cardComponent() {
  if (Card !== undefined) return Card
  const slots = []
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: (_ns, tables) => { locales = tables; return () => {} } },
    uiConversation: { events: { register: () => () => {} } },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => slots.push({ options, component }) },
  }
  globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } }
  plugin.apply(ctx)
  delete globalThis.document
  const tail = slots.find((slot) => slot.options.name === 'conversation.chat.turnTail')
  Card = tail.component
  tailOptions = tail.options
  return Card
}

const find = (node, predicate, found = []) => {
  if (node === null || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) find(child, predicate, found)
  return found
}

test('tail card registers after shipped and common content cards', () => {
  cardComponent()
  assert.equal(tailOptions.order, tailOrder)
  // File-change and plan cards use 0, schedule uses 20, visualize uses 100;
  // the message action row sits outside this slot and always follows it.
  assert.ok(tailOrder > 100, `tail order ${tailOrder} must exceed every content card`)
})

test('card renders context and one chip per suggestion on an ended turn', () => {
  const tree = renderCard()
  assert.equal(tree.children[0].props['aria-label'], '下一步建议')
  const chips = find(tree, (node) => node.props?.className === 'dshna-chip')
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
  const disabled = find(renderCard({ inputActions: null }), (node) => node.props?.className === 'dshna-chip')
  assert.equal(disabled[0].props.disabled, true)
  const input = actions()
  const chips = find(renderCard({ inputActions: input }), (node) => node.props?.className === 'dshna-chip')
  chips[0].props.onClick()
  assert.deepEqual(input.calls, [['setDraft', '跑一下测试。']])
})

const chipsOf = (tree) => find(tree, (node) => node.props?.className === 'dshna-chip')

test('a recommended chip is marked (the Host already put it first)', () => {
  const model = modelOf({ shown: true, context: 'c', suggestions: [{ label: 'B', prompt: 'b', recommended: true }, { label: 'A', prompt: 'a' }] })
  const chips = chipsOf(renderCard({ model }))
  assert.equal(chips[0].props['data-recommended'], '')
  assert.equal(chips[0].props['aria-label'], 'B（推荐）：b')
  assert.equal(chips[1].props['data-recommended'], undefined)
})

const timeline = (entries) => ({
  timeline: {
    turnOrder: entries.map(([turn]) => turn),
    turns: new Map(entries.map(([turn, data]) => [turn, { data: new Map(Object.entries(data)) }])),
  },
})

test('nextSent reads the next turn opened by a human message', () => {
  const snapshot = timeline([[3, {}], [5, { 'next-actions-sent': { text: 'hi' } }]])
  assert.equal(nextSent(snapshot, 3), 'hi')
  assert.equal(nextSent(snapshot, 5), '')
  assert.equal(nextSent(snapshot, 4), '')
  assert.equal(nextSent(undefined, 3), '')
})

test('regression: turns without a human message are skipped, unless they show their own card', () => {
  const skipped = timeline([[3, {}], [4, {}], [5, { 'next-actions-sent': { text: 'hi' } }]])
  assert.equal(nextSent(skipped, 3), 'hi')
  const textless = timeline([[3, {}], [4, { 'next-actions-sent': { text: '' } }], [5, { 'next-actions-sent': { text: 'hi' } }]])
  assert.equal(nextSent(textless, 3), '', 'an image-only reply stops the search instead of borrowing a later message')
  const ownCard = timeline([[3, {}], [4, { 'next-actions': { model } }], [5, { 'next-actions-sent': { text: 'hi' } }]])
  assert.equal(nextSent(ownCard, 3), '', 'the message answers the newer card of turn 4')
  assert.equal(nextSent(ownCard, 4), 'hi')
  const answeredWithCard = timeline([[3, {}], [4, { 'next-actions-sent': { text: 'hi' }, 'next-actions': { model } }]])
  assert.equal(nextSent(answeredWithCard, 3), 'hi', 'a turn opened by the human answers the card before it')
})

test('usageOf tells sent as-is, sent with edits, and unrelated apart', () => {
  const prompt = '跑一下测试，只跑 src/api 相关用例。'
  assert.equal(usageOf(prompt, `先说一句\n\n${prompt}`), 'full')
  assert.equal(usageOf(prompt, `先说一句\n${prompt}\n最后一句`), 'full')
  assert.equal(usageOf(prompt, '跑一下测试，只跑src/api相关用例。'), 'full')
  assert.equal(usageOf('第一行\n第二行', '前言\n第一行\n第二行'), 'full')
  assert.equal(usageOf(prompt, '跑一下测试，只跑 src/api 和 src/db 的相关用例'), 'partial')
  assert.equal(usageOf('跑一下测试', '跑一下单元测试'), 'partial')
  assert.equal(usageOf(prompt, '帮我写一份发布说明'), null)
  assert.equal(usageOf(prompt, ''), null)
  assert.equal(usageOf('', 'anything'), null)
})

test('regression: a prompt inside a longer line is not "sent as-is"', () => {
  assert.equal(usageOf('ok', 'Look okay?'), null)
  assert.equal(usageOf('ok', 'ok then'), null)
  assert.equal(usageOf('ok', 'ok'), 'full')
  assert.equal(usageOf('好', '好的，不过先别动'), null)
  assert.equal(usageOf('好', '好'), 'full')
  // Negation is still an edit of the text; the pencil says "sent with edits", never the check.
  assert.equal(usageOf('git push --force', '不要 git push --force'), 'partial')
})

test('regression: "sent with edits" keeps the prompt in order and is not diluted', () => {
  assert.equal(usageOf('跑一下测试', '测试一下跑'), null)
  assert.equal(usageOf('okay', 'kay'), 'partial', 'deleting a character is an edit')
  assert.equal(usageOf('跑测试', '跑测试吧'), null, 'prompts under four characters only count as-is')
  const scattered = '我们讨论一下测试策略：先跑一下所有的单元测试，然后只看 src/api 目录下相关的用例结果，再决定下一步。'
  assert.equal(usageOf('跑一下测试，只跑 src/api 相关用例。', scattered), null)
})

test('each chip is judged on its own: one message can fully use one and partly use another', () => {
  const chips = chipsOf(renderCard({ sent: '跑一下测试。\ngit push origin' }))
  assert.deepEqual(chips.map((chip) => chip.props['data-used']), ['full', 'partial'])
})

test('card reuses usage on draft edits and recomputes for new sent text or suggestions', () => {
  const memo = {}
  const model = buildModel()
  const initial = { model, memo, sent: '跑一下测试。' }
  assert.equal(chipsOf(renderCard(initial))[0].props['data-used'], 'full')
  const usages = memo.value
  assert.deepEqual(usages, ['full', null])
  assert.equal(chipsOf(renderCard({ ...initial, draft: '我的草稿' }))[0].props['data-used'], 'full')
  assert.equal(memo.value, usages)

  const updated = { ...initial, sent: '跑一下单元测试' }
  assert.equal(chipsOf(renderCard(updated))[0].props['data-used'], 'partial')
  const replacement = { ...model, suggestions: [{ label: '跑测试', prompt: updated.sent }] }
  assert.equal(chipsOf(renderCard({ ...updated, model: replacement }))[0].props['data-used'], 'full')
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

test('chip accessible names follow the locale, punctuation included', () => {
  const plain = chipsOf(renderCard({ lang: 'en' }))
  assert.equal(plain[0].props['aria-label'], '跑测试: 跑一下测试。')
  assert.equal(plain[1].props['aria-label'], '推送 (Needs confirmation): git push --force')

  const edited = chipsOf(renderCard({ lang: 'en', sent: 'git push origin' }))
  assert.equal(edited[1].props['aria-label'], '推送 (Needs confirmation, Sent with edits): git push --force')
})

test('English and Chinese locales define the same keys', () => {
  cardComponent()
  assert.deepEqual(Object.keys(locales.en).sort(), Object.keys(locales.zh).sort())
})

test('process row maps call phases to running, ok and error', () => {
  assert.equal(rowState('start', undefined), 'running')
  assert.equal(rowState('result', { meta }), 'ok')
  assert.equal(rowState('result', { meta: { shown: false, note: 'x' } }), 'error')
  assert.equal(rowState('result', { isError: true }), 'error')
  assert.equal(rowState('result', { error: { code: 'interrupted' } }), 'error')
})
