/**
 * Card and process-row CSS. Frame values follow the official DSH action card
 * and propose_action row; classes use the `dshns-` prefix and only theme tokens.
 */
export const STYLES = `
.dshns-reveal {
  display: grid;
  grid-template-rows: 1fr;
  margin: 16px 0;
}
.dshns-reveal > * { min-height: 0; }
.dshns-reveal[data-fresh] { animation: dshns-reveal .22s cubic-bezier(.4, 0, .2, 1) both; }
@keyframes dshns-reveal { from { grid-template-rows: 0fr; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dshns-reveal[data-fresh] { animation: none; } }
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
/* Recommended: tinted border + spark. Used (next message): check, pencil when edited; quieter label. */
.dshns-chip[data-recommended] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, transparent); }
.dshns-spark { flex: none; color: var(--dsw-alias-state-business-primary); }
.dshns-chip[data-used] { color: var(--dsw-alias-label-secondary); }
.dshns-check { flex: none; color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 65%, var(--dsw-alias-label-primary)); }
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
