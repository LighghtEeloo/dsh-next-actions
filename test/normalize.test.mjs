import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMeta, LIMITS, NOTES, STANCES } from '../lib/normalize.js'

const validArgs = () => ({
  context: '改动已完成，改动集中在 src/api。',
  suggestions: [
    { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
    { label: '加回归用例', prompt: '补一条针对边界值的回归用例。', stance: 'continue' },
    { label: '看改动', prompt: '看一下本次改动的完整 diff。', stance: 'push' },
  ],
})

const metaOf = (overrides = {}) => buildMeta({ ...validArgs(), ...overrides })

// ---------------------------------------------------------------------------
// Shape of a valid result
// ---------------------------------------------------------------------------

test('valid arguments produce a shown meta with context and suggestions', () => {
  const meta = metaOf()
  assert.equal(meta.shown, true)
  assert.equal(meta.note, undefined)
  assert.equal(meta.context, '改动已完成，改动集中在 src/api。')
  assert.equal(meta.suggestions.length, 3)
})

test('suggestions carry exactly id/label/prompt/stance when no flags are set', () => {
  const meta = metaOf()
  for (const suggestion of meta.suggestions) {
    assert.deepEqual(Object.keys(suggestion).sort(), ['id', 'label', 'prompt', 'stance'])
  }
})

test('meta is JSON-lossless (only plain values)', () => {
  const meta = metaOf()
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta)
})

test('meta does not expose an internal count field', () => {
  const meta = metaOf()
  assert.equal(meta.count, undefined)
})

test('a JSON string of arguments is tolerated', () => {
  const meta = buildMeta(JSON.stringify(validArgs()))
  assert.equal(meta.shown, true)
  assert.equal(meta.suggestions.length, 3)
})

// ---------------------------------------------------------------------------
// Invalid arguments degrade to a stable note and never throw
// ---------------------------------------------------------------------------

for (const [name, value] of [
  ['null', null],
  ['undefined', undefined],
  ['number', 42],
  ['array', []],
  ['malformed JSON string', '{not json'],
  ['boolean', true],
]) {
  test(`invalid arguments (${name}) return invalid-arguments`, () => {
    const meta = buildMeta(value)
    assert.equal(meta.shown, false)
    assert.equal(meta.note, NOTES.invalidArguments)
    assert.equal(meta.suggestions, undefined)
  })
}

test('missing context returns missing-context', () => {
  const meta = buildMeta({ suggestions: validArgs().suggestions })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.missingContext)
})

test('non-string context returns invalid-arguments', () => {
  const meta = buildMeta({ context: 3, suggestions: validArgs().suggestions })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.invalidArguments)
})

test('whitespace-only context returns missing-context', () => {
  const meta = buildMeta({ context: '   \n\t ', suggestions: validArgs().suggestions })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.missingContext)
})

test('missing suggestions array returns invalid-arguments', () => {
  const meta = buildMeta({ context: 'ok' })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.invalidArguments)
})

test('non-array suggestions returns invalid-arguments', () => {
  const meta = buildMeta({ context: 'ok', suggestions: 'not-an-array' })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.invalidArguments)
})

test('empty suggestions array returns no-usable-suggestions', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [] })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.noUsableSuggestions)
})

test('entries that are not records are dropped', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [null, 42, 'x', [], { label: '跑测试', prompt: '跑一下测试' }],
  })
  assert.equal(meta.shown, true)
  assert.equal(meta.suggestions.length, 1)
  assert.equal(meta.suggestions[0].label, '跑测试')
})

test('all-empty entries fall back to no-usable-suggestions', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{}, { label: '   ', prompt: '' }] })
  assert.equal(meta.shown, false)
  assert.equal(meta.note, NOTES.noUsableSuggestions)
})

test('buildMeta never throws on malformed fuzz input', () => {
  const fuzz = [
    null,
    undefined,
    42,
    'x',
    [],
    {},
    { context: 1 },
    { context: 'x', suggestions: [null, 1, 'x', {}, { label: 1 }] },
    { context: 'x', suggestions: [{ prompt: 'x', stance: {} }] },
    { context: 'x', suggestions: [{ label: 'x', prompt: 'y', recommended: 'yes', danger: 1 }] },
    { context: 'x', suggestions: new Array(20).fill(0).map((_, index) => ({ label: `l${index}`, prompt: `p${index}` })) },
  ]
  for (const value of fuzz) {
    const meta = buildMeta(value)
    assert.equal(typeof meta.shown, 'boolean')
  }
})

// ---------------------------------------------------------------------------
// Context normalization
// ---------------------------------------------------------------------------

