/**
 * Normalize `suggest_next_actions` arguments into the card model.
 *
 * Host only: the result is persisted as `tool/result.meta`, which the browser
 * half renders as-is. Import-free and side-effect-free.
 */

export const LIMITS = Object.freeze({ suggestions: 3, context: 240, labelWidth: 80, prompt: 500 })

/**
 * Display width in columns, following East Asian Width: CJK, Hangul, kana,
 * fullwidth forms and emoji take two columns; combining marks and zero-width
 * controls take none; everything else takes one. This keeps the review honest
 * across scripts, where a 45-character label can be much wider than an
 * 80-character one.
 */
const WIDE_RANGES = Object.freeze([
  [0x1100, 0x115f], // Hangul Jamo
  [0x2329, 0x232a], // angle brackets
  [0x2e80, 0x303e], // CJK radicals through CJK symbols
  [0x3041, 0x33ff], // kana through CJK compatibility
  [0x3400, 0x4dbf], // CJK extension A
  [0x4dc0, 0x4dff], // Yijing hexagram symbols
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe6f], // CJK compatibility forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x1b000, 0x1b2ff], // kana supplement and extended
  [0x1f000, 0x1f0ff], // mahjong and playing cards
  [0x1f1e6, 0x1f1ff], // regional indicators
  [0x1f200, 0x1f2ff], // enclosed ideographic supplement
  [0x1f300, 0x1faff], // emoji
  [0x20000, 0x3fffd], // CJK extensions B and later
])

const ZERO_WIDTH = /^[\p{M}\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff]$/u

function isWide(code) {
  for (const [start, end] of WIDE_RANGES) {
    if (code < start) return false
    if (code <= end) return true
  }
  return false
}

function charWidth(char) {
  const code = char.codePointAt(0)
  if (code < 0x20 || code === 0x7f || ZERO_WIDTH.test(char)) return 0
  return isWide(code) ? 2 : 1
}

/** Columns a string occupies when rendered in the card's label font. */
export function textWidth(value) {
  let width = 0
  for (const char of value) width += charWidth(char)
  return width
}

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

/** Shorten to a display width, reserving one column for the ellipsis. */
function clipWidth(value, max) {
  if (textWidth(value) <= max) return value
  let width = 0
  let result = ''
  for (const char of value) {
    const next = charWidth(char)
    if (width + next > max - 1) break
    result += char
    width += next
  }
  return `${result}…`
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
    const label = text(item.label)
    const prompt = clip(text(item.prompt) || label, LIMITS.prompt)
    const key = prompt.toLowerCase()
    if (prompt === '' || seen.has(key)) continue
    seen.add(key)
    // A model-written label stays whole; only a label derived from the prompt
    // has to be shortened to fit. Overwide explicit labels are reviewed before
    // the card is shown, so the client never truncates them.
    const entry = { label: label || clipWidth(prompt, LIMITS.labelWidth), prompt }
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

/**
 * Labels on the card wider than the limit after normalization. The Host asks
 * the model to shorten them instead of clipping: a cut action hides what the
 * click will do. Positions are 1-based in card order.
 *
 * @param {ReturnType<typeof buildMeta>} meta
 * @returns {{ position: number, label: string, width: number }[]}
 */
export function overwideLabels(meta) {
  if (meta?.shown !== true || !Array.isArray(meta.suggestions)) return []
  return meta.suggestions.flatMap((suggestion, index) => {
    const width = textWidth(suggestion.label)
    return width > LIMITS.labelWidth ? [{ position: index + 1, label: suggestion.label, width }] : []
  })
}
