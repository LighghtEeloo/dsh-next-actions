/**
 * Browser half of dsh-next-actions.
 *
 * - Two Conversation Definitions publish turn data. `next-actions` holds the
 *   card from this tool's `tool/result.meta` (native) or `tool/ptc-dispatch`
 *   meta (PTC `run_code`); `next-actions-sent` holds the text of the turn's
 *   first human `user/message`. `match()` reads only the current event; the
 *   turn always comes from the Engine-resolved `match.location`, because one
 *   Definition serves every session's assembler and `prepend` re-matches
 *   older pages.
 * - A `conversation.chat.turnTail` entry renders the card under every turn
 *   that produced one; clicking a suggestion fills the composer and never
 *   sends. A chip whose prompt the next user message sent as-is gets a check;
 *   one sent with edits gets a pencil. Both come from the session log. Once
 *   that message arrives the card folds to one summary row; the two states
 *   stay mounted, so a CSS grid-row transition animates folding and unfolding
 *   in both directions. Expanding or collapsing by hand lasts only for the mount.
 * - A `tool.call.toolview` entry renders the one-line process row.
 *
 * External plugins must not require Harness Client packages, so the markup and
 * CSS follow the official action card with renamed `dshna-` classes and theme
 * tokens only. DSH serves this file as one classic script; it is hand-written
 * source, not a build output.
 */
