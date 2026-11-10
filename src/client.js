/**
 * Browser half template for @local/dsh-next-actions.
 *
 * M2: turn-tail data layer — a Conversation Definition folds this tool's
 * `tool/call` + `tool/result` (preferring the Host-persisted `tool/result.meta`,
 * falling back to the arguments when compaction dropped it) into
 * `turn.data.get('next-steps')`.
 * M10 (2026-11-10): PTC (`run_code`) sessions fold `tool/ptc-dispatch-start` +
 * `tool/ptc-dispatch` into the same turn data. Those records carry `meta` and
 * `isError` directly on `data` and are placed in a turn through the outer
 * `run_code` call, which is the only record naming the turn.
 * M3: the card renders the official action-card frame (copied markup/CSS, no
 * Harness Client imports), fills the input draft on click, and owns the
 * conflict / dismiss / hover-peek states.
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
      'chip.filled': 'Filled',
      'status.filled': 'Filled into the input — review and send',
      'status.danger': 'This may be irreversible — review before sending',
      'status.dismissed': 'Dismissed',
      'status.conflict': 'The input already has content',
      'status.unavailable': 'The composer is unavailable',
      'preview.label': 'Will fill',
      'conflict.compareTarget': 'Will fill',
      'conflict.compareDraft': 'Current draft',
      'conflict.appendPrimary': 'Append to draft',
      'conflict.replace': 'Replace',
      'conflict.cancel': 'Cancel',
      'conflict.expand': 'Expand full text',
      'conflict.collapse': 'Collapse full text',
      'conflict.scrollRegion': 'Target instruction and current draft',
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
      'settings.note': 'Clicking a suggestion only fills the input; nothing is sent automatically. Dangerous suggestions are marked “Needs confirmation”.',
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
      'chip.filled': '已填入',
      'status.filled': '已填入输入框，可修改后发送',
      'status.danger': '该操作可能不可逆，请确认后发送',
      'status.dismissed': '已忽略',
      'status.conflict': '输入框已有内容',
      'status.unavailable': '输入框暂不可用',
      'preview.label': '将填入',
      'conflict.compareTarget': '将填入',
      'conflict.compareDraft': '当前草稿',
      'conflict.appendPrimary': '追加到末尾',
      'conflict.replace': '替换',
      'conflict.cancel': '取消',
      'conflict.expand': '展开全文',
      'conflict.collapse': '收起全文',
      'conflict.scrollRegion': '目标指令与当前草稿',
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
      'settings.note': '点击建议只会填入输入框，不会自动发送；危险建议会标记「需确认」。',
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

    // -----------------------------------------------------------------------
    // FoldedText — two-line clamp with a measured expand/collapse
    // -----------------------------------------------------------------------

    /**
     * Long text is clamped to two lines. The toggle renders only when the
     * rendered text actually overflows (DOM measurement, not a character
     * budget), so card-width and font changes cannot leave a dead or missing
     * affordance. Expanding is always an explicit click: hovering never
     * changes the card height.
     */
    function FoldedText({ text, lead, expandLabel, collapseLabel }) {
      const id = React.useId()
      const [expanded, setExpanded] = React.useState(false)
      const [overflow, setOverflow] = React.useState(false)
      const textRef = React.useRef(null)
      React.useLayoutEffect(() => {
        const element = textRef.current
        if (element === null || expanded) return undefined
        const measure = () => {
          try {
            setOverflow(element.scrollHeight > element.clientHeight + 1)
          } catch {
            setOverflow(false)
          }
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(element)
          return () => { observer.disconnect() }
        }
        return undefined
      }, [text, expanded])
      return h(React.Fragment, null,
        h('p', {
          id,
          ref: textRef,
          className: expanded ? 'dshns-text' : 'dshns-text dshns-text-clamped',
        }, lead ?? null, text),
        overflow || expanded
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

    // -----------------------------------------------------------------------
    // ConflictCompare — target + current draft, expandable on click
    // -----------------------------------------------------------------------

    /**
     * The compact conflict decision block. Target prompt and current draft are
     * each clamped to one line while collapsed; the expand control appears only
     * when text actually overflows and swapping in/out changes height only
     * after an explicit click. This keeps the default conflict card compact and
     * never ties height changes to pointer movement.
     *
     * Expanded content can be much taller than the card (a draft is not capped),
     * so the two lines sit in a region capped at 240px with `overflow-y: auto`;
     * the toggle stays outside it and the region becomes a focusable group only
     * when it really scrolls, so keyboard users can reach the hidden lines.
     */
    function ConflictCompare({ prompt, draft, t }) {
      const id = React.useId()
      const [expanded, setExpanded] = React.useState(false)
      const [overflow, setOverflow] = React.useState(false)
      const [scrollable, setScrollable] = React.useState(false)
      const compareRef = React.useRef(null)
      const linesRef = React.useRef(null)
      React.useLayoutEffect(() => {
        const root = compareRef.current
        if (root === null || expanded) return undefined
        const measure = () => {
          try {
            let next = false
            for (const element of root.querySelectorAll('.dshns-conflict-text')) {
              if (element.scrollWidth > element.clientWidth + 1) next = true
            }
            setOverflow(next)
          } catch {
            setOverflow(false)
          }
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(root)
          return () => { observer.disconnect() }
        }
        return undefined
      }, [prompt, draft, expanded])
      React.useLayoutEffect(() => {
        const element = linesRef.current
        if (element === null || !expanded) {
          setScrollable(false)
          return undefined
        }
        const measure = () => {
          try {
            setScrollable(element.scrollHeight > element.clientHeight + 1)
          } catch {
            setScrollable(false)
          }
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(element)
          return () => { observer.disconnect() }
        }
        return undefined
      }, [expanded, prompt, draft])
      return h('div', {
        id,
        ref: compareRef,
        className: 'dshns-conflict-compare',
        role: 'note',
        'data-expanded': expanded ? '' : undefined,
      },
      h('div', {
        ref: linesRef,
        className: 'dshns-conflict-lines',
        role: scrollable ? 'group' : undefined,
        tabIndex: scrollable ? 0 : undefined,
        'aria-label': scrollable ? t('conflict.scrollRegion') : undefined,
      },
      h('p', { className: 'dshns-conflict-line' },
        h('span', { className: 'dshns-conflict-label' }, t('conflict.compareTarget')),
        h('span', { className: 'dshns-conflict-text' }, prompt)),
      h('p', { className: 'dshns-conflict-line' },
        h('span', { className: 'dshns-conflict-label' }, t('conflict.compareDraft')),
        h('span', { className: 'dshns-conflict-text' }, draft))),
      overflow || expanded
        ? h(Button, {
          variant: 'ghost',
          size: 'sm',
          className: 'dshns-conflict-toggle',
          'aria-expanded': expanded,
          'aria-controls': id,
          onClick: () => { setExpanded((value) => !value) },
        }, expanded ? t('conflict.collapse') : t('conflict.expand'))
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
      const [peek, setPeek] = React.useState(null)
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
      // The draft is authoritative for the "filled" marker and the danger
      // warning: a click or a restored id only counts while the composer still
      // contains exactly what the card wrote.
      const view = deriveCardView({
        suggestions: model.suggestions,
        draft,
        persistedId: turnState.filledId,
        applied: appliedRef.current,
        conflict: conflict !== null,
        dismissed: turnState.dismissed,
        canWrite,
      })
      const status = view.statusKey
      const items = expanded ? model.suggestions : display.items
      const moreCount = expanded ? 0 : display.moreCount
      const title = t('card.title')

      function applyFill(text, suggestion, owned = true) {
        if (!canWrite) return
        const danger = suggestion.danger === true
        inputActions.setDraft(text)
        // Keep the exact text we wrote and whether the card owns it: an
        // appended draft contains the user's own text, so a later click must
        // ask before replacing it. This record also decides the "filled" marker
        // and danger warning, but only while `draft` still equals `text`.
        appliedRef.current = {
          id: suggestion.id,
          text,
          prompt: suggestion.prompt,
          danger,
          owned,
        }
        const next = { ...turnState, filledId: suggestion.id }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPeek(null)
        focusComposer(sessionId)
      }

      function onPick(suggestion) {
        if (!canWrite) return
        const applied = appliedRef.current
        const action = resolveDraftAction({
          draft,
          appliedPrompt: applied !== null && applied.owned === true ? applied.text : '',
        })
        if (action.kind === 'conflict') {
          setConflict(suggestion)
          setPeek(null)
          return
        }
        applyFill(suggestion.prompt, suggestion)
      }

      function onConflictChoice(choice) {
        if (conflict === null) return
        setConflict(null)
        setPeek(null)
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
        setPeek(null)
      }

      function onRestore() {
        const next = { ...turnState, dismissed: false }
        setTurnState(next)
        writeTurnState(sessionId, turnNumber, next)
        setConflict(null)
        setPeek(null)
      }

      function renderChip(suggestion) {
        const marker = deriveChipMarker({ suggestion, filledId: view.filledId })
        // WCAG 2.5.3: the accessible name has to contain the visible label, so
        // the full prompt is appended after it instead of replacing it.
        const accessibleName = suggestion.prompt === suggestion.label
          ? suggestion.label
          : `${suggestion.label}：${suggestion.prompt}`
        const markerNode = marker === 'danger'
          ? h('span', { className: 'dshns-marker dshns-marker-danger' },
            h(WarningIcon, { className: 'dshns-warn' }),
            t('chip.danger'))
          : marker === 'filled'
            ? h('span', { className: 'dshns-marker' }, t('chip.filled'))
            : marker === 'recommended'
              ? h('span', { className: 'dshns-marker' }, t('chip.recommended'))
              : null
        return h(Button, {
          key: suggestion.id,
          variant: suggestion.recommended === true ? 'primary' : 'ghost',
          size: 'sm',
          className: 'dshns-chip',
          'aria-label': accessibleName,
          disabled: !canWrite,
          onClick: () => { onPick(suggestion) },
          onMouseEnter: () => { setPeek(suggestion.prompt) },
          onMouseLeave: () => { setPeek(null) },
          onFocus: () => { setPeek(suggestion.prompt) },
          onBlur: () => { setPeek(null) },
        },
        h('span', { className: 'dshns-chip-label' }, suggestion.label),
        markerNode)
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
            h(ConflictCompare, {
              key: conflict.id,
              prompt: conflict.prompt,
              draft,
              t,
            }))
          : null

      // Hover/focus only swaps text inside the existing status row. Nothing is
      // inserted, so pointer movement can never change the card's geometry.
      const peekText = canWrite && mode === 'suggestions' && peek !== null
        ? `${t('preview.label')} · ${peek}`
        : null
      const statusText = peekText !== null
        ? peekText
        : (status === null || status === undefined ? null : t(status))
      // Conflict actions share the status row: keeping them there instead of a
      // separate row keeps the conflict card close to the resting card height.
      const conflictActions = mode === 'conflict'
        ? [
          h(Button, { key: 'append', variant: 'primary', size: 'sm', onClick: () => { onConflictChoice('append') } }, t('conflict.appendPrimary')),
          h(Button, { key: 'replace', variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('replace') } }, t('conflict.replace')),
          h(Button, { key: 'cancel', variant: 'ghost', size: 'sm', onClick: () => { onConflictChoice('cancel') } }, t('conflict.cancel')),
        ]
        : null
      // One quiet state toggle at the end of the status row: minus dismisses the
      // suggestions, plus restores them. The label is visible, not tooltip-only.
      const dismissed = turnState.dismissed === true
      const stateActions = conflictActions ?? (mode === 'suggestions'
        ? [h(Button, {
          key: 'dismiss',
          variant: 'ghost',
          size: 'sm',
          className: 'dshns-dismiss',
          icon: h(MinusIcon, { size: 16 }),
          onClick: onDismiss,
          'aria-label': t('card.dismiss'),
        }, t('card.dismiss'))]
        : dismissed
          ? [h(Button, {
            key: 'restore',
            variant: 'ghost',
            size: 'sm',
            className: 'dshns-restore',
            icon: h(PlusIcon, { size: 16 }),
            onClick: onRestore,
            'aria-label': t('card.restore'),
          }, t('card.restore'))]
          : [])
      const statusBar = statusText === null && stateActions.length === 0
        ? null
        : h('div', { className: `dshns-statusbar${mode === 'conflict' ? ' dshns-statusbar-conflict' : ''}` },
          statusText === null ? null : h('p', {
            className: peekText === null ? 'dshns-status' : 'dshns-status dshns-status-peek',
            // The peek is a transient visual hint; keep it out of the polite
            // live region so focus/pointer movement does not make a screen
            // reader announce the prompt on every chip.
            role: peekText === null ? 'status' : undefined,
          }, statusText),
          ...stateActions)

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

    function WarningIcon({ size = 12, className }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className,
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M8 1.8 14.6 13.2H1.4L8 1.8Z',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinejoin: 'round',
      }),
      h('path', { d: 'M8 6v3.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      h('circle', { cx: '8', cy: '11.4', r: '.7', fill: 'currentColor' }))
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
    //
    // Two transports reach the Session log:
    //   - native: `tool/call` (arguments are a JSON string) plus an append
    //     `tool/result` whose `message` carries the result and whose `meta`
    //     carries the normalized display model;
    //   - PTC (`run_code` programs): `tool/ptc-dispatch-start` and
    //     `tool/ptc-dispatch`, where `arguments` is already a JSON value and
    //     `meta`/`isError` hang directly off `data`. Those records carry no
    //     `turn`; only the outer `run_code` call names it, so the matcher
    //     keeps a small call-id -> turn index while it forwards events.
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

    /** Reserved PTC transport: its `tool/call` record is the only turn owner. */
    const RUN_CODE_TOOL = 'run_code'
    const MAX_RUN_CODE_TURNS = 1024
    /** run_code callId -> turn, for PTC dispatches that carry no turn themselves. */
    const runCodeTurns = new Map()

    /**
     * Remember one `run_code` call's turn. The matcher sees the outer call
     * before its dispatch records, so a bounded insertion-ordered index is
     * enough; it only ever maps immutable call identities.
     */
    function rememberRunCodeTurn(event) {
      const data = event.data
      if (typeof data.callId !== 'string' || !Number.isSafeInteger(data.turn)) return
      if (runCodeTurns.size >= MAX_RUN_CODE_TURNS) {
        const oldest = runCodeTurns.keys().next().value
        if (oldest !== undefined) runCodeTurns.delete(oldest)
      }
      runCodeTurns.set(data.callId, data.turn)
    }

    /** Turn of a PTC dispatch event, resolved through its outer `run_code` call. */
    function ptcTurnOf(event) {
      const data = event.data
      const callId = typeof data.rootCallId === 'string' ? data.rootCallId : data.parentCallId
      return typeof callId === 'string' ? runCodeTurns.get(callId) : undefined
    }

    /** Turn carried by a native call/result event. */
    function eventTurn(event) {
      const turn = event.data.turn
      return Number.isSafeInteger(turn) && turn >= 0 ? turn : undefined
    }

    /**
     * Turn of one framework Match. Matcher functions only receive the raw
     * event (0.2.2), while `start`, `update` and `buildLocationData` also
     * receive the resolved Match location; prefer the location and fall back
     * to the event payload for direct (test) folds.
     */
    function matchTurn(match) {
      const location = match.location
      if (location !== undefined && location !== null && (location.kind === 'turn' || location.kind === 'step')) {
        const turn = location.turn === undefined || location.turn === null ? undefined : location.turn.turn
        if (Number.isSafeInteger(turn) && turn >= 0) return turn
      }
      const event = match.event
      return event === undefined || event === null ? undefined : eventTurn(event)
    }

    const nextStepsDefinition = {
      kind: DEFINITION_KEY,
      match: (event) => {
        if (event.type === 'turn/start') {
          return { id: String(event.data.turn), role: 'start' }
        }
        if (event.type === 'tool/call') {
          if (event.data.name === RUN_CODE_TOOL) rememberRunCodeTurn(event)
          return event.data.name === TOOL_NAME
            ? { id: String(event.data.turn), role: 'update' }
            : null
        }
        if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
          return { id: String(event.data.turn), role: 'update' }
        }
        if (event.type === 'tool/ptc-dispatch-start' && event.data.name === TOOL_NAME) {
          const turn = ptcTurnOf(event)
          return turn === undefined ? null : { id: String(turn), role: 'start' }
        }
        if (event.type === 'tool/ptc-dispatch' && event.data.name === TOOL_NAME) {
          const turn = ptcTurnOf(event)
          return turn === undefined ? null : { id: String(turn), role: 'update' }
        }
        return null
      },
      start: (_context, match) => {
        const event = match.event
        const calls = new Map()
        // A window can begin at the dispatch instead of `turn/start`; record
        // that first call here so the settled record can still fall back to it.
        if (event.type === 'tool/ptc-dispatch-start') {
          calls.set(String(event.data.subCallId), {
            argsRaw: JSON.stringify(event.data.arguments === undefined ? {} : event.data.arguments),
            seq: event.seq,
          })
        }
        return { turn: matchTurn(match), calls, model: null }
      },
      update: (context, match) => {
        const state = context.state
        const event = match.event
        if (event.type === 'tool/call') {
          const calls = new Map(state.calls)
          calls.set(String(event.data.callId), {
            argsRaw: event.data.arguments,
            seq: event.seq,
          })
          return { ...state, calls }
        }
        if (event.type === 'tool/ptc-dispatch-start') {
          const calls = new Map(state.calls)
          calls.set(String(event.data.subCallId), {
            argsRaw: JSON.stringify(event.data.arguments === undefined ? {} : event.data.arguments),
            seq: event.seq,
          })
          return { ...state, calls }
        }
        // Both transports expose the same durable meta; the recorded arguments
        // only back a pruned or missing meta.
        let callId
        let meta
        if (event.type === 'tool/result') {
          // Replacement copies of a result must not re-publish the card.
          if (!isAppendSurfaceEvent(event)) return state
          const message = event.data.message
          if (message === undefined || message.isError === true) return state
          const source = message.source ?? {}
          callId = String(source.callId ?? message.toolCallId ?? '')
          meta = event.data.meta
        } else if (event.type === 'tool/ptc-dispatch') {
          if (event.data.isError === true) return state
          callId = String(event.data.subCallId)
          meta = event.data.meta
        } else {
          return state
        }
        const call = state.calls.get(callId)
        if (call === undefined) return state
        // A persisted meta with a boolean `shown` is authoritative even when it
        // says "no card"; only a missing/corrupt meta falls back to the arguments.
        const model = isAuthoritativeMeta(meta) ? parseMeta(meta) : modelFromArgs(call.argsRaw)
        if (model === null || model.shown !== true || state.model === model) return state
        return { ...state, model }
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || context.state === undefined || context.state.model === null) return null
        const turn = context.state.turn
        if (!Number.isSafeInteger(turn) || turn < 0) return null
        const value = { turn, model: context.state.model }
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
