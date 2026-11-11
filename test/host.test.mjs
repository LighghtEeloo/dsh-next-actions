import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, normalizeConfig, __definition as tool, __guidance } from '../index.js'
import { buildMeta, LIMITS } from '../lib/normalize.js'

const args = (suggestions) => ({
  context: '  修复已完成，\n改动集中在 src/api。 ',
  suggestions: suggestions ?? [
    { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。' },
    { label: '看 diff', prompt: '看一下完整 diff。' },
  ],
})

test('buildMeta keeps context and suggestions, collapsing whitespace', () => {
  assert.deepEqual(buildMeta(args()), {
    shown: true,
    context: '修复已完成， 改动集中在 src/api。',
    suggestions: [
      { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。' },
      { label: '看 diff', prompt: '看一下完整 diff。' },
    ],
  })
})

test('buildMeta accepts a JSON string and an older persisted meta', () => {
  assert.equal(buildMeta(JSON.stringify(args())).shown, true)
  const old = { shown: true, context: 'Done.', suggestions: [{ id: 's1', label: 'Run', prompt: 'Run tests', stance: 'verify', recommended: true }] }
  assert.deepEqual(buildMeta(old).suggestions, [{ label: 'Run', prompt: 'Run tests', recommended: true }])
})

test('buildMeta rejects invalid input with a stable note', () => {
  assert.deepEqual(buildMeta('{oops'), { shown: false, note: 'invalid-arguments' })
  assert.deepEqual(buildMeta([]), { shown: false, note: 'invalid-arguments' })
  assert.deepEqual(buildMeta({ suggestions: [] }), { shown: false, note: 'missing-context' })
  assert.deepEqual(buildMeta({ context: 'x', suggestions: [{ label: ' ' }, null] }), { shown: false, note: 'no-usable-suggestions' })
})

test('buildMeta de-duplicates prompts, falls back between label and prompt, and caps the list', () => {
  const meta = buildMeta(args([
    { label: 'A', prompt: 'Same prompt' },
    { label: 'B', prompt: 'same PROMPT' },
    { label: 'Only label' },
    { prompt: 'Only prompt' },
    { label: 'D', prompt: 'Fourth' },
  ]))
  assert.deepEqual(meta.suggestions, [
    { label: 'A', prompt: 'Same prompt' },
    { label: 'Only label', prompt: 'Only label' },
    { label: 'Only prompt', prompt: 'Only prompt' },
  ])
  assert.equal(meta.suggestions.length, LIMITS.suggestions)
})

test('buildMeta keeps one recommendation and moves it first', () => {
  const meta = buildMeta(args([
    { label: 'A', prompt: 'a' },
    { label: 'B', prompt: 'b' },
    { label: 'C', prompt: 'c' },
    { label: 'D', prompt: 'd', recommended: true },
    { label: 'E', prompt: 'e', recommended: true },
  ]))
  assert.deepEqual(meta.suggestions.map((item) => item.label), ['D', 'A', 'B'])
  assert.equal(meta.suggestions[0].recommended, true)
  assert.equal(meta.suggestions.filter((item) => item.recommended).length, 1)
})

test('buildMeta clamps long text and marks risky suggestions', () => {
  const meta = buildMeta(args([
    { label: 'x'.repeat(50), prompt: 'y'.repeat(600) },
    { label: '推送', prompt: 'git push --force origin main' },
    { label: '只读', prompt: '看一下日志', danger: true },
  ]))
  assert.equal(Array.from(meta.suggestions[0].label).length, LIMITS.label)
  assert.ok(meta.suggestions[0].label.endsWith('…'))
  assert.equal(Array.from(meta.suggestions[0].prompt).length, LIMITS.prompt)
  assert.equal(meta.suggestions[0].danger, undefined)
  assert.equal(meta.suggestions[1].danger, true)
  assert.equal(meta.suggestions[2].danger, true)
})

test('buildMeta clips a label one character past the stated cap', () => {
  const atCap = buildMeta(args([{ label: '标'.repeat(LIMITS.label), prompt: 'x' }]))
  assert.equal(Array.from(atCap.suggestions[0].label).length, LIMITS.label)
  const over = buildMeta(args([{ label: '标'.repeat(LIMITS.label + 1), prompt: 'x' }]))
  assert.equal(Array.from(over.suggestions[0].label).length, LIMITS.label)
  assert.ok(over.suggestions[0].label.endsWith('…'))
})

test('buildMeta ignores negated and descriptive risk words', () => {
  const meta = buildMeta(args([
    { label: '先自动验证', prompt: '完成后汇报结果，不要发布。' },
    { label: '改掉过时注释', prompt: '压缩不删除原 tool/result；替换副本一律忽略' },
    { label: '先原子化提交', prompt: '当前暂存区只有 scripts/ 和 src/ 的删除，其余修改未暂存' },
  ]))
  assert.deepEqual(meta.suggestions.map((item) => item.danger), [undefined, undefined, undefined])
})

test('buildMeta still marks risk actions after a modal word', () => {
  const meta = buildMeta(args([
    { label: '清理', prompt: '删除旧分支' },
    { label: '准备发布', prompt: '评估发布准备并给出检查清单' },
    { label: '发布', prompt: '请帮我部署到生产环境' },
  ]))
  assert.deepEqual(meta.suggestions.map((item) => item.danger), [true, true, true])
})

test('tool execute and render report whether a card is shown', () => {
  assert.deepEqual(tool.execute(args()), { shown: true, count: 2 })
  assert.deepEqual(tool.execute({}), { shown: false, count: 0 })
  assert.match(tool.output.render({}, { shown: true, count: 2 })[0].text, /shown below your answer \(2\)/)
  assert.match(tool.output.render({}, { shown: false, count: 0 })[0].text, /No card shown/)
  assert.deepEqual(tool.output.presentationMeta(args()), buildMeta(args()))
})

test('normalizeConfig only disables on a literal false', () => {
  assert.equal(normalizeConfig(undefined).enabled, true)
  assert.equal(normalizeConfig('off').enabled, true)
  assert.equal(normalizeConfig({ enabled: 0 }).enabled, true)
  assert.equal(normalizeConfig({ enabled: false }).enabled, false)
})

function agent() {
  const sections = []
  return {
    sections,
    ctx: {
      effect: (fn) => {
        const dispose = fn()
        return () => dispose()
      },
      systemPrompt: {
        getSectionOrder: () => 2900,
        section: (section) => {
          sections.push(section)
          return () => { section.disposed = true }
        },
      },
    },
  }
}

function mount({ config, roots = [], rootsThrows = false } = {}) {
  const cleanups = []
  const handlers = new Map()
  const registrations = []
  const ctx = {
    effect: (fn) => {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
    on: (event, handler) => {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    },
    tools: {
      register: (definition, options) => {
        registrations.push({ definition, options })
        return () => {}
      },
    },
    agents: {
      roots: () => {
        if (rootsThrows) throw new Error('registry unavailable')
        return roots
      },
    },
  }
  apply(ctx, config)
  return { ctx, handlers, registrations, roots, dispose: () => cleanups.forEach((cleanup) => cleanup()) }
}

test('apply registers the tool gated to root agents', () => {
  const root = agent()
  const sub = agent()
  const { registrations } = mount({ roots: [root] })
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].definition.name, 'suggest_next_actions')
  const { when } = registrations[0].options
  assert.equal(when({ agent: root }), true)
  assert.equal(when({ agent: sub }), false)
  assert.equal(when({ agent: undefined }), true)
  assert.equal(mount({ rootsThrows: true }).registrations[0].options.when({ agent: sub }), true)
})

test('apply installs the guidance once per root agent and disposes it', () => {
  const early = agent()
  const late = agent()
  const sub = agent()
  const { handlers, roots, dispose } = mount({ roots: [early] })
  roots.push(late)
  handlers.get('agent/created')({ agent: late })
  handlers.get('agent/created')({ agent: late })
  handlers.get('agent/created')({ agent: sub })
  assert.equal(early.sections.length, 1)
  assert.equal(late.sections.length, 1)
  assert.equal(sub.sections.length, 0)
  assert.equal(early.sections[0].name, __guidance.section)
  assert.equal(early.sections[0].order, 2950)
  assert.equal(early.sections[0].text, __guidance.text)
  dispose()
  assert.equal(early.sections[0].disposed, true)
  assert.equal(late.sections[0].disposed, true)
})

test('disabled config registers neither tool nor guidance', () => {
  const root = agent()
  const { registrations, handlers } = mount({ config: { enabled: false }, roots: [root] })
  assert.equal(registrations.length, 0)
  assert.equal(handlers.size, 0)
  assert.equal(root.sections.length, 0)
})
