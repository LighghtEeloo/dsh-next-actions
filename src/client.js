/**
 * Browser half template for @local/dsh-next-actions.
 *
 * M2: turn-tail data layer — a Conversation Definition folds this tool's
 * `tool/call` + `tool/result` (preferring the Host-persisted `tool/result.meta`,
 * falling back to the arguments when compaction dropped it) into
 * `turn.data.get('next-steps')`.
 * M3: the card renders the official action-card frame (copied markup/CSS, no
 * Harness Client imports), fills the input draft on click, and owns the
 * conflict / dismiss / preview states.
 * M9: a live turn-tail card reveals itself with a short height/opacity
 * transition. DSH 0.2.2's default completion-time fold mounts the card in the
 * same frame that collapses the turn's work rows, so a full-height insert moves
 * the just-read answer up by the card height in one frame; the transition lets
 * the scroll layer follow the growth frame by frame. Historical cards
 * (session open / rebuild) and reduced-motion users keep the instant mount.
 *
 * Built by scripts/build-client.mjs, which inlines lib/view-model.js and
 * src/styles.js at the markers below. The generated client.js is a single
 * classic script; the module id must equal the package name.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-next-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /* @inline:view-model */

    /* @inline:styles */

    const PKG = '@local/dsh-next-actions'
    const NS = 'nextSteps'
    const TOOL_NAME = 'suggest_next_steps'
    const DEFINITION_KEY = 'next-steps'
    const CARD_ORDER = -10

    // -----------------------------------------------------------------------
    // Locale dictionaries (official frame copy + this plugin's keys)
    // -----------------------------------------------------------------------

    const EN = Object.freeze({
      'card.title': 'Suggested next steps',
      'card.expand': 'Show more',
      'card.collapse': 'Show less',
      'card.dismiss': 'Not now',
      'card.restore': 'Restore suggestions',
      'card.more': 'More ({n})',
      'chip.recommended': 'Recommended',
      'chip.danger': 'Needs confirmation',
      'chip.optional': 'Optional',
      'chip.filled': 'Filled',
      'status.filled': 'Filled into the input — review and send',
      'status.danger': 'This may be irreversible — review before sending',
      'status.dismissed': 'Dismissed',
      'status.conflict': 'The input already has content',
      'status.unavailable': 'The composer is unavailable',
      'conflict.replace': 'Replace',
      'conflict.append': 'Append',
      'conflict.cancel': 'Cancel',
      'fallback.context': 'Here are a few natural next steps.',
      'note.invalidArguments': 'The tool arguments were invalid',
      'note.missingContext': 'No context was provided',
      'note.noUsableSuggestions': 'No usable suggestions were produced',
      'note.interrupted': 'The call was interrupted',
      'row.title': 'Suggested next steps',
      'row.preparing': 'Preparing suggestions',
      'row.running': 'Writing suggestions',
      'row.ok': 'Suggested',
      'row.error': 'Not shown',
      'row.stopped': 'Interrupted',
      'row.inspect': 'Inspect call',
      'settings.title': 'Next steps',
      'settings.hostGate': 'Cards are controlled by the plugin Host config (profile cordis.patch.yml → dsh-next-actions → enabled). Turning it off removes the tool and the prompt guidance.',
      'settings.maxPerTurn': 'Suggestions per reply',
      'settings.auto': 'Auto',
      'settings.clickMode': 'Clicking a suggestion',
      'settings.clickFill': 'Fill input',
      'settings.clickSend': 'Send',
      'status.sent': 'Sent as your message',
      'settings.note': 'Clicking a suggestion fills the input; choose Send to submit immediately. Dangerous suggestions always fill only.',
      'settings.reset': 'Reset card states',
      'settings.saved': 'Saved',
      'settings.resetDone': 'Card states cleared',
      'settings.resetEmpty': 'Nothing to clear',
      'settings.storageUnavailable': 'Could not save in this browser',
    })

    const ZH = Object.freeze({
      'card.title': '下一步建议',
      'card.expand': '展开',
      'card.collapse': '收起',
      'card.dismiss': '暂不需要',
      'card.restore': '恢复建议',
      'card.more': '还有 {n} 条',
      'chip.recommended': '推荐',
      'chip.danger': '需确认',
      'chip.optional': '可以不做',
      'chip.filled': '已填入',
      'status.filled': '已填入输入框，可修改后发送',
      'status.danger': '该操作可能不可逆，请确认后发送',
      'status.dismissed': '已忽略',
      'status.conflict': '输入框已有内容',
      'status.unavailable': '输入框暂不可用',
      'conflict.replace': '替换',
      'conflict.append': '追加',
      'conflict.cancel': '取消',
      'fallback.context': '接下来可以：',
      'note.invalidArguments': '工具参数无效',
      'note.missingContext': '缺少上下文说明',
      'note.noUsableSuggestions': '没有可用的建议',
      'note.interrupted': '调用已中断',
      'row.title': '下一步建议',
      'row.preparing': '正在准备建议',
      'row.running': '正在生成建议',
      'row.ok': '已生成',
      'row.error': '未显示',
      'row.stopped': '已中断',
      'row.inspect': '查看调用',
      'settings.title': '下一步建议',
      'settings.hostGate': '卡片总开关已移到插件的 Host 配置（profile 的 cordis.patch.yml → dsh-next-actions → enabled）；关闭后不再注册工具与提示词。',
      'settings.maxPerTurn': '每轮建议条数',
      'settings.auto': '自动',
      'settings.clickMode': '点击建议时',
      'settings.clickFill': '填入输入框',
      'settings.clickSend': '直接发送',
      'status.sent': '已作为你的消息发送',
      'settings.note': '点击建议默认只填入输入框；选择“直接发送”会立即发出；危险建议始终只填入。',
      'settings.reset': '重置卡片状态',
      'settings.saved': '已保存',
      'settings.resetDone': '卡片状态已清理',
      'settings.resetEmpty': '没有可清理的状态',
      'settings.storageUnavailable': '当前浏览器无法保存',
    })

    // -----------------------------------------------------------------------
    // Client helpers
    // -----------------------------------------------------------------------

    let sharedCtx = null

    function injectStyles(css) {
      const element = document.createElement('style')
      element.dataset.plugin = PKG
      element.dataset.pluginCss = `${PKG}/client.css`
      element.textContent = css
      document.head.appendChild(element)
      return element
    }

    function readSettings() {
      return readSettingsFrom(window.localStorage)
    }

    function readTurnState(sessionId, turn) {
      try {
        return decodeTurnState(window.localStorage.getItem(storageKeys.turn(sessionId, turn)))
      } catch {
        return decodeTurnState(undefined)
      }
    }

    function writeTurnState(sessionId, turn, state) {
      try {
        window.localStorage.setItem(storageKeys.turn(sessionId, turn), serializeTurnState(state))
      } catch {
        // Storage can be unavailable (privacy mode, quota); the card still works.
      }
    }

    /** Focus the composer through the conversation service when it is available. */
    function focusComposer(sessionId) {
      try {
        sharedCtx?.get?.('conversation')?.input?.shell?.(sessionId)?.focus?.()
      } catch {
        // Focusing is optional; the draft is already filled.
      }
    }

    // -----------------------------------------------------------------------
    // Live reveal (M9) — see CARD_REVEAL / shouldRevealCard
    // -----------------------------------------------------------------------

    const REVEAL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

    /**
     * First-render box of the reveal wrapper: collapsed so DSH's same-commit
     * instant-fold measurement (which runs after this commit's DOM mutations)
     * sees no card height. The layout effect below either expands it with the
     * reveal transition or clears the style before the first paint.
     * A stable object identity keeps React from rewriting the imperative
     * transition styles on later re-renders of the same card.
     */
    const REVEAL_INITIAL_STYLE = Object.freeze({ overflow: 'hidden', maxHeight: '0px', opacity: 0 })

    /** Nearest transcript scrollport: DSH's shared one, or a scrolling ancestor. */
    function findCardScrollport(element) {
      let node = element === null || element === undefined ? null : element.parentElement
      while (node !== null) {
        if (node.hasAttribute('data-conversation-scroll')) return node
        const overflowY = window.getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return node
        node = node.parentElement
      }
      return null
    }

    /** Distance from the scrollport floor, or null when it cannot be measured. */
    function distanceFromTail(scrollport) {
      if (scrollport === null) return null
      const distance = scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop
      return Number.isFinite(distance) ? Math.max(0, distance) : null
    }

    function prefersReducedMotion() {
      try {
        return typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        return false
      }
    }

    /** Age of the turn's `turn/end` event in milliseconds, or undefined. */
    function turnEndAge(turn) {
      const end = turn === undefined || turn === null ? undefined : turn.end
      const time = end === undefined || end === null ? undefined : end.time
      const value = typeof time === 'number' ? time : typeof time === 'string' ? Date.parse(time) : NaN
      return Number.isFinite(value) ? Date.now() - value : undefined
    }

    /** Remove the reveal transition styles, leaving the card at its natural box. */
    function clearReveal(wrapper) {
      if (wrapper === null) return
      delete wrapper.dataset.revealing
      wrapper.style.transition = ''
      wrapper.style.maxHeight = ''
      wrapper.style.opacity = ''
      wrapper.style.overflow = ''
    }

    /** Height the wrapper must reach for the card plus its own vertical margins to fit. */
    function revealTargetHeight(card) {
      try {
        const rect = card.getBoundingClientRect()
        const computed = window.getComputedStyle(card)
        const marginTop = Number.parseFloat(computed.marginTop) || 0
        const marginBottom = Number.parseFloat(computed.marginBottom) || 0
        const height = rect.height + marginTop + marginBottom
        return Number.isFinite(height) && height > 0 ? Math.ceil(height) : 0
      } catch {
        return 0
      }
    }

    // -----------------------------------------------------------------------
    // Copied primitives (markup + CSS behavior; see official guidance)
    // -----------------------------------------------------------------------

    function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }) {
      const classes = ['dshns-btn', `dshns-btn-${variant}`, size === 'sm' ? 'dshns-btn-sm' : '', className ?? '']
        .filter((value) => value !== '')
        .join(' ')
      return h('button', { type: 'button', className: classes, ...rest },
        icon !== undefined && icon !== null ? h('span', { className: 'dshns-btn-icon' }, icon) : null,
        children)
    }

    function Tag({ tone = 'muted', children }) {
      return h('span', { className: `dshns-tag dshns-tag-${tone}` }, children)
    }

    // -----------------------------------------------------------------------
    // FoldedText — copied algorithm from the official card frame
    // -----------------------------------------------------------------------

    const WIDE_GRAPHEME = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-｠￠-￦]/u
    const FOLD_WIDTH = 260

    function FoldedText({ text, lead, expandLabel, collapseLabel }) {
      const id = React.useId()
      const [expanded, setExpanded] = React.useState(false)
      const preview = React.useMemo(() => {
        const compact = text.replace(/\s+/g, ' ').trim()
        const characters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(compact), (part) => part.segment)
        let width = 0
        for (const [index, character] of characters.entries()) {
          width += WIDE_GRAPHEME.test(character) ? 2 : 1
          if (width > FOLD_WIDTH) return `${characters.slice(0, index).join('').trimEnd()}…`
        }
        return undefined
      }, [text])
      return h(React.Fragment, null,
        h('p', { id, className: 'dshns-text' }, lead ?? null, expanded || preview === undefined ? text : preview),
        preview !== undefined
          ? h(Button, {
            variant: 'ghost',
            size: 'sm',
            className: 'dshns-toggle',
            'aria-expanded': expanded,
            'aria-controls': id,
            onClick: () => { setExpanded((value) => !value) },
          }, expanded ? collapseLabel : expandLabel)
          : null)
    }

    /**
     * Small brand mark: the plugin icon reduced to an inline glyph. Solid fills
     * only (no gradient defs) so several cards on one page cannot collide on a
     * document-wide SVG id. Decorative: the card still carries its aria-label.
     */
    function NextStepsMark({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 36 36',
        fill: 'none',
        className: 'dshns-mark',
        'aria-hidden': 'true',
      },
      h('g', { transform: 'translate(-1.5 0.5)' },
        h('rect', { x: 5, y: 7.6, width: 21, height: 5.4, rx: 2.7, fill: '#5E9DF5' }),
        h('rect', { x: 5, y: 15.3, width: 16, height: 5.4, rx: 2.7, fill: '#7AAEFF' }),
        h('rect', { x: 5, y: 23, width: 11, height: 5.4, rx: 2.7, fill: '#9CC3FF' }),
        h('path', {
          d: 'M29.6 6.6C29.88 8.65 31.25 10.02 33.3 10.3C31.25 10.58 29.88 11.95 29.6 14C29.32 11.95 27.95 10.58 25.9 10.3C27.95 10.02 29.32 8.65 29.6 6.6Z',
          fill: '#41E1AC',
        })))
    }

    // -----------------------------------------------------------------------
    // Turn-tail card (M3)
    // -----------------------------------------------------------------------

    function NextStepsCard(props) {
      const { turn, inputActions, useInput, useSession, sessionId, t } = props
      const turnNumber = turn === undefined || turn === null ? undefined : turn.turn

      const [settings] = React.useState(readSettings)
      const [turnState, setTurnState] = React.useState(() => readTurnState(sessionId, turnNumber))
      const [expanded, setExpanded] = React.useState(false)
      const [conflict, setConflict] = React.useState(null)
      const [filledId, setFilledId] = React.useState(turnState.filledId)
      const [statusKey, setStatusKey] = React.useState(null)
      const [preview, setPreview] = React.useState(null)
      const dangerRef = React.useRef(false)
      const appliedRef = React.useRef(null)

      const draft = typeof useInput === 'function'
        ? useInput((state) => (state === undefined || state === null ? '' : state.draft))
        : ''
      const subagent = typeof useSession === 'function'
        ? useSession((state) => (state === undefined || state === null ? null : state.subagent))
        : null

      // Resolve the card data before the reveal effect so `hasCard` can gate it.
      // The normal turn/tail event order makes the card available on its first
      // render; a late-published model must not leave the wrapper collapsed.
      const tail = turn === undefined || turn === null || turn.end === undefined || turn.data === undefined
        ? undefined
        : turn.data.get('turn-tail')
      const data = turn === undefined || turn === null || turn.data === undefined
        ? undefined
        : turn.data.get(DEFINITION_KEY)
      const model = data === undefined || data === null ? undefined : data.model
      const display = model === undefined ? null : buildDisplay(model, settings)
      const hasCard = turn !== undefined && turn !== null && turn.end !== undefined
        && tail !== undefined && tail !== null
        && tail.closing !== undefined && tail.closing !== null
        && !subagent && display !== null

      // M9: reveal the card instead of inserting its full height in one frame.
      // The wrapper starts collapsed so DSH's instant-fold measurement in this
      // same commit sees no card height; then either the transition runs or the
      // style is cleared before the first paint.
      const revealRef = React.useRef(null)
      const revealStartedRef = React.useRef(false)
      React.useLayoutEffect(() => {
        const wrapper = revealRef.current
        if (!hasCard || wrapper === null || revealStartedRef.current) return undefined
        revealStartedRef.current = true
        const card = wrapper.firstElementChild
        let targetHeight = 0
        try {
          const animate = card !== null && shouldRevealCard({
            reducedMotion: prefersReducedMotion(),
            distanceFromTail: distanceFromTail(findCardScrollport(wrapper)),
            turnAgeMs: turnEndAge(turn),
          })
          targetHeight = animate ? revealTargetHeight(card) : 0
        } catch {
          // A layout or matchMedia failure must never leave the card collapsed.
          targetHeight = 0
        }
        if (targetHeight <= 0) {
          clearReveal(wrapper)
          return undefined
        }
        let timer = null
        const finish = () => {
          if (timer !== null) window.clearTimeout(timer)
          timer = null
          wrapper.removeEventListener('transitionend', onEnd)
          clearReveal(wrapper)
        }
        const onEnd = (event) => {
          if (event.target === wrapper && event.propertyName === 'max-height') finish()
        }
        wrapper.dataset.revealing = ''
        wrapper.style.transition = 'none'
        wrapper.style.overflow = 'hidden'
        wrapper.style.maxHeight = '0px'
        wrapper.style.opacity = '0'
        // Commit the collapsed box before transitioning; otherwise the first
        // resolved style is already the target and no transition runs.
        void wrapper.offsetHeight
        wrapper.style.transition = `max-height ${CARD_REVEAL.durationMs}ms ${REVEAL_EASING}, `
          + `opacity ${CARD_REVEAL.opacityMs}ms ease-out`
        wrapper.style.maxHeight = `${targetHeight}px`
        wrapper.style.opacity = '1'
        wrapper.addEventListener('transitionend', onEnd)
        timer = window.setTimeout(finish, CARD_REVEAL.durationMs + 160)
        return finish
      }, [hasCard])

      if (!hasCard) return null

      const canWrite = inputActions !== undefined && inputActions !== null && typeof inputActions.setDraft === 'function'
      const mode = cardControlMode({ dismissed: turnState.dismissed, conflict: conflict !== null })
      const statusFromState = cardStatusKey({
        dismissed: turnState.dismissed,
        conflict: conflict !== null,
        filledId,
        danger: dangerRef.current,
      }) ?? statusKey
      const status = canWrite ? statusFromState : 'status.unavailable'
      const items = expanded ? model.suggestions : display.items
      const moreCount = expanded ? 0 : display.moreCount
      const title = t('card.title')
      const recommended = model.suggestions.find((suggestion) => suggestion.recommended === true)
      const defaultPreview = (recommended ?? model.suggestions[0]).prompt
      const previewText = preview === null ? defaultPreview : preview

      function applyFill(text, suggestion, owned = true) {
        const mode = readSettings().clickMode
        const danger = suggestion.danger === true
        inputActions.setDraft(text)
        // An appended draft contains the user's own text, so a later click must
        // ask before replacing it; only pure "replace/empty" fills stay owned.
        appliedRef.current = owned ? { prompt: text, id: suggestion.id } : null
        const next = { ...turnState, filledId: suggestion.id }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setFilledId(suggestion.id)
        setConflict(null)
        setPreview(null)
        dangerRef.current = danger
        // Dangerous suggestions always fill only; "send" needs a real submit.
        const canSend = mode === 'send' && danger !== true && typeof inputActions.submit === 'function'
        if (canSend) {
          inputActions.submit()
          setStatusKey('status.sent')
          return
        }
        setStatusKey(danger ? 'status.danger' : 'status.filled')
        focusComposer(sessionId)
      }

      function onPick(suggestion) {
        if (!canWrite) return
        const action = resolveDraftAction({
          draft,
          appliedPrompt: appliedRef.current === null ? '' : appliedRef.current.prompt,
        })
        if (action.kind === 'conflict') {
          setConflict(suggestion)
          setPreview(null)
          return
        }
        applyFill(suggestion.prompt, suggestion)
      }

      function onConflictChoice(choice) {
        if (conflict === null) return
        setConflict(null)
        if (choice === 'cancel') return
        const merged = mergeDraft({ mode: choice, draft, prompt: conflict.prompt })
        if (merged === null) return
        applyFill(merged, conflict, choice === 'replace')
      }

      function onDismiss() {
        const next = { ...turnState, dismissed: true }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPreview(null)
        setStatusKey(null)
      }

      function onRestore() {
        const next = { ...turnState, dismissed: false }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPreview(null)
        setStatusKey(null)
      }

      function renderChip(suggestion) {
        const filled = suggestion.id === filledId
        return h(Button, {
          key: suggestion.id,
          variant: suggestion.recommended === true ? 'primary' : 'ghost',
          size: 'sm',
          className: 'dshns-chip',
          'aria-label': suggestion.prompt,
          disabled: !canWrite,
          onClick: () => { onPick(suggestion) },
          onMouseEnter: () => { setPreview(suggestion.prompt) },
          onMouseLeave: () => { setPreview(null) },
          onFocus: () => { setPreview(suggestion.prompt) },
          onBlur: () => { setPreview(null) },
        },
        h('span', { className: 'dshns-chip-label' }, suggestion.label),
        filled ? h(Tag, { tone: 'muted' }, t('chip.filled')) : null,
        suggestion.recommended === true ? h(Tag, { tone: 'info' }, t('chip.recommended')) : null,
        suggestion.danger === true ? h(Tag, { tone: 'warning' }, t('chip.danger')) : null,
        suggestion.stance === 'optional' ? h(Tag, { tone: 'muted' }, t('chip.optional')) : null)
      }

      const controls = mode === 'suggestions'
        ? h('div', { className: 'dshns-controls' },
          ...items.map(renderChip),
          moreCount > 0
            ? h(Button, {
              variant: 'ghost',
              size: 'sm',
              className: 'dshns-toggle',
              onClick: () => { setExpanded(true) },
            }, t('card.more').replace('{n}', String(moreCount)))
            : null,
          expanded
            ? h(Button, {
              variant: 'ghost',
              size: 'sm',
              className: 'dshns-toggle',
              onClick: () => { setExpanded(false) },
            }, t('card.collapse'))
            : null)
        : mode === 'conflict'
          ? h('div', { className: 'dshns-conflict' },
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('replace') } }, t('conflict.replace')),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('append') } }, t('conflict.append')),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('cancel') } }, t('conflict.cancel')))
          : null

      // Always mounted with a fixed height: moving the pointer between chips only
      // swaps the text, so nothing reflows (that reflow was the "zoom" flicker).
      const previewBlock = mode === 'suggestions'
        ? h('div', { className: 'dshns-preview', role: 'note' }, previewText)
        : null

      const statusText = status === null || status === undefined ? null : t(status)
      // One quiet state toggle at the end of the status row: minus dismisses the
      // suggestions, plus restores them — the two directions of the same action.
      const dismissed = turnState.dismissed === true
      const stateButton = mode === 'suggestions'
        ? h(Button, {
          variant: 'ghost',
          size: 'sm',
          className: 'dshns-dismiss',
          icon: h(MinusIcon, { size: 16 }),
          onClick: onDismiss,
          title: t('card.dismiss'),
          'aria-label': t('card.dismiss'),
        })
        : dismissed
          ? h(Button, {
            variant: 'ghost',
            size: 'sm',
            className: 'dshns-restore',
            icon: h(PlusIcon, { size: 16 }),
            onClick: onRestore,
            title: t('card.restore'),
            'aria-label': t('card.restore'),
          })
          : null
      const statusBar = statusText === null && stateButton === null
        ? null
        : h('div', { className: 'dshns-statusbar' },
          statusText === null ? null : h('p', { className: 'dshns-status', role: 'status' }, statusText),
          stateButton)

      return h('div', {
        className: 'dshns-reveal',
        ref: revealRef,
        style: REVEAL_INITIAL_STYLE,
      },
      h('section', {
        className: 'dshns-card',
        'aria-label': title,
        'data-next-steps-card': '',
      },
      h('div', { className: 'dshns-body' },
        h(FoldedText, {
          text: model.context === '' ? t('fallback.context') : model.context,
          lead: h(NextStepsMark, { size: 16 }),
          expandLabel: t('card.expand'),
          collapseLabel: t('card.collapse'),
        }),
        controls,
        previewBlock,
        statusBar)))
    }

    // -----------------------------------------------------------------------
    // Settings section (M6): copied SegmentedControl primitive + row layout.
    // The old "show cards" Switch moved to the Host config, so the section only
    // renders a read-only note pointing at that gate.
    // -----------------------------------------------------------------------

    function SegmentedControl({ value, options, onChange, label }) {
      const index = Math.max(0, options.findIndex((option) => option.value === value))
      const style = {
        '--dsh-segment-count': String(options.length),
        '--dsh-segment-index': String(index),
      }
      const onKeyDown = (event) => {
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0
        if (delta === 0) return
        event.preventDefault()
        const next = options[(index + delta + options.length) % options.length]
        if (next.value !== value) onChange(next.value)
      }
      return h('div', {
        role: 'tablist',
        'aria-label': label,
        className: 'dshns-segmented',
        style,
        onKeyDown,
      },
      h('span', { 'aria-hidden': 'true', className: 'dshns-segmented-indicator' }),
      ...options.map((option) => h('button', {
        key: String(option.value),
        type: 'button',
        role: 'tab',
        'aria-selected': option.value === value,
        tabIndex: option.value === value ? 0 : -1,
        className: 'dshns-segmented-tab',
        onClick: () => { if (option.value !== value) onChange(option.value) },
      }, option.label)))
    }

    function SettingsSection(props) {
      const { t } = props
      const [settings, setSettings] = React.useState(() => readSettings())
      const [status, setStatus] = React.useState(null)

      function update(patch) {
        const next = clampSettings({ ...settings, ...patch })
        setSettings(next)
        setStatus(writeSettingsTo(window.localStorage, next) ? 'settings.saved' : 'settings.storageUnavailable')
      }

      function resetStates() {
        const removed = clearTurnStates(window.localStorage)
        setStatus(removed > 0 ? 'settings.resetDone' : 'settings.resetEmpty')
      }

      const options = [
        { value: 'auto', label: t('settings.auto') },
        ...[1, 2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) })),
      ]
      const row = (key, label, control) => h('div', { className: 'dshns-setting-row', key },
        h('span', { className: 'dshns-setting-label' }, label),
        control)
      return h('div', { className: 'dshns-settings' },
        h('h2', { className: 'dshns-settings-heading' }, t('settings.title')),
        h('p', { className: 'dshns-setting-note' }, t('settings.hostGate')),
        row('maxPerTurn', t('settings.maxPerTurn'), h(SegmentedControl, {
          value: settings.maxPerTurn,
          options,
          onChange: (value) => { update({ maxPerTurn: value }) },
          label: t('settings.maxPerTurn'),
        })),
        row('clickMode', t('settings.clickMode'), h(SegmentedControl, {
          value: settings.clickMode,
          options: [
            { value: 'fill', label: t('settings.clickFill') },
            { value: 'send', label: t('settings.clickSend') },
          ],
          onChange: (value) => { update({ clickMode: value }) },
          label: t('settings.clickMode'),
        })),
        h('p', { className: 'dshns-setting-note' }, t('settings.note')),
        h('div', { className: 'dshns-settings-actions' },
          h(Button, { variant: 'ghost', size: 'sm', onClick: resetStates }, t('settings.reset')),
          status === null ? null : h('span', { className: 'dshns-settings-status', role: 'status' }, t(status))))
    }

    // -----------------------------------------------------------------------
    // Process-group row (M5) — one-line record, copied from the official
    // ProposeRow + DisclosureRow markup/CSS and behavior.
    // -----------------------------------------------------------------------

    function AppsAddIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      },
      h('rect', { x: '2.25', y: '2.25', width: '4', height: '4', rx: '1' }),
      h('rect', { x: '2.25', y: '9.75', width: '4', height: '4', rx: '1' }),
      h('rect', { x: '9.75', y: '9.75', width: '4', height: '4', rx: '1' }),
      h('path', { d: 'M11.75 1.75v5M9.25 4.25h5' }))
    }

    function MinusIcon({ size = 16, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M4 8H12',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }

    function PlusIcon({ size = 16, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className,
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M4 8H12M8 4V12',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }

    function ChevronDownIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6',
        stroke: 'currentColor',
      }))
    }

    function ChevronUpIcon({ size = 14, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        strokeWidth: 1,
        className,
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10',
        stroke: 'currentColor',
      }))
    }

    /**
     * Monochrome 16px companion to `icon.svg`: the same suggestion-list + sparkle
     * mark, inked in `currentColor` for the Settings navigation row.
     */
    function SectionIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M2.8 4.3H9.6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M2.8 7.8H7.4',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M2.8 11.3H6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M12.5 2.2C12.7 3.45 13.5 4.25 14.75 4.45C13.5 4.65 12.7 5.45 12.5 6.7C12.3 5.45 11.5 4.65 10.25 4.45C11.5 4.25 12.3 3.45 12.5 2.2Z',
        fill: 'currentColor',
      }))
    }

    // -----------------------------------------------------------------------
    // TextShimmer (copied from the official primitive): the running-state sweep
    // over a row's title/summary. Context flag avoids double-decoration inside
    // the duplicated highlight copy.
    // -----------------------------------------------------------------------

    const ShimmerContext = React.createContext(undefined)

    function ShimmerText({ children, className }) {
      const inside = React.useContext(ShimmerContext) === true && typeof children === 'string'
      return h('span', {
        className: `dshns-shimmer-text ${className ?? ''}`,
        'data-shimmer-text': inside ? children : undefined,
      }, inside ? null : children)
    }

    const TextShimmer = React.memo(function TextShimmer({ children, active = false, className, contentClassName }) {
      const inside = React.useContext(ShimmerContext)
      if (inside !== undefined) return h(ShimmerText, { className }, children)
      const content = typeof children === 'string'
        ? h(ShimmerText, null, children)
        : children
      return h('span', {
        className: `dshns-shimmer ${className ?? ''}`,
        'data-shimmer': active ? '' : undefined,
      },
      h(ShimmerContext.Provider, { value: false },
        h('span', { className: `dshns-shimmer-content ${contentClassName ?? ''}` }, content)),
      active
        ? h('span', { className: 'dshns-shimmer-decoration', 'aria-hidden': 'true', inert: '' },
          h('span', { className: 'dshns-shimmer-sweep' },
            h(ShimmerContext.Provider, { value: true },
              h('span', { className: `dshns-shimmer-content dshns-shimmer-highlight ${contentClassName ?? ''}` }, content))))
        : null)
    })

    /**
     * Copied DisclosureRow: root[data-open] > header[data-disclosure-header] >
     * row[data-disclosure-row][data-expandable] with leading icon/chevron and a
     * title + collapsedContent; expands on row click or Enter/Space.
     */
    function DisclosureRow({
      icon,
      title,
      open,
      expandable,
      onToggle,
      running = false,
      expandOnRowClick = false,
      previewChevron = true,
      keepContentWhenOpen = false,
      collapsedContent,
      headerAccessory,
      children,
      className,
      rowClassName,
      leadingClassName,
      chevronClassName,
      titleClassName,
    }) {
      const rowExpandable = expandable === true && expandOnRowClick === true
      const onKeyDown = (event) => {
        if (!rowExpandable) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onToggle()
      }
      const idle = previewChevron
        ? h(React.Fragment, null,
          h('span', { className: 'dshns-disc-iconIdle' }, icon),
          h(ChevronDownIcon, { className: `dshns-disc-chevronHover ${chevronClassName ?? ''}` }))
        : icon
      const leadingIcon = open ? h(ChevronUpIcon, { className: chevronClassName }) : idle
      const leading = expandable === true && rowExpandable === false
        ? h('button', {
          type: 'button',
          className: `dshns-disc-leading ${leadingClassName ?? ''}`,
          'aria-label': title,
          'aria-expanded': open,
          onClick: (event) => {
            event.stopPropagation()
            onToggle()
          },
        }, leadingIcon)
        : h('span', { className: `dshns-disc-leading ${leadingClassName ?? ''}` }, leadingIcon)
      return h('div', {
        className: `dshns-disc-root ${className ?? ''}`,
        'data-open': open ? '' : undefined,
      },
      h('div', {
        className: 'dshns-disc-header',
        'data-disclosure-header': '',
        'data-has-accessory': headerAccessory === undefined || headerAccessory === null ? undefined : '',
      },
      h('div', {
        className: `dshns-disc-row ${rowClassName ?? ''}`,
        'data-disclosure-row': '',
        'data-expandable': rowExpandable ? '' : undefined,
        role: rowExpandable ? 'button' : undefined,
        tabIndex: rowExpandable ? 0 : undefined,
        'aria-expanded': rowExpandable ? open : undefined,
        onClick: rowExpandable ? onToggle : undefined,
        onKeyDown: rowExpandable ? onKeyDown : undefined,
      },
      leading,
      h(TextShimmer, {
        active: running,
        contentClassName: 'dshns-disc-content',
      },
      h(ShimmerText, { className: `dshns-disc-title ${titleClassName ?? ''}` }, title),
      keepContentWhenOpen || !open ? collapsedContent : null)),
      headerAccessory),
      open && children !== undefined && children !== null ? children : null)
    }

    /** Localize the machine-readable reasons the view model returns. */
    function localizeProcessReason(reason, t) {
      if (reason === '') return ''
      if (reason === 'interrupted') return t('note.interrupted')
      const key = noteToLocaleKey(reason)
      return key === null ? reason : t(key)
    }

    /** Context snippet shown after the status in the collapsed row. */
    function processSummary(phase, block) {
      try {
        if (phase === 'result') {
          const meta = parseMeta(block === undefined ? undefined : block.meta)
          return meta.shown === true ? meta.context : ''
        }
        if (phase === 'start' && block !== undefined && block.args !== undefined) {
          return block.args.text('context') ?? ''
        }
        return ''
      } catch {
        return ''
      }
    }

    function ProcessRow(props) {
      const { phase, block, inspect, t } = props
      const [open, setOpen] = React.useState(false)
      const isError = block !== undefined && block !== null && block.isError === true
      const errorCode = block !== undefined && block !== null && block.error !== undefined
        ? block.error.code
        : undefined
      const meta = block !== undefined && block !== null ? block.meta : undefined
      const state = deriveProcessState({ phase, isError, errorCode, meta })
      const reason = localizeProcessReason(
        processReason({
          phase,
          isError,
          errorCode,
          meta,
          content: block !== undefined && block !== null ? block.content : undefined,
        }),
        t,
      )
      const summary = processSummary(phase, block)
      const expandable = reason !== ''
      const collapsedContent = h('span', { className: 'dshns-row-summary' },
        h('span', null, t(`row.${state}`)),
        summary === '' ? null : h('span', { className: 'dshns-row-title' }, summary))
      return h('div', { 'data-tool': TOOL_NAME, 'data-state': state },
        h(DisclosureRow, {
          icon: h(AppsAddIcon, { size: 14 }),
          title: t('row.title'),
          open: open && expandable,
          expandable,
          running: state === 'preparing' || state === 'running',
          onToggle: () => { setOpen((value) => !value) },
          expandOnRowClick: true,
          keepContentWhenOpen: true,
          collapsedContent,
        },
        h('pre', { className: 'dshns-row-reason' }, reason),
        typeof inspect === 'function'
          ? h('button', {
            type: 'button',
            className: 'dshns-row-inspect',
            onClick: () => { inspect() },
          }, t('row.inspect'))
          : null))
    }

    // -----------------------------------------------------------------------
    // Conversation Definition (turn-scoped fold of this tool's events)
    // -----------------------------------------------------------------------

    const SURFACE_EVENT_TYPES = new Set([
      'system/message',
      'developer/message',
      'user/message',
      'assistant/message',
      'tool/result',
    ])
    const isSurfaceEvent = (event) => SURFACE_EVENT_TYPES.has(event.type) && event.surfaceOp !== undefined
    const isAppendSurfaceEvent = (event) => isSurfaceEvent(event) && event.surfaceOp === 'append'

    const nextStepsDefinition = {
      kind: DEFINITION_KEY,
      match: (event) => {
        if (event.type === 'turn/start') {
          return { id: String(event.data.turn), role: 'start' }
        }
        if (event.type === 'tool/call' && event.data.name === TOOL_NAME) {
          return { id: String(event.data.turn), role: 'update' }
        }
        if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
          return { id: String(event.data.turn), role: 'update' }
        }
        return null
      },
      start: (_context, match) => ({
        turn: match.event.data.turn,
        calls: new Map(),
        model: null,
      }),
      update: (context, match) => {
        const state = context.state
        if (match.event.type === 'tool/call') {
          const calls = new Map(state.calls)
          calls.set(String(match.event.data.callId), {
            argsRaw: match.event.data.arguments,
            seq: match.event.seq,
          })
          return { ...state, calls }
        }
        if (match.event.type !== 'tool/result') return state
        // Replacement copies of a result must not re-publish the card.
        if (!isAppendSurfaceEvent(match.event)) return state
        const message = match.event.data.message
        if (message === undefined || message.isError === true) return state
        const source = message.source ?? {}
        const callId = String(source.callId ?? message.toolCallId ?? '')
        const call = state.calls.get(callId)
        if (call === undefined) return state
        // A persisted meta with a boolean `shown` is authoritative even when it
        // says "no card"; only a missing/corrupt meta falls back to the arguments.
        const model = isAuthoritativeMeta(match.event.data.meta)
          ? parseMeta(match.event.data.meta)
          : modelFromArgs(call.argsRaw)
        if (model === null || model.shown !== true || state.model === model) return state
        return { ...state, model }
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state.model === null) return null
        const value = { turn: context.state.turn, model: context.state.model }
        if (
          previous !== undefined
          && previous !== null
          && previous.kind === 'turn'
          && previous.turn === value.turn
          && previous.key === DEFINITION_KEY
          && previous.value === value
        ) {
          return previous
        }
        return { kind: 'turn', turn: value.turn, key: DEFINITION_KEY, value }
      },
    }

    // -----------------------------------------------------------------------
    // Plugin entry
    // -----------------------------------------------------------------------

    function apply(ctx) {
      sharedCtx = ctx

      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-next-actions: locale')
      const t = ctx.locale.bind(NS)
      if (STYLES !== '') {
        ctx.effect(() => {
          const element = injectStyles(STYLES)
          return () => element.remove()
        }, 'dsh-next-actions: styles')
      }

      ctx.effect(
        () => ctx.uiConversation.events.register(nextStepsDefinition),
        'dsh-next-actions: definition',
      )

      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: PKG,
        order: CARD_ORDER,
        locale: NS,
      }, NextStepsCard))

      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: TOOL_NAME,
        locale: NS,
      }, ProcessRow))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: PKG,
        order: 60,
        label: () => t('settings.title'),
        locale: NS,
      }, SettingsSection))

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: PKG,
        order: 60,
        label: () => t('settings.title'),
        locale: NS,
      }, SectionIcon))
    }

    return {
      // `uiConversation` is injected (not looked up lazily) so the plugin only
      // activates once the Conversation service exists; otherwise a cold boot
      // would skip the definition registration and lose the card after restart.
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      // Test seam for the built bundle (DSH ignores additional exports).
      __test: { nextStepsDefinition, parseMeta, modelFromArgs, buildDisplay },
    }
  },
})
