/**
 * Host half of `@local/dsh-next-actions`.
 *
 * Zero imports on purpose: the local install is a `link:` profile dependency,
 * so a linked package cannot resolve `@deepseek-ai/*` from its own directory.
 * `ctx.tools.register()` accepts a hand-written plain definition; `defineTool`
 * is only a builder convenience (design/next-step-suggestions-tech.md §5.1).
 *
 * Token gates (2026-11-09, P1):
 *   - the tool registration carries a per-step `when` condition that admits
 *     root agents only, so subagent requests do not pay the ~364-token
 *     tool declaration;
 *   - the plugin's Host config `enabled` (default true, read from the plugin
 *     row config because this zero-import package exports no Config schema)
 *     turns the whole feature off: no tool, no prompt section, no cost.
 */

import { buildMeta } from './lib/normalize.js'

export const name = '@local/dsh-next-actions'
export const inject = ['tools', 'systemPrompt', 'agents']

const TOOL_NAME = 'suggest_next_steps'

/**
 * Capability plus one hard display rule. Field-level quality rules live on the
 * JSON Schema descriptions (the model reads them while writing arguments), and
 * "when to call / when to skip" lives in the guidance section below — no rule is
 * repeated across prompt layers (v4, 2026-11-09).
 */
const DESCRIPTION = [
  'Show 1–3 clickable next steps as a card under your reply; clicking a suggestion fills the message input.',
  'Call it once when this turn leaves follow-up work.',
  "Write labels and prompts in the user's language.",
  'Never list the same steps in your prose.',
].join(' ')

/**
 * Durable invocation hint, separate from the tool description.
 *
 * A tool description is reference material the model may skip; a system-prompt
 * section is standing behavior. The original behaviour came from the
 * conversation itself and was lost at the first compaction — this section is
 * registered per root agent, so it survives compaction and session reload.
 *
 * v4 (2026-11-09): the trigger is a checklist of objective facts about the turn
 * the model can check itself (finished/advanced work, tools ran, files changed,
 * verification/review open, or it was about to list next steps) instead of a
 * subjective "real actions" test. The blunt "If unsure, skip" is split so a
 * substantive work turn still calls while a trivial or social turn skips.
 */
const GUIDANCE = [
  'Before your final answer, call suggest_next_steps once when this turn leaves real follow-up work:',
  'a task finished or advanced, tools ran, files changed, review or approval is due,',
  'or you were about to end with a list of next steps.',
  'Put those steps only in the card; the reply gets at most one lead-in sentence and never numbers or bullets them.',
  'Skip greetings, acknowledgements, pure knowledge answers, repeated cards, and turns that already asked a structured question.',
  'On a work turn when unsure, still call it with 2–3 safe options; on a trivial or social turn, skip.',
].join(' ')

/** Stable section name; also the dedupe key if the plugin reloads live. */
const PROMPT_SECTION = 'tool:suggest-next-steps'
/** Fallback placement when a Harness version lacks the named section order. */
const PROMPT_ORDER_FALLBACK = 2950

/**
 * Add the durable invocation hint to one agent's prompt layers.
 * @param {import('@deepseek-ai/cordis').Context} agentCtx - the agent's scoped context.
 * @returns the section disposer registered on `agentCtx`.
 */
function installGuidance(agentCtx) {
  const systemPrompt = agentCtx.systemPrompt
  const base = typeof systemPrompt.getSectionOrder === 'function'
    ? systemPrompt.getSectionOrder('TOOL_REPORT')
    : undefined
  return systemPrompt.section({
    name: PROMPT_SECTION,
    order: typeof base === 'number' ? base + 50 : PROMPT_ORDER_FALLBACK,
    text: GUIDANCE,
  })
}

/**
 * Raw JSON Schema (wire-level form). `defineTool`'s author DSL is not used, so
 * `parameters` must already be the raw schema the model sees.
 */
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['context', 'suggestions'],
  properties: {
    context: {
      type: 'string',
      description: '≤240 chars: what was completed, then the options; never restate the answer.',
    },
    suggestions: {
      type: 'array',
      description: '1–3 (max 6); distinct angles, no near-synonyms or questions.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'prompt'],
        properties: {
          label: {
            type: 'string',
            description: 'Short imperative phrase, ≤16 chars, no ending punctuation.',
          },
          prompt: {
            type: 'string',
            description: 'Message the user could send as-is (≤500 chars); cite this turn\'s files/commands/decisions; never just "continue".',
          },
          stance: {
            type: 'string',
            description: 'verify | continue | push | pivot | optional (safe to skip)',
          },
          recommended: {
            type: 'boolean',
            description: 'Exactly one: your pick.',
          },
          danger: {
            type: 'boolean',
            description: 'Only destructive/irreversible/paid/permission-changing actions; never read-only.',
          },
        },
      },
    },
  },
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shown', 'count'],
  properties: {
    shown: { type: 'boolean' },
    count: { type: 'integer' },
  },
}

