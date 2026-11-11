/**
 * Host half of `@local/dsh-next-actions`.
 *
 * Registers the `suggest_next_actions` tool for root agents plus one standing
 * prompt section that tells the model when to call it. Zero imports: the
 * package is installed with `link:` and cannot resolve `@deepseek-ai/*`.
 * Row config `enabled: false` registers nothing, so the feature costs no tokens.
 */

import { buildMeta, LIMITS } from './lib/normalize.js'

export const name = '@local/dsh-next-actions'
export const inject = ['tools', 'systemPrompt', 'agents']

const TOOL_NAME = 'suggest_next_actions'

const GUIDANCE = [
  'Before your final answer, call suggest_next_actions once when this turn leaves real follow-up work:',
  'a task finished or advanced, tools ran, files changed, review or approval is due,',
  'or you were about to end with a list of next actions.',
  'Put those actions only in the card; the reply gets at most one lead-in sentence and never numbers or bullets them.',
  'Skip greetings, acknowledgements, pure knowledge answers, repeated cards, and turns that already asked a structured question.',
].join(' ')

const PROMPT_SECTION = 'tool:suggest-next-actions'

const TOOL = {
  name: TOOL_NAME,
  description: [
    'Show 1–3 clickable next actions as a card under your reply; clicking one fills the message input, never sends.',
    "Write them in the user's language and never repeat them in your prose.",
  ].join(' '),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['context', 'suggestions'],
    properties: {
      context: {
        type: 'string',
        description: 'One or two sentences (≤240 chars): what was just done and why these actions follow. Never restate the answer.',
      },
      suggestions: {
        type: 'array',
        description: '1–3 distinct next actions, most useful first.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'prompt'],
          properties: {
            label: { type: 'string', description: `Short imperative button text, ≤${LIMITS.label} chars, no ending punctuation.` },
            prompt: { type: 'string', description: "Message the user could send as-is (≤500 chars), citing this turn's files, commands or decisions." },
            recommended: { type: 'boolean', description: 'At most one: your pick when one action is clearly best.' },
            danger: { type: 'boolean', description: 'True only for destructive, irreversible, paid or permission-changing actions.' },
          },
        },
      },
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['shown', 'count'],
      properties: { shown: { type: 'boolean' }, count: { type: 'integer' } },
    },
    render: (_args, value) => [{
      type: 'text',
      text: value?.shown
        ? `Next actions shown below your answer (${value.count}). Now write the final answer: do not list them, keep at most one lead-in sentence, and do not call this tool again this turn.`
        : 'No card shown. Answer normally; do not mention this tool.',
    }],
    // Persisted as tool/result.meta; the browser renders the card from it.
    presentationMeta: (args) => buildMeta(args),
  },
  execute(args) {
    const meta = buildMeta(args)
    return { shown: meta.shown, count: meta.shown ? meta.suggestions.length : 0 }
  },
}

/** Only a literal `enabled: false` turns the feature off. */
export function normalizeConfig(raw) {
  return { enabled: !(raw !== null && typeof raw === 'object' && raw.enabled === false) }
}

/** Root agents only; fail open so a Harness change never silently hides the tool. */
function isRoot(ctx, agent) {
  if (agent === undefined || agent === null) return true
  try {
    return ctx.agents.roots().includes(agent)
  } catch {
    return true
  }
}

export function apply(ctx, config) {
  if (!normalizeConfig(config).enabled) return

  ctx.effect(
    () => ctx.tools.register(TOOL, { when: ({ agent }) => isRoot(ctx, agent) }),
    'dsh-next-actions: tool',
  )

  /** agent → disposer of its prompt section. */
  const installed = new Map()
  const install = (agent) => {
    if (installed.has(agent)) return
    try {
      if (!ctx.agents.roots().includes(agent)) return
      const prompt = agent.ctx.systemPrompt
      const base = prompt.getSectionOrder?.('TOOL_REPORT')
      installed.set(agent, agent.ctx.effect(() => prompt.section({
        name: PROMPT_SECTION,
        order: typeof base === 'number' ? base + 50 : 2950,
        text: GUIDANCE,
      }), 'dsh-next-actions: guidance'))
    } catch {
      // The guidance is an enhancement; the tool stays registered.
    }
  }

  ctx.effect(() => {
    const offCreated = ctx.on('agent/created', ({ agent }) => install(agent))
    const offDisposed = ctx.on('agent/disposed', ({ agent }) => installed.delete(agent))
    try {
      for (const agent of ctx.agents.roots()) install(agent)
    } catch {
      // Agents created later still arrive through agent/created.
    }
    return () => {
      offCreated()
      offDisposed()
      for (const dispose of installed.values()) {
        try {
          dispose()
        } catch {
          // The agent may already be gone.
        }
      }
      installed.clear()
    }
  }, 'dsh-next-actions: guidance')
}

/** Test seams. */
export const __definition = TOOL
export const __guidance = { section: PROMPT_SECTION, text: GUIDANCE }
