import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, inject, name, normalizeConfig, __definition, __guidance, __config } from '../index.js'
import { buildMeta } from '../lib/normalize.js'

const validArgs = () => ({
  context: '改动已完成，改动集中在 src/api。',
  suggestions: [
    { label: '跑一下测试', prompt: '跑一下测试，只跑 src/api 相关用例。', stance: 'verify' },
    { label: '加回归用例', prompt: '补一条针对边界值的回归用例。', stance: 'continue' },
    { label: '看改动', prompt: '看一下本次改动的完整 diff。', stance: 'push' },
  ],
})

/** Minimal per-agent Cordis context fake: records prompt sections + disposal. */
function agentFake({ order = 2900 } = {}) {
  const sections = []
  const agentCtx = {
    effect(fn) {
      const cleanup = fn()
      return () => {
        if (typeof cleanup === 'function') cleanup()
      }
    },
    systemPrompt: {
      getSectionOrder: () => (order === undefined ? undefined : order),
      section(section) {
        sections.push(section)
        return () => {
          section.disposed = true
        }
      },
    },
  }
  return { ctx: agentCtx, sections }
}

/** Minimal Cordis plugin context fake: records effects, events, registry, and apply config. */
function mount({ roots: seed = [], config: passedConfig, rootsError = false } = {}) {
  const events = []
  const cleanups = []
  const handlers = new Map()
  const registrations = []
  const roots = [...seed]
  const ctx = {
    effect(fn, label) {
      events.push(`effect:${label}`)
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => {
        if (typeof cleanup === 'function') cleanup()
      }
    },
    on(name, handler) {
      handlers.set(name, handler)
      events.push(`on:${name}`)
      return () => handlers.delete(name)
    },
    tools: {
      register(definition, options) {
        events.push(`register:${definition.name}`)
        registrations.push({ definition, options })
        return () => {}
      },
    },
    agents: {
      roots: () => {
        if (rootsError) throw new Error('registry unavailable')
        return roots
      },
    },
  }
  apply(ctx, passedConfig)
  return {
    ctx,
    events,
    registrations,
    roots,
    /** Register an agent and deliver its creation event, as the registry does. */
    announce(agent) {
      roots.push(agent)
      handlers.get('agent/created')?.({ agent })
    },
    /** Deliver a creation event for an agent the registry does not treat as a root. */
    announceNonRoot(agent) {
      handlers.get('agent/created')?.({ agent })
    },
    disposeAgent(agent) {
      handlers.get('agent/disposed')?.({ agent })
    },
    /** Run the plugin-context cleanup, as plugin unload does. */
    disposePlugin() {
      for (const cleanup of cleanups.splice(0)) cleanup()
    },
  }
}

test('plugin exports name and service injection', () => {
  assert.equal(name, '@local/dsh-next-actions')
  assert.deepEqual(inject, ['tools', 'systemPrompt', 'agents'])
})

test('apply registers the tool inside its own effect', () => {
  const { events } = mount()
  assert.equal(events[0], 'effect:dsh-next-actions: tool')
  assert.equal(events[1], 'register:suggest_next_steps')
})

test('tool registration admits root agents only, once per model step', () => {
  const root = { name: 'root' }
  const subagent = { name: 'subagent' }
  const mounted = mount({ roots: [root] })
  assert.equal(mounted.registrations.length, 1)
  const { when } = mounted.registrations[0].options
  assert.equal(typeof when, 'function')
  assert.equal(when({ agent: root }), true)
  assert.equal(when({ agent: subagent }), false)
  // Unknown agents keep the tool (fail open) instead of silently hiding it.
  assert.equal(when({}), true)
  assert.equal(when({ agent: undefined }), true)
})

test('a broken root registry keeps the tool available', () => {
  const mounted = mount({ rootsError: true })
  const { when } = mounted.registrations[0].options
  assert.equal(when({ agent: { name: 'anything' } }), true)
})

test('Host config enabled=false registers neither the tool nor the guidance', () => {
  const agent = agentFake()
  const mounted = mount({ config: { enabled: false } })
  assert.deepEqual(mounted.events, [])
  assert.equal(mounted.registrations.length, 0)
  mounted.announce(agent)
  assert.equal(agent.sections.length, 0)
})

test('Host config defaults and malformed values keep the feature on', () => {
  for (const config of [undefined, null, {}, { enabled: true }, { enabled: 'no' }, { enabled: 0 }, { enabled: null }]) {
    const mounted = mount({ config })
    assert.equal(mounted.registrations.length, 1, `expected registration for ${JSON.stringify(config)}`)
  }
  assert.deepEqual(normalizeConfig(undefined), { enabled: true })
  assert.deepEqual(normalizeConfig({ enabled: false }), { enabled: false })
  assert.deepEqual(__config.normalize({ enabled: false }), { enabled: false })
  assert.equal(__config.defaults.enabled, true)
})