test('context collapses internal whitespace and trims', () => {
  const meta = metaOf({ context: '  改动\n已完成，   接下来 可以验证。 ' })
  assert.equal(meta.context, '改动 已完成， 接下来 可以验证。')
})

test('context strips matching wrapping quotes', () => {
  const meta = metaOf({ context: '“结论已确认。”' })
  assert.equal(meta.context, '结论已确认。')
})

test('context strips CJK corner quotes', () => {
  const meta = metaOf({ context: '「结论已确认。」' })
  assert.equal(meta.context, '结论已确认。')
})

test('context is clamped to LIMITS.context with an ellipsis', () => {
  const meta = metaOf({ context: '上'.repeat(300) })
  const characters = Array.from(meta.context)
  assert.equal(characters.length, LIMITS.context)
  assert.equal(characters.at(-1), '…')
})

// ---------------------------------------------------------------------------
// Entry cleaning and fallbacks
// ---------------------------------------------------------------------------

test('prompt falls back to label when missing', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ label: '跑测试' }] })
  assert.equal(meta.shown, true)
  assert.equal(meta.suggestions[0].prompt, '跑测试')
})

test('label falls back to a clamped prompt when missing', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ prompt: '执行一下测试并汇报结果' }] })
  assert.equal(meta.suggestions[0].label, '执行一下测试并汇报结果')
})

test('label is clamped to LIMITS.label', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ label: '标'.repeat(80), prompt: 'x' }] })
  const label = meta.suggestions[0].label
  assert.equal(Array.from(label).length, LIMITS.label)
  assert.equal(Array.from(label).at(-1), '…')
})

test('prompt is clamped to LIMITS.prompt', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ label: 'x', prompt: '指'.repeat(900) }] })
  const prompt = meta.suggestions[0].prompt
  assert.equal(Array.from(prompt).length, LIMITS.prompt)
})

test('label and prompt are trimmed', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ label: '  跑测试  ', prompt: '  跑一下测试  ' }] })
  assert.equal(meta.suggestions[0].label, '跑测试')
  assert.equal(meta.suggestions[0].prompt, '跑一下测试')
})

// ---------------------------------------------------------------------------
// Prompt de-duplication
// ---------------------------------------------------------------------------

test('prompts differing only in case are de-duplicated', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: 'Run the tests', stance: 'verify' },
      { label: 'B', prompt: 'run the tests', stance: 'continue' },
    ],
  })
  assert.equal(meta.suggestions.length, 1)
})

test('prompts differing only in whitespace are de-duplicated', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '跑一下测试。', stance: 'verify' },
      { label: 'B', prompt: '  跑一下测试  ', stance: 'continue' },
    ],
  })
  assert.equal(meta.suggestions.length, 1)
})

test('prompts differing only in trailing punctuation are de-duplicated', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '跑一下测试', stance: 'verify' },
      { label: 'B', prompt: '跑一下测试！', stance: 'continue' },
    ],
  })
  assert.equal(meta.suggestions.length, 1)
})

test('distinct prompts are kept', () => {
  const meta = metaOf()
  assert.equal(meta.suggestions.length, 3)
})

// ---------------------------------------------------------------------------
// Stance handling
// ---------------------------------------------------------------------------

test('unknown stance falls back to continue', () => {
  const meta = buildMeta({ context: 'ok', suggestions: [{ label: 'x', prompt: 'y', stance: 'later' }] })
  assert.equal(meta.suggestions[0].stance, 'continue')
})

test('explicit duplicate stances keep only the first', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '任务一', stance: 'verify' },
      { label: 'B', prompt: '任务二', stance: 'verify' },
    ],
  })
  assert.equal(meta.suggestions.length, 1)
  assert.equal(meta.suggestions[0].prompt, '任务一')
})

test('entries without a stance do not collapse each other', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '任务一' },
      { label: 'B', prompt: '任务二' },
      { label: 'C', prompt: '任务三' },
    ],
  })
  assert.equal(meta.suggestions.length, 3)
  assert.deepEqual(meta.suggestions.map((s) => s.stance), ['continue', 'continue', 'continue'])
})

test('all five stances can coexist', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: STANCES.map((stance, index) => ({ label: `L${index}`, prompt: `P${index}`, stance })),
  })
  assert.equal(meta.suggestions.length, STANCES.length)
  assert.deepEqual(new Set(meta.suggestions.map((s) => s.stance)), new Set(STANCES))
})

test('the optional stance is ordered last even when it appears first', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: '可不做', prompt: '保持现状即可。', stance: 'optional' },
      { label: '验证', prompt: '先验证一下。', stance: 'verify' },
      { label: '推进', prompt: '继续推进。', stance: 'continue' },
    ],
  })
  assert.equal(meta.suggestions.at(-1).stance, 'optional')
})

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

