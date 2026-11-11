/**
 * Browser half of @local/dsh-next-actions (template).
 *
 * - A Conversation Definition folds this tool's events into
 *   `turn.data.get('next-actions')`: native `tool/call` + `tool/result.meta`, and
 *   PTC (`run_code`) `tool/ptc-dispatch` records, whose turn is only known
 *   through the outer `run_code` call.
 * - A `conversation.chat.turnTail` entry renders the card under every turn
 *   that produced one; clicking a suggestion fills the composer and never
 *   sends. A chip whose prompt the next user message sent as-is gets a check;
 *   one sent with edits gets a pencil. Both come from the session log.
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
    const TOOL_NAME = 'suggest_next_actions'
    const RUN_CODE = 'run_code'
    const KEY = 'next-actions'

    const EN = Object.freeze({
      'card.title': 'Suggested next steps',
      'chip.recommended': 'Recommended',
      'chip.danger': 'Needs confirmation',
      'chip.sent': 'Sent',
      'chip.edited': 'Sent with edits',
      'row.title': 'Next steps',
      'row.running': 'Writing',
      'row.ok': 'Shown',
      'row.error': 'Not shown',
    })
    const ZH = Object.freeze({
      'card.title': '下一步建议',
      'chip.recommended': '推荐',
      'chip.danger': '需确认',
      'chip.sent': '已发送',
      'chip.edited': '改后发送',
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

    /** Turn opened by the latest `turn/start`; a user/message names no turn itself. */
    let openTurn = null

    /** Plain text of a message's content blocks. */
    function textOf(content) {
      if (typeof content === 'string') return content
      if (!Array.isArray(content)) return ''
      return content.map((block) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('')
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
            openTurn = turnId(data.turn) === null ? null : data.turn
            return route(data.turn, 'start')
          case 'user/message':
            // What the human sent is the record of which suggestion they used.
            return event.surfaceOp === 'append' && data.source?.kind === 'user' && openTurn !== null
              ? route(openTurn, 'update')
              : null
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
        const state = { turn: matchTurn(match), args: new Map(), model: null, sent: '' }
        return match.event.type === 'turn/start' ? state : definition.update({ state }, match)
      },
      update({ state }, { event }) {
        const data = event.data
        if (event.type === 'tool/call' && data.name === TOOL_NAME) {
          return { ...state, args: new Map(state.args).set(String(data.callId), data.arguments) }
        }
        if (event.type === 'user/message') {
          const text = textOf(data.content)
          return text === '' ? state : { ...state, sent: state.sent === '' ? text : `${state.sent}\n${text}` }
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
        if (scope !== 'turn' || state === undefined || turnId(state.turn) === null) return null
        if (state.model === null && state.sent === '') return null
        if (previous?.key === KEY && previous.turn === state.turn
          && previous.value.model === state.model && previous.value.sent === state.sent) return previous
        return { kind: 'turn', turn: state.turn, key: KEY, value: { model: state.model, sent: state.sent } }
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

    function SparkIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', className: 'dshns-spark', 'aria-hidden': 'true' },
        h('path', { d: 'M8 2.5C8.4 5.6 10.4 7.6 13.5 8 10.4 8.4 8.4 10.4 8 13.5 7.6 10.4 5.6 8.4 2.5 8 5.6 7.6 7.6 5.6 8 2.5Z', fill: 'currentColor' }))
    }

    /** "Sent as-is". */
    function CheckIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshns-check', 'aria-hidden': 'true' },
        h('path', { d: 'M3.5 8.5 6.5 11.5 12.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    /** "Sent with edits". */
    function EditedIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshns-check', 'aria-hidden': 'true' },
        h('path', { d: 'M10.5 3 13 5.5 6 12.5 3 13l.5-3L10.5 3Z', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    // -----------------------------------------------------------------------
    // Usage: which suggestions the next user message actually used
    // -----------------------------------------------------------------------

    const squash = (value) => value.replace(/\s+/g, '').toLowerCase()

    function pairsOf(value) {
      const characters = Array.from(value)
      const pairs = new Set()
      for (let index = 0; index + 1 < characters.length; index += 1) pairs.add(characters[index] + characters[index + 1])
      return pairs
    }

    /** 'full' when the sent text contains the prompt, 'partial' when it keeps at least half of its character pairs. */
    function usageOf(prompt, sent) {
      const target = squash(prompt)
      const text = squash(sent)
      if (target === '' || text === '') return null
      if (text.includes(target)) return 'full'
      const pairs = pairsOf(target)
      if (pairs.size < 4) return null
      const sentPairs = pairsOf(text)
      let kept = 0
      for (const pair of pairs) if (sentPairs.has(pair)) kept += 1
      return kept / pairs.size >= 0.5 ? 'partial' : null
    }

    /** A full match settles the question: partial marks only show when nothing was sent as-is. */
    function usagesOf(suggestions, sent) {
      const usages = suggestions.map((suggestion) => usageOf(suggestion.prompt, sent))
      return usages.includes('full') ? usages.map((usage) => (usage === 'full' ? usage : null)) : usages
    }

    /** Text the user sent in the turn after `turn`, from the same session-log fold. */
    function nextSent(snapshot, turn) {
      const order = snapshot?.timeline?.turnOrder
      const index = Array.isArray(order) ? order.indexOf(turn) : -1
      if (index < 0 || index + 1 >= order.length) return ''
      return snapshot.timeline.turns?.get(order[index + 1])?.data?.get(KEY)?.sent ?? ''
    }

    /** Only a card mounted right after its turn ends animates in; history mounts instantly. */
    function isFresh(turn) {
      const time = turn?.end?.time
      const value = typeof time === 'number' ? time : Date.parse(time)
      return Number.isFinite(value) && Date.now() - value < 5000
    }

    function NextActionsCard({ turn, inputActions, useInput, useChat, useSession, sessionId, t }) {
      const ownedRef = React.useRef(null)
      const draft = useInput?.((state) => state?.draft ?? '') ?? ''
      const sent = useChat?.((snapshot) => nextSent(snapshot, turn?.turn)) ?? ''
      const subagent = useSession?.((state) => state?.subagent ?? null)

      const model = turn?.end === undefined ? undefined : turn.data?.get(KEY)?.model
      const closing = turn?.data?.get('turn-tail')?.closing
      if (!model || !closing || subagent) return null

      const canWrite = typeof inputActions?.setDraft === 'function'
      const usages = usagesOf(model.suggestions, sent)
      const chip = (suggestion, index) => {
        const usage = usages[index]
        const marks = [
          suggestion.recommended && t('chip.recommended'),
          suggestion.danger && t('chip.danger'),
          usage === 'full' && t('chip.sent'),
          usage === 'partial' && t('chip.edited'),
        ].filter(Boolean)
        // One leading icon: what the user did outranks what the model said.
        const icon = usage !== null
          ? h(usage === 'full' ? CheckIcon : EditedIcon)
          : suggestion.danger ? h(WarnIcon) : suggestion.recommended ? h(SparkIcon) : null
        return h('button', {
          key: index,
          type: 'button',
          className: 'dshns-chip',
          'data-recommended': suggestion.recommended ? '' : undefined,
          'data-used': usage ?? undefined,
          disabled: !canWrite,
          title: suggestion.prompt,
          'aria-label': `${suggestion.label}${marks.length > 0 ? `（${marks.join('，')}）` : ''}：${suggestion.prompt}`,
          onClick: () => {
            ownedRef.current = fill(inputActions, draft, ownedRef.current, suggestion.prompt, sessionId)
          },
        },
        icon,
        h('span', { className: 'dshns-chip-label' }, suggestion.label))
      }

      return h('div', { className: 'dshns-reveal', 'data-fresh': isFresh(turn) ? '' : undefined },
        h('section', { className: 'dshns-card', 'aria-label': t('card.title') },
          h('p', { className: 'dshns-context' }, h(Mark), model.context),
          h('div', { className: 'dshns-chips' }, model.suggestions.map(chip))))
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
      }, NextActionsCard))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key: TOOL_NAME, locale: NS,
      }, ProcessRow))
    }

    return {
      // `uiConversation` is injected so the definition registers on a cold boot.
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      __test: { definition, modelOf, fillMode, fill, rowState, usageOf, usagesOf, nextSent },
    }
  },
})
