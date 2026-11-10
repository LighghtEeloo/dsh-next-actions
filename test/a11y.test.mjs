import test from 'node:test'
import assert from 'node:assert/strict'
import { STYLES } from '../src/styles.js'

/**
 * Accessibility contract for the card stylesheet.
 *
 * The theme token values are copied from the DSH 0.2.2-rc.1 theme client
 * (`body` = light, `body[data-ds-dark-theme]` = dark); the same resolved values
 * are listed in docs/design/ui-review-2026-11-10/notes-visual.md. Keeping the
 * few tokens this file needs local lets the contrast contract fail loudly if a
 * rule starts using a token that misses AA on the surface it sits on.
 */
const TOKENS = {
  light: {
    '--dsw-alias-bg-layer-1': '#ffffff',
    '--dsw-alias-bg-module-platform': '#f5f6f7',
    '--dsw-alias-label-primary': '#0f1115',
    '--dsw-alias-label-secondary': '#61666b',
    '--dsw-alias-label-tertiary': '#81858c',
    '--dsw-alias-label-primary-foreground': '#ffffff',
    '--dsw-alias-state-warn-label': '#dd8629',
    '--dsw-alias-state-business-primary': '#4176e6',
  },
  dark: {
    '--dsw-alias-bg-layer-1': '#232324',
    '--dsw-alias-bg-module-platform': '#353638',
    '--dsw-alias-label-primary': '#f9fafb',
    '--dsw-alias-label-secondary': '#cfd3d6',
    '--dsw-alias-label-tertiary': '#adb2b8',
    '--dsw-alias-label-primary-foreground': '#0f1115',
    '--dsw-alias-state-warn-label': '#dd8629',
    '--dsw-alias-state-business-primary': '#7aaaff',
  },
}