test('the recommended suggestion is ordered first', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '任务一', stance: 'verify' },
      { label: 'B', prompt: '任务二', stance: 'continue', recommended: true },
    ],
  })
  assert.equal(meta.suggestions[0].prompt, '任务二')
  assert.equal(meta.suggestions[0].recommended, true)
})

test('only the first recommended flag survives', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [
      { label: 'A', prompt: '任务一', stance: 'verify', recommended: true },
      { label: 'B', prompt: '任务二', stance: 'continue', recommended: true },
    ],
  })
  const recommended = meta.suggestions.filter((s) => s.recommended === true)
  assert.equal(recommended.length, 1)
  assert.equal(recommended[0].prompt, '任务一')
})

test('recommended is omitted when false', () => {
  const meta = metaOf()
  for (const suggestion of meta.suggestions) assert.equal('recommended' in suggestion, false)
})

// ---------------------------------------------------------------------------
// Danger detection
// ---------------------------------------------------------------------------

test('model danger flag marks a suggestion', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [{ label: '提交', prompt: '提交并推送', stance: 'push', danger: true }],
  })
  assert.equal(meta.suggestions[0].danger, true)
})

test('Chinese risk words mark a suggestion dangerous', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [{ label: '清理', prompt: '删除旧的构建产物并重置缓存。', stance: 'push' }],
  })
  assert.equal(meta.suggestions[0].danger, true)
})

test('English risk words mark a suggestion dangerous', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [{ label: 'Force push', prompt: 'git push --force to main', stance: 'push' }],
  })
  assert.equal(meta.suggestions[0].danger, true)
})

test('rm -rf marks a suggestion dangerous', () => {
  const meta = buildMeta({
    context: 'ok',
    suggestions: [{ label: 'Clean', prompt: 'rm -rf ./dist', stance: 'push' }],
  })
  assert.equal(meta.suggestions[0].danger, true)
})

test('safe text does not set danger', () => {
  const meta = metaOf()
  for (const suggestion of meta.suggestions) assert.equal('danger' in suggestion, false)
})

// ---------------------------------------------------------------------------
// Cap of six entries, protecting the recommendation and the optional entry
// ---------------------------------------------------------------------------

const many = (count = 8) =>
  Array.from({ length: count }, (_, index) => ({ label: `L${index}`, prompt: `任务 ${index}` }))

test('at most LIMITS.maxSuggestions suggestions survive', () => {
  const meta = buildMeta({ context: 'ok', suggestions: many(8) })
  assert.equal(meta.suggestions.length, LIMITS.maxSuggestions)
})

test('the cap keeps a late recommendation', () => {
  const suggestions = many(8)
  suggestions[7].recommended = true
  const meta = buildMeta({ context: 'ok', suggestions })
  assert.equal(meta.suggestions.length, LIMITS.maxSuggestions)
  assert.equal(meta.suggestions[0].recommended, true)
})

test('the cap keeps a late optional entry', () => {
  const suggestions = many(8)
  suggestions[7].stance = 'optional'
  const meta = buildMeta({ context: 'ok', suggestions })
  assert.equal(meta.suggestions.length, LIMITS.maxSuggestions)
  assert.equal(meta.suggestions.at(-1).stance, 'optional')
})

test('below the cap nothing is dropped', () => {
  const meta = buildMeta({ context: 'ok', suggestions: many(4) })
  assert.equal(meta.suggestions.length, 4)
})

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

test('ids are stable across calls for the same prompt', () => {
  const first = metaOf().suggestions.map((s) => s.id)
  const second = metaOf().suggestions.map((s) => s.id)
  assert.deepEqual(first, second)
})

test('ids are independent of suggestion order', () => {
  const suggestions = validArgs().suggestions
  const forward = buildMeta({ context: 'ok', suggestions })
  const backward = buildMeta({ context: 'ok', suggestions: [...suggestions].reverse() })
  assert.deepEqual(
    [...forward.suggestions.map((s) => [s.prompt, s.id])].sort(),
    [...backward.suggestions.map((s) => [s.prompt, s.id])].sort(),
  )
})

test('ids are unique within one card', () => {
  const meta = buildMeta({ context: 'ok', suggestions: many(6) })
  const ids = meta.suggestions.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('ids are short deterministic strings', () => {
  const meta = metaOf()
  for (const suggestion of meta.suggestions) {
    assert.match(suggestion.id, /^s[0-9a-z]+(?:-\d+)?$/)
  }
})

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

test('buildMeta does not mutate its input', () => {
  const input = validArgs()
  const snapshot = structuredClone(input)
  buildMeta(input)
  assert.deepEqual(input, snapshot)
})
