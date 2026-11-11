/**
 * Browser half of @local/dsh-next-actions (template).
 *
 * - A Conversation Definition folds this tool's events into
 *   `turn.data.get('next-steps')`: native `tool/call` + `tool/result.meta`, and
 *   PTC (`run_code`) `tool/ptc-dispatch` records, whose turn is only known
 *   through the outer `run_code` call.
 * - A `conversation.chat.turnTail` entry renders the card for the latest turn
 *   only; clicking a suggestion fills the composer and never sends.
 * - A `tool.call.toolview` entry renders the one-line process row.
 *
 * External plugins must not require Harness Client packages, so the markup and
 * CSS follow the official action card with renamed `dshns-` classes and theme
 * tokens only. scripts/build-client.mjs inlines lib/normalize.js and
 * src/styles.js at the markers and writes client.js.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-next-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
 * Normalize `suggest_next_steps` arguments into the card model.
 *
 * Shared by both halves: the Host persists the result as `tool/result.meta`,
 * and the browser bundle inlines this file to re-read that meta (or the raw
 * arguments when compaction dropped it). Import-free and side-effect-free.
 */

const LIMITS = Object.freeze({ suggestions: 3, context: 240, label: 24, prompt: 500 })

/** A hit marks a suggestion as needing confirmation; clicking still only fills the input. */
const RISK = /\brm\s+-rf\b|\bforce[- ]?push\b|--force\b|\bdrop\s+(table|database)\b|\bsudo\b|\bdeploy\b|\bpublish\b|\bproduction\b|删除|清空|重置|强制推送|强推|发布|部署|上线|付费|支付|授权|卸载|回滚|销毁/i

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

function clip(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * @param {unknown} raw - tool arguments (object or JSON string), or a persisted meta.
 * @returns {{ shown: true, context: string, suggestions: { label: string, prompt: string, danger?: true }[] } | { shown: false, note: string }}
 */
function buildMeta(raw) {
  let args = raw
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      args = null
    }
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return { shown: false, note: 'invalid-arguments' }

  const context = clip(text(args.context), LIMITS.context)
  if (context === '') return { shown: false, note: 'missing-context' }

  const seen = new Set()
  const suggestions = []
  for (const item of Array.isArray(args.suggestions) ? args.suggestions : []) {
    if (item === null || typeof item !== 'object') continue
    const prompt = clip(text(item.prompt) || text(item.label), LIMITS.prompt)
    const key = prompt.toLowerCase()
    if (prompt === '' || seen.has(key)) continue
    seen.add(key)
    const label = clip(text(item.label) || prompt, LIMITS.label)
    suggestions.push(item.danger === true || RISK.test(`${label}\n${prompt}`)
      ? { label, prompt, danger: true }
      : { label, prompt })
    if (suggestions.length === LIMITS.suggestions) break
  }
  if (suggestions.length === 0) return { shown: false, note: 'no-usable-suggestions' }
  return { shown: true, context, suggestions }
}

    /**
 * Card and process-row CSS. Frame values follow the official DSH action card
 * and propose_action row; classes use the `dshns-` prefix and only theme tokens.
 */
