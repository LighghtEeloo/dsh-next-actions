/**
 * Normalize `suggest_next_actions` arguments into the card model.
 *
 * Host only: the result is persisted as `tool/result.meta`, which the browser
 * half renders as-is. Import-free and side-effect-free.
 */

export const LIMITS = Object.freeze({ suggestions: 3, context: 240, label: 24, prompt: 500 })

/**
 * A hit marks a suggestion as needing confirmation; clicking still only fills the input.
 * English commands are command-shaped, so they match anywhere in the text.
 */
export const RISK = /\brm\s+-rf\b|\bforce[- ]?push\b|--force\b|\bdrop\s+(table|database)\b|\bsudo\b|\bdeploy\b|\bpublish\b|\bproduction\b/i

/** Chinese risk words count only where the clause reads as that action. */
const RISK_VERB = /^(?:删除|清空|重置|强制推送|强推|发布|部署|上线|付费|支付|授权|卸载|回滚|销毁)/

/** Negation with the short span it governs: 「不要发布」 quotes a risk word instead of doing it. */
const NEGATION = /(?:不要|不用|无需|不必|不|别|勿|禁止|don'?t|do not|never)\s*[^。!?！？；;，,\n]{0,8}/gi

/** Listing marks and light modal words between a clause boundary and its action. */
const LEAD = /^\s*(?:(?:\d+[.)、]|[-*•])\s*)?(?:(?:请|先|再|然后|直接|立即|马上|立刻|务必|帮我|帮忙|执行|进行|尝试|准备|开始|即将|计划|打算|需要|要)\s*)*/

const CLAUSE = /[。!?！？；;，,\n]/

/** Whether a suggestion reads as an action that needs confirmation. */
export function isRisky(subject) {
  const stripped = subject.replace(NEGATION, '')
  if (RISK.test(stripped)) return true
  return stripped.split(CLAUSE).some((clause) => RISK_VERB.test(clause.replace(LEAD, '')))
}

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

function clip(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * @param {unknown} raw - tool arguments (object or JSON string), or a persisted meta.
 * @returns {{ shown: true, context: string, suggestions: { label: string, prompt: string, danger?: true }[] } | { shown: false, note: string }}
 */
export function buildMeta(raw) {
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
  const entries = []
  let recommended = null
  for (const item of Array.isArray(args.suggestions) ? args.suggestions : []) {
    if (item === null || typeof item !== 'object') continue
    const prompt = clip(text(item.prompt) || text(item.label), LIMITS.prompt)
    const key = prompt.toLowerCase()
    if (prompt === '' || seen.has(key)) continue
    seen.add(key)
    const label = clip(text(item.label) || prompt, LIMITS.label)
    const entry = { label, prompt }
    if (item.danger === true || isRisky(`${label}\n${prompt}`)) entry.danger = true
    // At most one recommendation; it always leads the card.
    if (item.recommended === true && recommended === null) {
      entry.recommended = true
      recommended = entry
    } else {
      entries.push(entry)
    }
  }
  const suggestions = recommended === null ? entries : [recommended, ...entries]
  if (suggestions.length === 0) return { shown: false, note: 'no-usable-suggestions' }
  return { shown: true, context, suggestions: suggestions.slice(0, LIMITS.suggestions) }
}
