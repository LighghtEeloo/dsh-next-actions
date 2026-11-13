import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, normalizeConfig, __definition as tool, __guidance } from '../index.js'
import { buildMeta, LIMITS, overwideLabels, textWidth } from '../lib/normalize.js'

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

test('buildMeta rejects invalid input with a stable note', () => {
  // Arguments reach buildMeta parsed; a JSON string is invalid, not reparsed.
  assert.deepEqual(buildMeta(JSON.stringify(args())), { shown: false, note: 'invalid-arguments' })
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

test('buildMeta keeps a model-written label whole and clamps the prompt', () => {
  const meta = buildMeta(args([
    { label: 'x'.repeat(50), prompt: 'y'.repeat(600) },
    { label: '推送', prompt: 'git push --force origin main' },
    { label: '清理', prompt: 'reset the local cache', danger: true },
  ]))
  assert.equal(meta.suggestions[0].label, 'x'.repeat(50), 'the card never truncates a label')
  assert.equal(Array.from(meta.suggestions[0].prompt).length, LIMITS.prompt)
  assert.equal(meta.suggestions[0].danger, undefined)
  assert.equal(meta.suggestions[1].danger, true, 'command-shaped text marks danger')
  assert.equal(meta.suggestions[2].danger, true)
})

test('textWidth counts display columns across scripts', () => {
  assert.equal(textWidth(''), 0)
  assert.equal(textWidth('abc'), 3)
  assert.equal(textWidth('中文'), 4)
  assert.equal(textWidth('ＡＢ'), 4, 'fullwidth forms take two columns')
  assert.equal(textWidth('e\u0301'), 1, 'a combining accent adds no column')
  assert.equal(textWidth('a\u200bb'), 2, 'zero-width characters add no column')
  assert.equal(textWidth('😀'), 2)
  assert.equal(textWidth('中a'), 3)
})

test('buildMeta keeps explicit labels at and past the width limit and clips only a derived one', () => {
  const atCap = 'a'.repeat(LIMITS.labelWidth)
  const atCapMeta = buildMeta(args([{ label: atCap, prompt: 'x' }]))
  assert.equal(atCapMeta.suggestions[0].label, atCap)
  const over = 'a'.repeat(LIMITS.labelWidth + 1)
  const overMeta = buildMeta(args([{ label: over, prompt: 'x' }]))
  assert.equal(overMeta.suggestions[0].label, over)
  const widePrompt = '长'.repeat(Math.floor(LIMITS.labelWidth / 2) + 1)
  const derived = buildMeta(args([{ prompt: widePrompt }]))
  assert.ok(textWidth(derived.suggestions[0].label) <= LIMITS.labelWidth)
  assert.ok(derived.suggestions[0].label.endsWith('…'))
})

test('overwideLabels reports the labels the card would show, in card order', () => {
  const wide = '长'.repeat(Math.floor(LIMITS.labelWidth / 2) + 1)
  const atCap = '长'.repeat(LIMITS.labelWidth / 2)
  const meta = buildMeta(args([
    { label: 'ok', prompt: 'p1' },
    { label: wide, prompt: 'p2' },
    { label: atCap, prompt: 'p3' },
  ]))
  assert.deepEqual(overwideLabels(meta), [{ position: 2, label: wide, width: LIMITS.labelWidth + 2 }])
  assert.deepEqual(overwideLabels({ shown: false, note: 'x' }), [])
})

test('execute returns an overwide label to the model instead of showing a cut card', () => {
  const atCap = 'a'.repeat(LIMITS.labelWidth)
  assert.deepEqual(tool.execute(args([{ label: atCap, prompt: 'p' }])), { shown: true, count: 1 })

  const over = '长'.repeat(Math.floor(LIMITS.labelWidth / 2) + 1)
  assert.throws(
    () => tool.execute(args([{ label: over, prompt: 'p' }])),
    (error) => {
      assert.match(error.message, new RegExp(`label too wide \\(limit ${LIMITS.labelWidth} columns\\): #1 "长{35}…" is ${LIMITS.labelWidth + 2} columns`))
      assert.match(error.message, /card was not shown/)
      assert.match(error.message, /call suggest_next_actions again/)
      return true
    },
  )
})

test('an overwide label on a de-duplicated suggestion never blocks the card', () => {
  const over = '长'.repeat(Math.floor(LIMITS.labelWidth / 2) + 1)
  const meta = tool.execute(args([
    { label: 'ok', prompt: 'Same prompt' },
    { label: over, prompt: 'same PROMPT' },
  ]))
  assert.deepEqual(meta, { shown: true, count: 1 })
})

test('execute names every overwide label so each can be shortened', () => {
  assert.throws(
    () => tool.execute(args([
      { label: 'a'.repeat(LIMITS.labelWidth + 1), prompt: 'p1' },
      { label: 'b'.repeat(LIMITS.labelWidth + 2), prompt: 'p2' },
    ])),
    /labels too wide .*#1 .*; #2 /,
  )
})

test('buildMeta marks command-shaped risk and the model flag', () => {
  const meta = buildMeta(args([
    { label: '推送', prompt: 'git push --force origin main' },
    { label: '查看日志', prompt: 'read the error log and summarize' },
    { label: '清理', prompt: 'reset the local cache', danger: true },
  ]))
  assert.deepEqual(meta.suggestions.map((item) => item.danger), [true, undefined, true])
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

function agent({ origin } = {}) {
  const sections = []
  return {
    sections,
    session: { header: origin === undefined ? {} : { origin } },
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

function mount({ config, agents = [], listThrows = false, logger = true } = {}) {
  const cleanups = []
  const handlers = new Map()
  const registrations = []
  const warnings = []
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
    // Current AgentRegistry surface: list(), no roots(). The plugin must not
    // depend on the removed tree query.
    agents: { list: () => {
      if (listThrows) throw new Error('registry unavailable')
      return agents
    } },
    ...logger ? { logger: { warn: (message) => warnings.push(message) } } : {},
  }
  apply(ctx, config)
  return { ctx, handlers, registrations, agents, warnings, dispose: () => cleanups.forEach((cleanup) => cleanup()) }
}

test('apply registers the tool gated to ordinary session agents', () => {
  const root = agent()
  const sub = agent({ origin: 'subagent' })
  const { registrations, warnings } = mount({ agents: [root] })
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].definition.name, 'suggest_next_actions')
  const { when } = registrations[0].options
  assert.equal(when({ agent: root }), true)
  assert.equal(when({ agent: sub }), false)
  assert.equal(when({ agent: undefined }), true)
  assert.equal(when({ agent: {} }), true, 'an unreadable header fails open')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /header unreadable/)
  when({ agent: {} })
  assert.equal(warnings.length, 1, 'the drift is reported once')
})

test('apply installs the guidance once per ordinary live agent and disposes it', () => {
  const early = agent()
  const late = agent()
  const sub = agent({ origin: 'subagent' })
  const { handlers, agents, dispose } = mount({ agents: [early, sub] })
  agents.push(late)
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

test('a failed guidance install is reported and leaves the tool registered', () => {
  const broken = agent()
  broken.ctx.systemPrompt.section = () => { throw new Error('no sections') }
  const { registrations, warnings } = mount({ agents: [broken] })
  assert.equal(registrations.length, 1)
  assert.deepEqual(warnings.length, 1)
  assert.match(warnings[0], /dsh-next-actions: guidance not installed: Error: no sections/)
})

test('agents already live at apply time are reported when the registry is unreadable', () => {
  const later = agent()
  const { handlers, warnings } = mount({ listThrows: true })
  assert.deepEqual(warnings.length, 1)
  assert.match(warnings[0], /could not install guidance on existing agents: Error: registry unavailable/)
  handlers.get('agent/created')({ agent: later })
  assert.equal(later.sections.length, 1, 'later agents still get the guidance')
})

test('a missing logger still reports through the console', () => {
  const broken = agent()
  broken.ctx.systemPrompt.section = () => { throw new Error('no sections') }
  const original = console.warn
  const lines = []
  console.warn = (...args) => { lines.push(args.join(' ')) }
  try {
    const { warnings } = mount({ agents: [broken], logger: false })
    assert.equal(warnings.length, 0)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^dsh-next-actions: guidance not installed/)
  } finally {
    console.warn = original
  }
})

test('disabled config registers neither tool nor guidance', () => {
  const root = agent()
  const { registrations, handlers, warnings } = mount({ config: { enabled: false }, agents: [root] })
  assert.equal(registrations.length, 0)
  assert.equal(handlers.size, 0)
  assert.equal(root.sections.length, 0)
  assert.equal(warnings.length, 0)
})
