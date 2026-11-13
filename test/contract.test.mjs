import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMeta, LIMITS } from '../lib/normalize.js'

function loadCard() {
  let bundle
  new Function('window', readFileSync(new URL('../client.js', import.meta.url), 'utf8'))({
    __ModuleLoader__: { load: (value) => { bundle = value } },
  })
  const plugin = bundle.factory(() => ({
    createElement: (type, props, ...children) => ({ type, props, children: children.flat() }),
    useRef: (current) => ({ current }),
    useMemo: (compute) => compute(),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
  }))
  let Card
  plugin.apply({
    effect: () => {}, // Only slot registration is needed to render the card.
    slots: {
      inject: (_name, fn) => fn(),
      register: ({ name }, component) => {
        if (name === 'conversation.chat.turnTail') Card = component
      },
    },
  })
  return { Card, modelOf: plugin.__test.modelOf }
}

test('Host meta renders all three chips with their recommendation and danger marks', () => {
  const { Card, modelOf } = loadCard()
  const meta = buildMeta({
    context: '修复已完成。',
    suggestions: [
      { label: '强制推送', prompt: 'git push --force origin main' },
      { label: '查看日志', prompt: '查看错误日志' },
      { label: '看 diff', prompt: '查看完整 diff' },
      { label: '跑测试', prompt: '运行单元测试', recommended: true },
    ],
  })
  const data = new Map([['next-actions', { model: modelOf(meta) }], ['turn-tail', { closing: {} }]])
  const tree = Card({ turn: { end: {}, data }, t: (key) => key })
  assert.ok(tree, 'Host meta produces a card')
  const find = (node, predicate) => {
    if (node === null || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children ?? []).flatMap((child) => find(child, predicate))]
  }
  const chips = find(tree, (node) => node.props?.className === 'dshna-chips')[0]?.children ?? []
  assert.equal(chips.length, meta.suggestions.length, 'the client renders every suggestion from the Host')
  assert.deepEqual(chips.map((chip) => [chip.props.title, chip.children[0]?.type.name]), [
    ['运行单元测试', 'SparkIcon'],
    ['git push --force origin main', 'WarnIcon'],
    ['查看错误日志', undefined],
  ])
})

test('Host keeps a label at the limit whole for the client to show', () => {
  const { Card, modelOf } = loadCard()
  const label = '长'.repeat(LIMITS.labelWidth / 2)
  const meta = buildMeta({ context: '修复已完成。', suggestions: [{ label, prompt: '继续处理。' }] })
  assert.equal(meta.suggestions[0].label, label)
  const data = new Map([['next-actions', { model: modelOf(meta) }], ['turn-tail', { closing: {} }]])
  const tree = Card({ turn: { end: {}, data }, t: (key) => key })
  const find = (node, predicate) => {
    if (node === null || typeof node !== 'object') return []
    return [...(predicate(node) ? [node] : []), ...(node.children ?? []).flatMap((child) => find(child, predicate))]
  }
  const chip = find(tree, (node) => node.props?.className === 'dshna-chip')[0]
  assert.equal(chip.children[1].children[0], label)
})