const TOOL = {
  name: TOOL_NAME,
  description: DESCRIPTION,
  parameters: PARAMETERS,
  output: {
    schema: OUTPUT_SCHEMA,
    // Kept small: the suggestions live in tool/result.meta and the card, never
    // in the model-visible prose. These lines are the last instruction before
    // the model writes the final answer, so they carry the "write the answer
    // now, never re-list, never call again" contract.
    render: (_args, value) => (value?.shown
      ? [{
        type: 'text',
        text: `Next steps shown below your answer (${value.count}). Now write the final answer: do not list or number them, keep at most one lead-in sentence, and do not call this tool again this turn.`,
      }]
      : [{ type: 'text', text: 'No card shown. Answer normally; do not mention this tool.' }]),
    // Sanctioned structured-display channel: persisted as tool/result.meta and
    // replayed with the session log. The browser reads it instead of re-parsing
    // the lossy render text.
    presentationMeta: (args) => buildMeta(args),
  },
  execute(args) {
    // Pure and side-effect free: normalize, never throw. Invalid or empty
    // arguments degrade to `shown: false` with a stable note for the process row.
    const meta = buildMeta(args)
    return {
      shown: meta.shown,
      count: meta.suggestions ? meta.suggestions.length : 0,
    }
  },
}

/**
 * Host config defaults. The package exports no `Config` schema (zero imports:
 * Schemastery cannot be resolved from a linked plugin), so Cordis passes the
 * raw row config through; every value is defaulted here.
 */
const CONFIG_DEFAULTS = Object.freeze({ enabled: true })

/**
 * Normalize the raw row config. Only a literal `false` disables the feature,
 * so a missing, empty, or malformed config keeps it on.
 * @param raw - config passed by the Loader for this plugin row.
 * @returns the normalized config.
 */
export function normalizeConfig(raw) {
  const enabled = raw === undefined || raw === null || typeof raw !== 'object'
    ? CONFIG_DEFAULTS.enabled
    : raw.enabled !== false
  return { enabled }
}

/**
 * Whether one step's agent is a root conversation.
 *
 * The card is hidden in subagent sessions, so a subagent step must not pay the
 * tool declaration or see a callable tool its transcript never renders. Runs
 * once per model step; unknown agents and a missing registry fail open so a
 * Harness change can never silently disable the feature.
 * @param ctx - owning plugin context.
 * @param agent - the step's agent.
 * @returns whether this agent keeps the tool.
 */
function isRootAgent(ctx, agent) {
  if (agent === undefined || agent === null) return true
  try {
    return ctx.agents.roots().includes(agent)
  } catch {
    return true
  }
}

/**
 * Register the tool for the lifetime of the plugin row, plus one durable
 * prompt section per root agent. A disabled Host config returns before either
 * registration, so a turned-off feature costs no prompt tokens at all.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning plugin context.
 * @param config - raw plugin row config; see {@link normalizeConfig}.
 */
export function apply(ctx, config) {
  const { enabled } = normalizeConfig(config)
  if (!enabled) return

  ctx.effect(
    () => ctx.tools.register(TOOL, { when: ({ agent }) => isRootAgent(ctx, agent) }),
    'dsh-next-actions: tool',
  )

  /** agent → disposer of that agent's guidance effect. */
  const guidance = new Map()

  /**
   * Install the hint once for a root agent.
   * Root agents only: the card is hidden in subagent sessions, so spending
   * prompt tokens there would only teach subagents to call a visual tool their
   * transcript never shows.
   * @param agent - agent announced through `agent/created`.
   */
  const installFor = (agent) => {
    if (guidance.has(agent)) return
    try {
      if (!ctx.agents.roots().includes(agent)) return
      const dispose = agent.ctx.effect(
        () => installGuidance(agent.ctx),
        'dsh-next-actions: guidance',
      )
      guidance.set(agent, dispose)
    } catch {
      // The hint is an enhancement: a Harness version change must not cost the
      // tool itself, so a failed section registration is ignored.
    }
  }

  ctx.effect(() => {
    const offCreated = ctx.on('agent/created', ({ agent }) => installFor(agent))
    const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
      guidance.delete(agent)
    })
    // Agents created before this plugin loaded (live profile reload) still need
    // the hint; `roots()` excludes subagents. A registry that cannot answer
    // must not fail the plugin (the tool registration gates itself separately).
    try {
      for (const agent of ctx.agents.roots()) installFor(agent)
    } catch {
      // Guidance is an enhancement; the tool stays registered.
    }
    return () => {
      offCreated()
      offDisposed()
      for (const dispose of guidance.values()) {
        try {
          dispose()
        } catch {
          // Agent disposal may already have removed the layer.
        }
      }
      guidance.clear()
    }
  }, 'dsh-next-actions: guidance')
}

/** Test seam: the exact definition registered with the tool registry. */
export const __definition = TOOL
/** Test seam: the exact prompt text and section id used for guidance. */
export const __guidance = { section: PROMPT_SECTION, text: GUIDANCE }
/** Test seam: config defaults and normalization used by `apply`. */
export const __config = { defaults: CONFIG_DEFAULTS, normalize: normalizeConfig }
/** Test seam: the root-agent gate installed on the tool registration. */
export const __when = isRootAgent