test('registered definition is the exported test seam', () => {
  assert.equal(__definition.name, 'suggest_next_steps')
  assert.ok(__definition.description.length > 0)
})

test('description states the capability and display rules only', () => {
  const description = __definition.description
  assert.match(description, /clickable next steps as a card/i)
  assert.match(description, /clicking a suggestion fills the message input/i)
  assert.match(description, /once when this turn leaves follow-up work/i)
  assert.match(description, /user's language/i)
  assert.match(description, /never list the same steps in your prose/i)
  // Layer ownership (v4): field-level rules belong to the JSON Schema, so the
  // description must not re-state them.
  assert.doesNotMatch(description, /recommended|danger|stance|≤500|max 6/i)
})

test('schema descriptions carry the field-level quality rules', () => {
  const properties = __definition.parameters.properties
  assert.match(properties.context.description, /≤120 chars/)
  assert.match(properties.context.description, /never restate the answer/i)
  assert.match(properties.suggestions.description, /1–3 \(max 6\)/i)
  assert.match(properties.suggestions.description, /distinct angles/i)
  const fields = properties.suggestions.items.properties
  assert.match(fields.label.description, /imperative phrase/i)
  assert.match(fields.label.description, /≤16 chars/)
  assert.match(fields.prompt.description, /send as-is/i)
  assert.match(fields.prompt.description, /≤500 chars/)
  assert.match(fields.prompt.description, /never just "continue"/i)
  for (const stance of ['verify', 'continue', 'push', 'pivot', 'optional']) {
    assert.match(fields.stance.description, new RegExp(stance, 'i'))
  }
  assert.match(fields.recommended.description, /exactly one/i)
  assert.match(fields.danger.description, /read-only/i)
  assert.match(fields.danger.description, /permission-changing/i)
})

test('parameters are a raw object JSON Schema', () => {
  const parameters = __definition.parameters
  assert.equal(parameters.type, 'object')
  assert.equal(parameters.additionalProperties, false)
  assert.deepEqual(parameters.required, ['context', 'suggestions'])
  assert.equal(parameters.properties.context.type, 'string')
  assert.equal(parameters.properties.suggestions.type, 'array')
  const item = parameters.properties.suggestions.items
  assert.equal(item.type, 'object')
  assert.deepEqual(item.required, ['label', 'prompt'])
  assert.equal(item.properties.label.type, 'string')
  assert.equal(item.properties.prompt.type, 'string')
  assert.equal(item.properties.stance.type, 'string')
  assert.equal(item.properties.recommended.type, 'boolean')
  assert.equal(item.properties.danger.type, 'boolean')
})

test('output schema and render functions exist', () => {
  assert.equal(typeof __definition.output.render, 'function')
  assert.equal(typeof __definition.output.presentationMeta, 'function')
  assert.equal(__definition.output.schema.type, 'object')
  assert.deepEqual(__definition.output.schema.required, ['shown', 'count'])
  assert.equal(__definition.output.schema.properties.shown.type, 'boolean')
  assert.equal(__definition.output.schema.properties.count.type, 'integer')
})

test('execute reduces valid arguments to shown/count only', () => {
  const value = __definition.execute(validArgs())
  assert.deepEqual(value, { shown: true, count: 3 })
})

test('execute degrades invalid arguments without throwing', () => {
  for (const args of [null, undefined, 42, [], 'bad', {}, { context: '', suggestions: [] }]) {
    const value = __definition.execute(args)
    assert.equal(typeof value.shown, 'boolean')
    assert.equal(typeof value.count, 'number')
    assert.equal(value.shown, false)
    assert.equal(value.count, 0)
  }
})

test('render confirms the card and tells the model to write the final answer', () => {
  const content = __definition.output.render(validArgs(), { shown: true, count: 3 })
  assert.deepEqual(content, [{
    type: 'text',
    text: 'Next steps shown below your answer (3). Now write the final answer: do not list or number them, keep at most one lead-in sentence, and do not call this tool again this turn.',
  }])
})

test('render for no card asks for a normal answer', () => {
  const content = __definition.output.render({}, { shown: false, count: 0 })
  assert.deepEqual(content, [{ type: 'text', text: 'No card shown. Answer normally; do not mention this tool.' }])
})

test('presentationMeta returns the same meta buildMeta produces', () => {
  const args = validArgs()
  assert.deepEqual(__definition.output.presentationMeta(args), buildMeta(args))
  assert.deepEqual(__definition.output.presentationMeta({}), buildMeta({}))
})

test('presentationMeta never throws and always carries a boolean shown', () => {
  for (const args of [null, 42, {}, { context: 'ok', suggestions: [] }, { context: 'ok', suggestions: [{ label: 'x', prompt: 'y' }] }]) {
    const meta = __definition.output.presentationMeta(args)
    assert.equal(typeof meta.shown, 'boolean')
  }
})

test('execute count agrees with presentationMeta suggestion count', () => {
  const args = validArgs()
  const value = __definition.execute(args)
  const meta = __definition.output.presentationMeta(args)
  assert.equal(value.shown, meta.shown)
  assert.equal(value.count, meta.suggestions?.length ?? 0)
})

test('definition is a plain object with no conditional registration', () => {
  assert.equal(Object.hasOwn(__definition, 'when'), false)
  assert.equal(Object.hasOwn(__definition, 'timeoutMs'), false)
})

// ---------------------------------------------------------------------------
// Durable prompt guidance
// ---------------------------------------------------------------------------

test('guidance is a standing instruction, not a restatement of the JSON rules', () => {
  assert.equal(__guidance.section, 'tool:suggest-next-steps')
  assert.match(__guidance.text, /suggest_next_steps/)
  assert.match(__guidance.text, /before your final answer/i)
  assert.match(__guidance.text, /only in the card/i)
  // Layer ownership (v4): argument-shape rules belong to the JSON Schema, not
  // to the standing behaviour section.
  assert.doesNotMatch(__guidance.text, /≤|max 6|exactly one|recommended|danger/i)
})

test('guidance checks objective facts about the turn, not a vague "real actions" test', () => {
  const text = __guidance.text
  assert.match(text, /a task finished or advanced, tools ran, files changed/i)
  assert.match(text, /review or approval is due/i)
  assert.match(text, /Skip greetings, acknowledgements, pure knowledge answers/i)
})

test('guidance splits uncertainty: work turns call, social turns skip', () => {
  const text = __guidance.text
  assert.match(text, /On a work turn when unsure, still call it with 2–3 safe options/i)
  assert.match(text, /trivial or social turn, skip/i)
  // Regression guard: the previous blunt "If unsure, skip" suppressed real
  // work turns, so it must not come back.
  assert.doesNotMatch(text, /If unsure, skip/i)
  // Regression guard: the first version asked for a call on every substantive
  // reply, which made greetings and pure Q&A noisy.
  assert.doesNotMatch(text, /every substantive/i)
})

test('guidance silences duplicate and already-structured turns', () => {
  const text = __guidance.text
  assert.match(text, /repeated cards/i)
  assert.match(text, /turns that already asked a structured question/i)
})

test('guidance keeps a reply that is itself a list of next steps on the card', () => {
  const text = __guidance.text
  assert.match(text, /about to end with a list of next steps/i)
  assert.match(text, /at most one lead-in sentence/i)
  assert.match(text, /never numbers or bullets them/i)
})

test('a root agent announced after load gets exactly one section', () => {
  const agent = agentFake()
  const mounted = mount()
  mounted.announce(agent)
  assert.equal(agent.sections.length, 1)
  const [section] = agent.sections
  assert.equal(section.name, __guidance.section)
  assert.equal(section.text, __guidance.text)
  assert.equal(section.order, 2950) // TOOL_REPORT (2900) + 50
})

test('announcing the same root twice does not duplicate the section', () => {
  const agent = agentFake()
  const mounted = mount()
  mounted.announce(agent)
  mounted.announce(agent)
  assert.equal(agent.sections.length, 1)
})

test('root agents alive before the plugin loads get the section immediately', () => {
  const agent = agentFake()
  const mounted = mount({ roots: [agent] })
  assert.equal(agent.sections.length, 1)
  assert.equal(mounted.events.includes('on:agent/created'), true)
})

test('subagents never get the section', () => {
  const agent = agentFake()
  const mounted = mount()
  mounted.announceNonRoot(agent)
  assert.equal(agent.sections.length, 0)
})

test('missing TOOL_REPORT order falls back to the stable slot', () => {
  const agent = agentFake({ order: undefined })
  const mounted = mount()
  mounted.announce(agent)
  assert.equal(agent.sections[0].order, 2950)
})

test('plugin teardown disposes every installed section', () => {
  const agent = agentFake()
  const mounted = mount({ roots: [agent] })
  assert.equal(agent.sections[0].disposed, undefined)
  mounted.disposePlugin()
  assert.equal(agent.sections[0].disposed, true)
})

test('agent disposal drops the tracked disposer', () => {
  const agent = agentFake()
  const mounted = mount({ roots: [agent] })
  mounted.disposeAgent(agent)
  // Sections are owned by the agent context; the plugin stops tracking them.
  assert.equal(agent.sections.length, 1)
})
