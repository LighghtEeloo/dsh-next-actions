/**
 * Normalize `suggest_next_actions` arguments into the card model.
 *
 * Host only: the result is persisted as `tool/result.meta`, which the browser
 * half renders as-is. Import-free and side-effect-free.
 */

export const LIMITS = Object.freeze({ suggestions: 3, context: 240, label: 24, prompt: 500 })

/**
 * Command-shaped risk patterns: a hit marks a suggestion as needing confirmation.
 * Clicking still only fills the input, so the mark never blocks the user.
 */
export const RISK = /\brm\s+-rf\b|\bforce[- ]?push\b|--force\b|\bdrop\s+(table|database)\b|\btruncate\s+table\b|\bsudo\b|\bformat\s+(disk|drive|volume)\b/i

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

function clip(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * @param {unknown} args - tool arguments as parsed by the Host.
 * @returns {{ shown: true, context: string, suggestions: { label: string, prompt: string, danger?: true }[] } | { shown: false, note: string }}
 */
export function buildMeta(args) {
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
    if (item.danger === true || RISK.test(`${label}\n${prompt}`)) entry.danger = true
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