const MIN_TEXT_CONTRAST = 4.5 // WCAG 2.2 AA, normal text
const MIN_NON_TEXT_CONTRAST = 3 // WCAG 2.2 AA 1.4.11
const MIN_TARGET_HEIGHT = 32 // this card's target-size rule for every control

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Declarations of the first rule whose selector line starts with `selector`. */
function declarations(selector) {
  // The lookahead keeps `.dshns-btn-sm` from matching `.dshns-btn-sm:focus`
  // style variants that share the prefix.
  const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}(?![\\w:-])(?:[^{}]*)\\{`)
  const match = pattern.exec(STYLES)
  assert.ok(match !== null, `expected a stylesheet rule for ${selector}`)
  const open = match.index + match[0].length
  const close = STYLES.indexOf('}', open)
  assert.ok(close > open, `expected a closed rule for ${selector}`)
  return STYLES.slice(open, close)
}

function property(selector, name) {
  const match = new RegExp(`(?:^|;|\\n)\\s*${escapeRegExp(name)}\\s*:\\s*([^;]+);`).exec(
    declarations(selector),
  )
  assert.ok(match !== null, `expected ${name} in ${selector}`)
  return match[1].trim()
}

function tokenOf(value) {
  const match = /var\((--[\w-]+)\)/.exec(value)
  assert.ok(match !== null, `expected a theme token in "${value}"`)
  return match[1]
}

function resolve(theme, token) {
  const value = TOKENS[theme][token]
  assert.ok(value !== undefined, `no resolved value for ${token} in the ${theme} theme`)
  return value
}

function linear(channel) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const value = hex.replace('#', '')
  return 0.2126 * linear(parseInt(value.slice(0, 2), 16))
    + 0.7152 * linear(parseInt(value.slice(2, 4), 16))
    + 0.0722 * linear(parseInt(value.slice(4, 6), 16))
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  const high = Math.max(a, b)
  const low = Math.min(a, b)
  return (high + 0.05) / (low + 0.05)
}

/** Composite one opaque color over another at `weight` (0-1) of the first. */
function mix(first, second, weight) {
  const a = first.replace('#', '')
  const b = second.replace('#', '')
  const channels = [0, 2, 4].map((offset) => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * weight
      + parseInt(b.slice(offset, offset + 2), 16) * (1 - weight),
  ))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function ratios(value, surfaceToken) {
  return Object.fromEntries(Object.keys(TOKENS).map((theme) => [
    theme,
    contrast(resolve(theme, tokenOf(value)), resolve(theme, surfaceToken)),
  ]))
}

test('status-row peek text meets AA in both themes', () => {
  const color = property('.dshns-status-peek', 'color')
  assert.equal(tokenOf(color), '--dsw-alias-label-secondary')
  const measured = ratios(color, '--dsw-alias-bg-layer-1')
  for (const [theme, ratio] of Object.entries(measured)) {
    assert.ok(ratio >= MIN_TEXT_CONTRAST, `peek contrast in ${theme} is ${ratio.toFixed(2)}:1`)
  }
})

test('conflict compare labels meet AA on the module surface', () => {
  const color = property('.dshns-conflict-label', 'color')
  assert.equal(tokenOf(color), '--dsw-alias-label-secondary')
  const measured = ratios(color, '--dsw-alias-bg-module-platform')
  for (const [theme, ratio] of Object.entries(measured)) {
    assert.ok(ratio >= MIN_TEXT_CONTRAST, `conflict label contrast in ${theme} is ${ratio.toFixed(2)}:1`)
  }
})

test('conflict expand toggle keeps AA and a non-color link cue', () => {
  const color = property('.dshns-btn.dshns-conflict-toggle', 'color')
  assert.equal(tokenOf(color), '--dsw-alias-label-secondary')
  assert.match(property('.dshns-btn.dshns-conflict-toggle', 'text-decoration'), /underline/)
  const measured = ratios(color, '--dsw-alias-bg-module-platform')
  for (const [theme, ratio] of Object.entries(measured)) {
    assert.ok(ratio >= MIN_TEXT_CONTRAST, `conflict toggle contrast in ${theme} is ${ratio.toFixed(2)}:1`)
  }
  const hover = property('.dshns-btn.dshns-conflict-toggle:hover:not(:disabled)', 'color')
  assert.equal(tokenOf(hover), '--dsw-alias-label-primary')
})

test('warning icon clears the 3:1 non-text threshold in both themes', () => {
  const color = property('.dshns-warn', 'color')
  const parsed = /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, var\((--[\w-]+)\)\)$/.exec(color)
  assert.ok(parsed !== null, `expected a two-token color-mix, got "${color}"`)
  const [, warmToken, weightText, baseToken] = parsed
  const weight = Number(weightText) / 100
  assert.ok(weight > 0 && weight < 1, `expected a fractional mix weight, got ${weightText}%`)
  for (const theme of Object.keys(TOKENS)) {
    const icon = mix(resolve(theme, warmToken), resolve(theme, baseToken), weight)
    const ratio = contrast(icon, resolve(theme, '--dsw-alias-bg-layer-1'))
    assert.ok(
      ratio >= MIN_NON_TEXT_CONTRAST,
      `warning icon contrast in ${theme} is ${ratio.toFixed(2)}:1`,
    )
  }
  // On a primary chip the marker inherits the button foreground, which already
  // has AA contrast in both themes.
  assert.equal(property('.dshns-btn-primary .dshns-warn', 'color'), 'inherit')
})

test('keyboard focus rings follow the DSH focus contract and stay visible', () => {
  const ring = 'var(--dsw-focus-ring-width, 2px) solid '
    + 'var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))'
  for (const selector of ['.dshns-btn:focus-visible', '.dshns-segmented-tab:focus-visible']) {
    assert.equal(property(selector, 'outline'), ring)
    assert.equal(property(selector, 'outline-offset'), '2px')
  }
  // The focusable scroll region gets the same ring plus the compare radius.
  assert.equal(property('.dshns-conflict-lines:focus-visible', 'outline'), ring)
  assert.equal(property('.dshns-conflict-lines:focus-visible', 'outline-offset'), '2px')
  assert.match(
    STYLES,
    /\.dshns-conflict-lines:focus-visible \{ border-radius: var\(--dsw-radius-sm\); \}/,
  )
  // Keyboard-only focus styling: no bare :focus rule may paint on mouse clicks.
  assert.equal(/(?:^|\n)\s*\.dshns-[\w-]+:focus\s*\{/.test(STYLES), false)
  // The ring is drawn on the card and compare surfaces, so it must clear 3:1
  // there in both themes (it never sits on a primary-chip fill).
  for (const theme of Object.keys(TOKENS)) {
    for (const surface of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-module-platform']) {
      const ratio = contrast(
        resolve(theme, '--dsw-alias-state-business-primary'),
        resolve(theme, surface),
      )
      assert.ok(
        ratio >= MIN_NON_TEXT_CONTRAST,
        `focus ring contrast on ${surface} in ${theme} is ${ratio.toFixed(2)}:1`,
      )
    }
  }
})

test('every card control targets at least 32px of height', () => {
  const heights = [
    ['.dshns-btn-sm', 'height'],
    ['.dshns-statusbar', 'min-height'],
    ['.dshns-btn.dshns-dismiss', 'height'],
    ['.dshns-toggle', 'min-height'],
    ['.dshns-btn.dshns-conflict-toggle', 'height'],
    ['.dshns-segmented-tab', 'height'],
  ]
  for (const [selector, name] of heights) {
    const value = property(selector, name)
    const px = Number.parseFloat(value)
    assert.ok(
      Number.isFinite(px) && px >= MIN_TARGET_HEIGHT,
      `${selector} ${name} is ${value}, expected >= ${MIN_TARGET_HEIGHT}px`,
    )
  }
})

test('expanded conflict lines scroll under a 240px cap', () => {
  const selector = '.dshns-conflict-compare[data-expanded] .dshns-conflict-lines'
  assert.equal(property(selector, 'max-height'), '240px')
  assert.equal(property(selector, 'overflow-y'), 'auto')
})