const STYLES = `
.dshns-reveal {
  display: grid;
  grid-template-rows: 1fr;
  margin: 16px 0;
  animation: dshns-reveal .22s cubic-bezier(.4, 0, .2, 1) both;
}
.dshns-reveal > * { min-height: 0; }
@keyframes dshns-reveal { from { grid-template-rows: 0fr; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dshns-reveal { animation: none; } }
.dshns-card {
  overflow: hidden;
  padding: 14px 20px 16px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dshns-context {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.dshns-mark { display: inline-block; vertical-align: -3px; margin-right: 6px; }
.dshns-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.dshns-chip {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  height: 32px;
  padding: 0 12px;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.dshns-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshns-chip:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dshns-chip:disabled { cursor: not-allowed; opacity: .4; }
.dshns-chip:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dshns-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshns-warn { flex: none; color: color-mix(in srgb, var(--dsw-alias-state-warn-label) 65%, var(--dsw-alias-label-primary)); }
.dshns-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
}
.dshns-row > svg { flex: none; }
.dshns-row-title { flex: none; font-size: var(--dsh-content-font-size-secondary, 13px); }
.dshns-row-summary { min-width: 0; margin-left: 2px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`

    const PKG = '@local/dsh-next-actions'
    const NS = 'nextSteps'
    const TOOL_NAME = 'suggest_next_steps'
    const RUN_CODE = 'run_code'
    const KEY = 'next-steps'

    const EN = Object.freeze({
      'card.title': 'Suggested next steps',
      'chip.danger': 'Needs confirmation',
      'row.title': 'Next steps',
      'row.running': 'Writing',
      'row.ok': 'Shown',
      'row.error': 'Not shown',
    })
    const ZH = Object.freeze({
      'card.title': '下一步建议',
      'chip.danger': '需确认',
      'row.title': '下一步建议',
      'row.running': '正在生成',
      'row.ok': '已生成',
      'row.error': '未显示',
    })

    // -----------------------------------------------------------------------
    // Data: fold this tool's events into turn data
    // -----------------------------------------------------------------------

    /** A persisted meta with a boolean `shown` is authoritative; otherwise use the arguments. */
    function modelOf(meta, args) {
      const source = meta !== null && typeof meta === 'object' && typeof meta.shown === 'boolean'
        ? (meta.shown ? meta : null)
        : args
      if (source === null || source === undefined) return null
      const model = buildMeta(source)
      return model.shown ? model : null
    }

    /** run_code callId → turn; PTC dispatch records carry no turn themselves. */
    const runCodeTurns = new Map()
    const ptcTurn = (data) => runCodeTurns.get(data.rootCallId ?? data.parentCallId)
    const turnId = (turn) => (Number.isSafeInteger(turn) && turn >= 0 ? String(turn) : null)
    const route = (turn, role) => {
      const id = turnId(turn)
      return id === null ? null : { id, role }
    }

    function matchTurn(match) {
      const location = match.location
      const turn = location?.kind === 'turn' || location?.kind === 'step' ? location.turn?.turn : undefined
      return Number.isSafeInteger(turn) ? turn : match.event?.data?.turn
    }

    const definition = {
      kind: KEY,
      match(event) {
        const data = event.data
        switch (event.type) {
          case 'turn/start':
            return route(data.turn, 'start')
          case 'tool/call':
            if (data.name === RUN_CODE && typeof data.callId === 'string' && turnId(data.turn) !== null) {
              if (runCodeTurns.size >= 1024) runCodeTurns.delete(runCodeTurns.keys().next().value)
              runCodeTurns.set(data.callId, data.turn)
            }
            return data.name === TOOL_NAME ? route(data.turn, 'update') : null
          case 'tool/result':
            // Replacement copies of a result must not re-publish the card.
            return event.surfaceOp === 'append' ? route(data.turn, 'update') : null
          case 'tool/ptc-dispatch-start':
            return data.name === TOOL_NAME ? route(ptcTurn(data), 'start') : null
          case 'tool/ptc-dispatch':
            return data.name === TOOL_NAME ? route(ptcTurn(data), 'update') : null
          default:
            return null
        }
      },
      start(context, match) {
        const state = { turn: matchTurn(match), args: new Map(), model: null }
        return match.event.type === 'turn/start' ? state : definition.update({ state }, match)
      },
      update({ state }, { event }) {
        const data = event.data
        if (event.type === 'tool/call' && data.name === TOOL_NAME) {
          return { ...state, args: new Map(state.args).set(String(data.callId), data.arguments) }
        }
        let model = null
        if (event.type === 'tool/result' && event.surfaceOp === 'append') {
          const message = data.message
          if (message === undefined || message.isError === true) return state
          const callId = String(message.source?.callId ?? message.toolCallId ?? '')
          if (!state.args.has(callId)) return state
          model = modelOf(data.meta, state.args.get(callId))
        } else if (event.type === 'tool/ptc-dispatch' && data.isError !== true) {
          model = modelOf(data.meta, data.arguments)
        }
        return model === null ? state : { ...state, model }
      },
      buildLocationData({ state }, scope, previous) {
        if (scope !== 'turn' || state?.model == null || turnId(state.turn) === null) return null
        if (previous?.key === KEY && previous.turn === state.turn && previous.value.model === state.model) return previous
        return { kind: 'turn', turn: state.turn, key: KEY, value: { model: state.model } }
      },
    }

    // -----------------------------------------------------------------------
    // Card
    // -----------------------------------------------------------------------

    /** Empty drafts and drafts the card wrote itself are replaced; anything else gets the step added. */
    function fillMode(draft, owned) {
      return draft.trim() === '' || draft === owned ? 'replace' : 'insert'
    }

    let sharedCtx = null

    function fill(actions, draft, owned, prompt, sessionId) {
      let next = prompt
      if (fillMode(draft, owned) === 'insert') {
        next = null
        try {
          // One editor edit at the caret: keeps @ references, undoable with ⌘Z.
          if (actions.insertText(`\n\n${prompt}`, actions.captureInsertion()) !== true) next = `${draft.trimEnd()}\n\n${prompt}`
        } catch {
          next = `${draft.trimEnd()}\n\n${prompt}`
        }
      }
      if (next !== null) actions.setDraft(next)
      try {
        sharedCtx?.get?.('conversation')?.input?.shell?.(sessionId)?.focus?.()
      } catch {
        // Focus is a convenience; the draft is already filled.
      }
      return next === prompt ? prompt : null
    }

    function Mark() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 36 36', fill: 'none', className: 'dshns-mark', 'aria-hidden': 'true' },
        h('g', { transform: 'translate(-1.5 0.5)' },
          h('rect', { x: 5, y: 7.6, width: 21, height: 5.4, rx: 2.7, fill: '#5E9DF5' }),
          h('rect', { x: 5, y: 15.3, width: 16, height: 5.4, rx: 2.7, fill: '#7AAEFF' }),
          h('rect', { x: 5, y: 23, width: 11, height: 5.4, rx: 2.7, fill: '#9CC3FF' }),
          h('path', { d: 'M29.6 6.6C29.88 8.65 31.25 10.02 33.3 10.3C31.25 10.58 29.88 11.95 29.6 14C29.32 11.95 27.95 10.58 25.9 10.3C27.95 10.02 29.32 8.65 29.6 6.6Z', fill: '#41E1AC' })))
    }

    function WarnIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshns-warn', 'aria-hidden': 'true' },
        h('path', { d: 'M8 1.8 14.6 13.2H1.4L8 1.8Z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        h('path', { d: 'M8 6v3.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 11.4, r: 0.7, fill: 'currentColor' }))
    }

    function NextStepsCard({ turn, inputActions, useInput, useChat, useSession, sessionId, t }) {
      const ownedRef = React.useRef(null)
      const draft = useInput?.((state) => state?.draft ?? '') ?? ''
      const latest = useChat?.((snapshot) => snapshot?.timeline?.turnOrder?.at(-1))
      const subagent = useSession?.((state) => state?.subagent ?? null)

      const model = turn?.end === undefined ? undefined : turn.data?.get(KEY)?.model
      const closing = turn?.data?.get('turn-tail')?.closing
      // Suggestions only make sense right after the answer they follow.
      if (!model || !closing || subagent || (latest !== undefined && latest !== turn.turn)) return null

      const canWrite = typeof inputActions?.setDraft === 'function'
      return h('div', { className: 'dshns-reveal' },
        h('section', { className: 'dshns-card', 'aria-label': t('card.title') },
          h('p', { className: 'dshns-context' }, h(Mark), model.context),
          h('div', { className: 'dshns-chips' },
            model.suggestions.map((suggestion, index) => h('button', {
              key: index,
              type: 'button',
              className: 'dshns-chip',
              disabled: !canWrite,
              title: suggestion.prompt,
              'aria-label': suggestion.danger
                ? `${suggestion.label}（${t('chip.danger')}）：${suggestion.prompt}`
                : `${suggestion.label}：${suggestion.prompt}`,
              onClick: () => {
                ownedRef.current = fill(inputActions, draft, ownedRef.current, suggestion.prompt, sessionId)
              },
            },
            suggestion.danger ? h(WarnIcon) : null,
            h('span', { className: 'dshns-chip-label' }, suggestion.label))))))
    }

    // -----------------------------------------------------------------------
    // Process row (one line in the tool group, like the official propose_action row)
    // -----------------------------------------------------------------------

    function rowState(phase, block) {
      if (phase === 'preparing' || phase === 'start') return 'running'
      if (block?.isError === true || block?.error !== undefined) return 'error'
      return block?.meta?.shown === false ? 'error' : 'ok'
    }

    function ProcessRow({ phase, block, t }) {
      const state = rowState(phase, block)
      const count = state === 'ok' && Array.isArray(block?.meta?.suggestions) ? block.meta.suggestions.length : 0
      return h('div', { className: 'dshns-row', 'data-tool': TOOL_NAME, 'data-state': state, title: block?.meta?.note },
        h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': 'true' },
          h('rect', { x: 2.25, y: 2.25, width: 4, height: 4, rx: 1 }),
          h('rect', { x: 2.25, y: 9.75, width: 4, height: 4, rx: 1 }),
          h('rect', { x: 9.75, y: 9.75, width: 4, height: 4, rx: 1 }),
          h('path', { d: 'M11.75 1.75v5M9.25 4.25h5' })),
        h('span', { className: 'dshns-row-title' }, t('row.title')),
        h('span', { className: 'dshns-row-summary' }, count > 0 ? `${t(`row.${state}`)} · ${count}` : t(`row.${state}`)))
    }

    // -----------------------------------------------------------------------
    // Plugin entry
    // -----------------------------------------------------------------------

    function apply(ctx) {
      sharedCtx = ctx
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-next-actions: locale')
      ctx.effect(() => {
        const element = document.createElement('style')
        element.dataset.plugin = PKG
        element.textContent = STYLES
        document.head.appendChild(element)
        return () => element.remove()
      }, 'dsh-next-actions: styles')
      ctx.effect(() => ctx.uiConversation.events.register(definition), 'dsh-next-actions: definition')
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail', id: PKG, order: -10, locale: NS,
      }, NextStepsCard))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key: TOOL_NAME, locale: NS,
      }, ProcessRow))
    }

    return {
      // `uiConversation` is injected so the definition registers on a cold boot.
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      __test: { definition, modelOf, fillMode, fill, rowState },
    }
  },
})