window.__ModuleLoader__.load({
  id: 'dsh-next-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // Card and process-row CSS: values follow the official action card and
    // propose_action row; only theme tokens are referenced.
    const STYLES = `
.dshna-reveal {
  display: grid;
  grid-template-rows: 1fr;
  --dshna-fold-duration: .22s;
  --dshna-fold-ease: cubic-bezier(.4, 0, .2, 1);
}
.dshna-reveal > * { min-height: 0; }
.dshna-reveal[data-fresh] { animation: dshna-reveal var(--dshna-fold-duration) var(--dshna-fold-ease) both; }
@keyframes dshna-reveal { from { grid-template-rows: 0fr; opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .dshna-reveal { --dshna-fold-duration: 0s; }
  .dshna-reveal[data-fresh] { animation: none; }
}
    /* Both states stay mounted; each row grows from 0fr to 1fr as the other shrinks.
       The item clips, not the grid: overflow on the grid itself stops 0fr collapsing. */
.dshna-reveal-clip, .dshna-summary-clip, .dshna-card-clip { min-height: 0; overflow: hidden; }
.dshna-summary-row, .dshna-card-row {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows var(--dshna-fold-duration) var(--dshna-fold-ease),
    opacity var(--dshna-fold-duration) var(--dshna-fold-ease),
    visibility 0s linear var(--dshna-fold-duration);
}
.dshna-summary-row { grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition-delay: 0s, 0s, var(--dshna-fold-duration); pointer-events: none; }
.dshna-card-row { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition-delay: 0s, 0s, 0s; pointer-events: auto; }
.dshna-reveal[data-folded] .dshna-summary-row { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition-delay: 0s, 0s, 0s; pointer-events: auto; }
    /* The leaving card stays visible until its row finishes collapsing, then leaves the tab order. */
.dshna-reveal[data-folded] .dshna-card-row { grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition-delay: 0s, 0s, var(--dshna-fold-duration); pointer-events: none; }
.dshna-card {
  overflow: hidden;
  margin: 16px 0;
  padding: 14px 20px 16px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dshna-context {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.dshna-mark { display: inline-block; vertical-align: -3px; margin-right: 6px; }
.dshna-head { display: flex; align-items: flex-start; gap: 8px; }
.dshna-head > .dshna-context { flex: 1; min-width: 0; }
.dshna-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: -2px -8px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dshna-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
    /* Collapsed card: one quiet row, like the process row. */
.dshna-summary {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  height: 28px;
  margin: 12px 0;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-family: var(--dsw-font-family);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dshna-summary:hover { color: var(--dsw-alias-label-secondary); }
.dshna-summary > svg, .dshna-summary-title { flex: none; }
.dshna-summary > .dshna-mark { margin-right: 0; }
.dshna-summary-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dshna-summary-item + .dshna-summary-item { margin-left: 10px; }
.dshna-summary-item > svg { display: inline-block; vertical-align: -1px; margin-right: 4px; }
.dshna-chips { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 12px; }
.dshna-chip {
  box-sizing: border-box;
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  max-width: 100%;
  min-height: 32px;
  padding: 5.5px 12px;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: start;
  cursor: pointer;
}
.dshna-chip > svg { flex: none; margin-top: 4px; }
.dshna-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshna-chip:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dshna-chip:disabled { cursor: not-allowed; opacity: .4; }
.dshna-chip:focus-visible, .dshna-toggle:focus-visible, .dshna-summary:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
    /* The whole label shows; long actions wrap instead of being cut off. */
.dshna-chip-label { min-width: 0; overflow-wrap: anywhere; }
    /* Recommended: tinted border + spark. Used (next message): check or pencil in success color; quieter label. */
.dshna-chip[data-recommended] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, transparent); }
.dshna-spark { flex: none; color: var(--dsw-alias-state-business-primary); }
.dshna-chip[data-used] { color: var(--dsw-alias-label-secondary); }
.dshna-used { flex: none; color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 65%, var(--dsw-alias-label-primary)); }
.dshna-warn { flex: none; color: color-mix(in srgb, var(--dsw-alias-state-warn-label) 65%, var(--dsw-alias-label-primary)); }
.dshna-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
}
.dshna-row > svg { flex: none; }
.dshna-row-title { flex: none; font-size: var(--dsh-content-font-size-secondary, 13px); }
.dshna-row-summary { min-width: 0; margin-left: 2px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`

    const PKG = 'dsh-next-actions'
    const NS = 'nextActions'
    const TOOL_NAME = 'suggest_next_actions'
    const KEY = 'next-actions'
    const SENT_KEY = 'next-actions-sent'
    // The card ends the turn's content. Shipped file-change, plan and action
    // cards use order 0 and schedule uses 20; common third-party tail cards use
    // up to 100 (visualize). Sort after all of them; the message action row follows.
    const TAIL_ORDER = 1000

    const EN = Object.freeze({
      'card.title': 'Suggested next actions',
      'card.collapse': 'Collapse suggested next actions',
      'chip.recommended': 'Recommended',
      'chip.danger': 'Needs confirmation',
      'chip.sent': 'Sent',
      'chip.edited': 'Sent with edits',
      'chip.aria': '{label}: {prompt}',
      'chip.ariaMarked': '{label} ({marks}): {prompt}',
      'list.separator': ', ',
      'summary.aria': '{title}: {summary}',
      'summary.used': '{label} ({mark})',
      'summary.count': '{count} unused',
      'summary.unused': '{count} unused',
      'row.title': 'Next actions',
      'row.running': 'Writing',
      'row.ok': 'Shown',
      'row.error': 'Not shown',
    })
    const ZH = Object.freeze({
      'card.title': '下一步建议',
      'card.collapse': '收起下一步建议',
      'chip.recommended': '推荐',
      'chip.danger': '需确认',
      'chip.sent': '已发送',
      'chip.edited': '改后发送',
      'chip.aria': '{label}：{prompt}',
      'chip.ariaMarked': '{label}（{marks}）：{prompt}',
      'list.separator': '，',
      'summary.aria': '{title}：{summary}',
      'summary.used': '{label}（{mark}）',
      'summary.count': '{count} 条',
      'summary.unused': '{count} 条未使用',
      'row.title': '下一步建议',
      'row.running': '正在生成',
      'row.ok': '已生成',
      'row.error': '未显示',
    })

    // -----------------------------------------------------------------------
    // Data: fold this tool's events into turn data
    // -----------------------------------------------------------------------

    /**
     * The card model is the Host-normalized `meta` on the original tool result.
     * Compaction retains the original event; replacement copies are ignored.
     * Older metas may carry up to six suggestions.
     */
    function modelOf(meta) {
      if (meta?.shown !== true || typeof meta.context !== 'string' || !Array.isArray(meta.suggestions)) return null
      const suggestions = meta.suggestions
        .filter((suggestion) => typeof suggestion?.label === 'string' && typeof suggestion.prompt === 'string')
        .slice(0, 3)
      return suggestions.length === 0 ? null : { context: meta.context, suggestions }
    }

    const isTurn = (turn) => Number.isSafeInteger(turn) && turn >= 0
    const isId = (value) => (typeof value === 'string' && value !== '') || Number.isSafeInteger(value)

    /**
     * Turn of a Match as the Engine resolved it for this session's window. Only
     * the Engine knows which session and position an event has, so `match()`
     * never guesses a turn from earlier events.
     */
    function turnOf(match) {
      const location = match.location
      const turn = location?.kind === 'turn' || location?.kind === 'step' ? location.turn?.turn : undefined
      return isTurn(turn) ? turn : isTurn(match.event?.data?.turn) ? match.event.data.turn : null
    }

    /**
     * A turn's Location key has one owner. Contexts of one kind form a chain by
     * start order; `taken` says an earlier Context of the same turn already
     * owns the key. The Engine replays a Context when its predecessor changes.
     */
    function takenBefore(reader, kind, turn, owns) {
      const previous = reader.previous(kind)?.state
      return previous !== undefined && previous.turn === turn && (previous.taken || owns(previous))
    }

    /** Plain text of a message's content blocks. */
    function textOf(content) {
      if (typeof content === 'string') return content
      if (!Array.isArray(content)) return ''
      return content.map((block) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('')
    }

    /**
     * Card: one Context per call, keyed like the official tool Definition.
     * Native calls by `callId`; PTC (`run_code`) dispatches by their root call.
     * The first call of a turn that produced a card owns the turn's card.
     */
    const hasCard = (state) => state.model !== null
    const cardDefinition = {
      kind: KEY,
      match(event) {
        const data = event.data
        switch (event.type) {
          case 'tool/call':
            return data.name === TOOL_NAME && isId(data.callId) ? { id: String(data.callId), role: 'start' } : null
          case 'tool/result': {
            // Replacement copies of a result must not re-publish the card.
            const callId = data.message?.source?.callId ?? data.message?.toolCallId
            return event.surfaceOp === 'append' && isId(callId) ? { id: String(callId), role: 'update' } : null
          }
          case 'tool/ptc-dispatch-start':
          case 'tool/ptc-dispatch':
            return data.name === TOOL_NAME && isId(data.rootCallId)
              ? { id: `ptc:${data.rootCallId}`, role: event.type === 'tool/ptc-dispatch-start' ? 'start' : 'update' }
              : null
          default:
            return null
        }
      },
      start(_context, match, reader) {
        const turn = turnOf(match)
        const state = { turn, model: null, taken: turn !== null && takenBefore(reader, KEY, turn, hasCard) }
        return cardDefinition.update({ state }, match)
      },
      update({ state }, { event }) {
        const data = event.data
        let model = null
        if (event.type === 'tool/result' && event.surfaceOp === 'append') {
          if (data.message === undefined || data.message.isError === true) return state
          model = modelOf(data.meta)
        } else if (event.type === 'tool/ptc-dispatch' && data.isError !== true) {
          model = modelOf(data.meta)
        }
        return model === null ? state : { ...state, model }
      },
      buildLocationData({ state }, scope, previous) {
        if (scope !== 'turn' || state === undefined || state.turn === null || state.model === null || state.taken) return null
        if (previous?.key === KEY && previous.turn === state.turn && previous.value.model === state.model) return previous
        return { kind: 'turn', turn: state.turn, key: KEY, value: { model: state.model } }
      },
    }

    /**
     * Sent text: one Context per human message. The first message of a turn owns
     * the turn's `sent`, text or not: a textless reply publishes an empty value
     * so the card before it is not judged by a later message.
     */
    const hasSent = () => true
    const sentDefinition = {
      kind: SENT_KEY,
      match(event) {
        const data = event.data
        return event.type === 'user/message' && event.surfaceOp === 'append' && data.source?.kind === 'user' && isId(data.id)
          ? { id: String(data.id), role: 'start' }
          : null
      },
      start(_context, match, reader) {
        const turn = turnOf(match)
        return { turn, text: textOf(match.event.data.content), taken: turn !== null && takenBefore(reader, SENT_KEY, turn, hasSent) }
      },
      update({ state }) {
        return state
      },
      buildLocationData({ state }, scope, previous) {
        if (scope !== 'turn' || state === undefined || state.turn === null || state.taken) return null
        if (previous?.key === SENT_KEY && previous.turn === state.turn && previous.value.text === state.text) return previous
        return { kind: 'turn', turn: state.turn, key: SENT_KEY, value: { text: state.text } }
      },
    }

    // -----------------------------------------------------------------------
    // Card
    // -----------------------------------------------------------------------

    /** Empty drafts and drafts the card wrote itself are replaced; anything else gets the action added. */
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
          if (actions.insertText(`\n\n${prompt}`, actions.captureInsertion()) !== true) {
            console.warn('[dsh-next-actions] insertText declined; appending the action instead')
            next = `${draft.trimEnd()}\n\n${prompt}`
          }
        } catch (error) {
          console.warn('[dsh-next-actions] insert at caret failed; appending the action instead', error)
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

    function Mark({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 36 36', fill: 'none', className: 'dshna-mark', 'aria-hidden': 'true' },
        h('g', { transform: 'translate(-1.5 0.5)' },
          h('rect', { x: 5, y: 7.6, width: 21, height: 5.4, rx: 2.7, fill: '#5E9DF5' }),
          h('rect', { x: 5, y: 15.3, width: 16, height: 5.4, rx: 2.7, fill: '#7AAEFF' }),
          h('rect', { x: 5, y: 23, width: 11, height: 5.4, rx: 2.7, fill: '#9CC3FF' }),
          h('path', { d: 'M29.6 6.6C29.88 8.65 31.25 10.02 33.3 10.3C31.25 10.58 29.88 11.95 29.6 14C29.32 11.95 27.95 10.58 25.9 10.3C27.95 10.02 29.32 8.65 29.6 6.6Z', fill: '#41E1AC' })))
    }

    function WarnIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshna-warn', 'aria-hidden': 'true' },
        h('path', { d: 'M8 1.8 14.6 13.2H1.4L8 1.8Z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        h('path', { d: 'M8 6v3.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 11.4, r: 0.7, fill: 'currentColor' }))
    }

    function SparkIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', className: 'dshna-spark', 'aria-hidden': 'true' },
        h('path', { d: 'M8 2.5C8.4 5.6 10.4 7.6 13.5 8 10.4 8.4 8.4 10.4 8 13.5 7.6 10.4 5.6 8.4 2.5 8 5.6 7.6 7.6 5.6 8 2.5Z', fill: 'currentColor' }))
    }

    /** "Sent as-is". */
    function CheckIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshna-used', 'aria-hidden': 'true' },
        h('path', { d: 'M3.5 8.5 6.5 11.5 12.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    /** "Sent with edits". */
    function EditedIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', className: 'dshna-used', 'aria-hidden': 'true' },
        h('path', { d: 'M10.5 3 13 5.5 6 12.5 3 13l.5-3L10.5 3Z', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    /** Right when collapsed (expands), up when expanded (collapses). */
    function ChevronIcon({ expanded }) {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: expanded ? 'M3.5 10 8 5.5 12.5 10' : 'M6 3.5 10.5 8 6 12.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    // -----------------------------------------------------------------------
    // Usage: which suggestions the next human message used
    //
    // An inference from the sent text, not a click record: typing similar text
    // by hand is marked too. Clicking fills the prompt as whole lines (the
    // empty draft replaced, or "\n\n" + prompt inserted), so "sent as-is"
    // means whole lines equal to the prompt.
    // -----------------------------------------------------------------------

    /** Prompts shorter than this (whitespace removed) only count when sent as-is. */
    const EDITED_MIN_LENGTH = 4
    /** Order-aware similarity (Dice over the longest common subsequence) that counts as "sent with edits". */
    const EDITED_SIMILARITY = 0.6

    const squash = (value) => value.replace(/\s+/g, '').toLowerCase()

    /** Characters of `left` kept in order in `right`. */
    function commonLength(left, right) {
      let row = new Array(right.length + 1).fill(0)
      for (const character of left) {
        const next = [0]
        for (let index = 0; index < right.length; index += 1) {
          next.push(character === right[index] ? row[index] + 1 : Math.max(row[index + 1], next[index]))
        }
        row = next
      }
      return row[right.length]
    }

    function similarity(target, text) {
      // Dice cannot reach the threshold when lengths differ too much; skip the quadratic work.
      if ((2 * Math.min(target.length, text.length)) / (target.length + text.length) < EDITED_SIMILARITY) return 0
      return (2 * commonLength(target, text)) / (target.length + text.length)
    }

    /**
     * 'full' when whole consecutive lines of the sent text equal the prompt;
     * 'partial' when one line or paragraph keeps most of the prompt in order.
     */
    function usageOf(prompt, sent) {
      const target = Array.from(squash(prompt))
      if (target.length === 0) return null
      const lines = sent.split('\n').map(squash).filter((line) => line !== '')
      const joined = target.join('')
      for (let first = 0; first < lines.length; first += 1) {
        let run = ''
        for (let last = first; last < lines.length && run.length < joined.length; last += 1) {
          run += lines[last]
          if (run === joined) return 'full'
        }
      }
      if (target.length < EDITED_MIN_LENGTH) return null
      const paragraphs = sent.split(/\n\s*\n/).map(squash).filter((paragraph) => paragraph !== '')
      for (const candidate of new Set([...lines, ...paragraphs])) {
        if (similarity(target, Array.from(candidate)) >= EDITED_SIMILARITY) return 'partial'
      }
      return null
    }

    /**
     * Text the user answered the card of `turn` with: the first message of the
     * next turn opened by a human. Turns without a human message (injected
     * context, wake-ups) are skipped, and a later turn showing its own card
     * claims the next message instead. A human turn whose message has no text
     * (an image-only reply) ends the search, so no later message is borrowed.
     * `null` while the card still awaits that reply: it is the current card.
     */
    function nextSent(snapshot, turn) {
      const order = snapshot?.timeline?.turnOrder
      const index = Array.isArray(order) ? order.indexOf(turn) : -1
      if (index < 0) return null
      for (const later of order.slice(index + 1)) {
        const data = snapshot.timeline.turns?.get(later)?.data
        const sent = data?.get(SENT_KEY)
        if (sent !== undefined) return typeof sent.text === 'string' ? sent.text : ''
        if (data?.get(KEY)?.model) return ''
      }
      return null
    }

    /** Only a card mounted right after its turn ends animates in; history mounts instantly. */
    function isFresh(turn) {
      const time = turn?.end?.time
      const value = typeof time === 'number' ? time : Date.parse(time)
      return Number.isFinite(value) && Date.now() - value < 5000
    }

    /** What a folded card says: the suggestions the reply used, or how many went unused. */
    function summaryOf(suggestions, usages, t) {
      const used = suggestions.flatMap((suggestion, index) => (usages[index] === null ? [] : [{ label: suggestion.label, usage: usages[index] }]))
      const count = String(suggestions.length)
      const markOf = (usage) => t(usage === 'full' ? 'chip.sent' : 'chip.edited')
      const label = used.length > 0
        ? used.map(({ label, usage }) => t('summary.used', { label, mark: markOf(usage) })).join(t('list.separator'))
        : t('summary.unused', { count })
      return {
        label: t('summary.aria', { title: t('card.title'), summary: label }),
        content: used.length > 0
          ? used.map(({ label, usage }, index) => h('span', { key: index, className: 'dshna-summary-item' },
            h(usage === 'full' ? CheckIcon : EditedIcon), label))
          : t('summary.count', { count }),
      }
    }

    function NextActionsCard({ turn, inputActions, useInput, useChat, useSession, sessionId, t }) {
      const ownedRef = React.useRef(null)
      // Both states are mounted, so the toggle that was not clicked takes focus.
      const summaryRef = React.useRef(null)
      const toggleRef = React.useRef(null)
      const toggledRef = React.useRef(false)
      // This mount's explicit choice; `null` follows the session log.
      const [expandedChoice, setExpandedChoice] = React.useState(null)
      const draft = useInput?.((state) => state?.draft ?? '') ?? ''
      const sent = useChat?.((snapshot) => nextSent(snapshot, turn?.turn)) ?? null
      const subagent = useSession?.((state) => state?.subagent ?? null)

      const model = turn?.end === undefined ? undefined : turn.data?.get(KEY)?.model
      const closing = turn?.data?.get('turn-tail')?.closing
      const suggestions = closing && !subagent ? model?.suggestions : undefined
      const usages = React.useMemo(
        () => suggestions?.map(({ prompt }) => (sent === null ? null : usageOf(prompt, sent))),
        [suggestions, sent],
      )
      // A card folds once answered, at the boundary "used" is judged by.
      const awaitingReply = sent === null
      const expanded = expandedChoice ?? awaitingReply
      React.useEffect(() => {
        if (!toggledRef.current) return
        toggledRef.current = false
        const target = expanded ? toggleRef : summaryRef
        target.current?.focus()
      }, [expanded])
      if (!suggestions) return null

      const toggle = () => {
        toggledRef.current = true
        setExpandedChoice(!expanded)
      }
      const summary = summaryOf(suggestions, usages, t)
      const canWrite = typeof inputActions?.setDraft === 'function'
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
          className: 'dshna-chip',
          'data-recommended': suggestion.recommended ? '' : undefined,
          'data-used': usage ?? undefined,
          disabled: !canWrite,
          title: suggestion.prompt,
          'aria-label': marks.length > 0
            ? t('chip.ariaMarked', { label: suggestion.label, marks: marks.join(t('list.separator')), prompt: suggestion.prompt })
            : t('chip.aria', { label: suggestion.label, prompt: suggestion.prompt }),
          onClick: () => {
            ownedRef.current = fill(inputActions, draft, ownedRef.current, suggestion.prompt, sessionId)
          },
        },
        icon,
        h('span', { className: 'dshna-chip-label' }, suggestion.label))
      }

      return h('div', {
        className: 'dshna-reveal',
        'data-folded': expanded ? undefined : '',
        'data-fresh': isFresh(turn) ? '' : undefined,
      },
      h('div', { className: 'dshna-reveal-clip' },
        h('div', { className: 'dshna-summary-row' },
          h('div', { className: 'dshna-summary-clip' },
            h('button', {
              ref: summaryRef,
              type: 'button',
              className: 'dshna-summary',
              'aria-expanded': expanded,
              'aria-label': summary.label,
              title: model.context,
              onClick: toggle,
            },
            h(ChevronIcon, { expanded: false }),
            h(Mark, { size: 14 }),
            h('span', { className: 'dshna-summary-title' }, t('card.title')),
            h('span', null, '·'),
            h('span', { className: 'dshna-summary-text' }, summary.content)))),
        h('div', { className: 'dshna-card-row' },
          h('div', { className: 'dshna-card-clip' },
            h('section', { className: 'dshna-card', 'aria-label': t('card.title') },
              h('div', { className: 'dshna-head' },
                h('p', { className: 'dshna-context' }, h(Mark), model.context),
                // The current card has no collapse control: continuing the conversation folds it.
                awaitingReply ? null : h('button', {
                  ref: toggleRef,
                  type: 'button',
                  className: 'dshna-toggle',
                  'aria-expanded': expanded,
                  'aria-label': t('card.collapse'),
                  title: t('card.collapse'),
                  onClick: toggle,
                }, h(ChevronIcon, { expanded: true }))),
              h('div', { className: 'dshna-chips' }, suggestions.map(chip)))))))
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
      return h('div', { className: 'dshna-row', 'data-tool': TOOL_NAME, 'data-state': state, title: block?.meta?.note },
        h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': 'true' },
          h('rect', { x: 2.25, y: 2.25, width: 4, height: 4, rx: 1 }),
          h('rect', { x: 2.25, y: 9.75, width: 4, height: 4, rx: 1 }),
          h('rect', { x: 9.75, y: 9.75, width: 4, height: 4, rx: 1 }),
          h('path', { d: 'M11.75 1.75v5M9.25 4.25h5' })),
        h('span', { className: 'dshna-row-title' }, t('row.title')),
        h('span', { className: 'dshna-row-summary' }, count > 0 ? `${t(`row.${state}`)} · ${count}` : t(`row.${state}`)))
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
      ctx.effect(() => ctx.uiConversation.events.register(cardDefinition), 'dsh-next-actions: card definition')
      ctx.effect(() => ctx.uiConversation.events.register(sentDefinition), 'dsh-next-actions: sent definition')
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail', id: PKG, order: TAIL_ORDER, locale: NS,
      }, NextActionsCard))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key: TOOL_NAME, locale: NS,
      }, ProcessRow))
    }

    return {
      // `uiConversation` is injected so the definition registers on a cold boot.
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      __test: {
        cardDefinition, sentDefinition, modelOf, fillMode, fill, rowState, usageOf, nextSent,
        tailOrder: TAIL_ORDER, styles: STYLES,
      },
    }
  },
})
