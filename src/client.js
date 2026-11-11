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

    /* @inline:normalize */

    /* @inline:styles */

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
