/**
 * Card CSS for the browser half (M3).
 *
 * Values are copied from the official action card and its primitives in DSH
 * 0.2.2-rc.1 (design/next-step-suggestions-tech.md appendix A/B). Classes are
 * renamed under the `dshns-` prefix and only theme tokens are referenced, per
 * the official external-plugin guidance. Additions for our own controls
 * (controls row, tags, prompt preview, conflict row) reuse the same tokens and
 * spacing scale. M9 adds the reveal wrapper: the script owns the height/opacity
 * transition, the stylesheet only guarantees reduced-motion safety.
 */
export const STYLES = `
.dshns-card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  font-family: var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
  margin: 16px 0;
  overflow: hidden;
}
/* M9: live mount reveal wrapper (see CARD_REVEAL / shouldRevealCard). The
 * script owns the max-height/opacity transition and hides overflow only while
 * it runs, so the settled card clips nothing. */
.dshns-reveal { min-width: 0; }
.dshns-reveal[data-revealing] { will-change: max-height, opacity; }
@media (prefers-reduced-motion: reduce) {
  .dshns-reveal { transition: none !important; }
  .dshns-reveal[data-revealing] { max-height: none !important; opacity: 1 !important; overflow: visible !important; }
}
.dshns-body { padding: 14px 20px 18px; }
.dshns-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
.dshns-mark {
  display: inline-block;
  vertical-align: -3px;
  margin-right: 6px;
}
.dshns-toggle {
  height: auto;
  min-height: 24px;
  margin: 8px 0 0;
  padding-inline: 0;
  font-size: 12px;
}
.dshns-statusbar {
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  min-height: 28px;
  display: flex;
}
.dshns-status {
  color: var(--dsw-alias-label-secondary);
  margin: 0 auto 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.dshns-btn.dshns-dismiss,
.dshns-btn.dshns-restore {
  flex: none;
  width: auto;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dshns-btn.dshns-dismiss:hover:not(:disabled),
.dshns-btn.dshns-restore:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.dshns-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.dshns-chip { max-width: 100%; text-align: left; }
.dshns-chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* One inline state marker per chip; text first, color is never the only cue. */
.dshns-marker {
  flex: none;
  margin-left: 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
.dshns-btn-primary .dshns-marker { color: inherit; opacity: .78; }
.dshns-marker-danger { display: inline-flex; align-items: center; gap: 3px; }
.dshns-warn {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--dsw-alias-state-warn-primary);
}
/* On-demand preview: no height is reserved while idle; it appears below the
 * chips so switching chips cannot move the controls. */
.dshns-preview {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent));
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.dshns-preview-label {
  margin-right: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.6;
  white-space: nowrap;
}
/* Conflict prompt: keep the target instruction and the current draft visible,
 * then offer an append-first decision row. */
.dshns-conflict {
  margin-top: 12px;
}
.dshns-conflict-compare {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent));
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.dshns-conflict-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.dshns-conflict-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.6;
  white-space: nowrap;
}
.dshns-conflict-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Conflict keeps the status text and the three actions on one row so the
 * state is only ~24px taller than a resting card. */
.dshns-statusbar-conflict {
  margin-top: 8px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.dshns-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  padding: 0 14px;
}
.dshns-btn:disabled { cursor: not-allowed; opacity: .4; }
.dshns-btn-sm {
  height: 28px;
  font-size: 12px;
  line-height: 18px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-sm);
}
.dshns-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dshns-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshns-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshns-btn-ghost:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dshns-btn-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

/* TextShimmer: copied from the official primitive (dshns- renames, tokens only). */
.dshns-shimmer {
  position: relative;
  display: inline-grid;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  vertical-align: top;
  color: inherit;
}
.dshns-shimmer-content { display: flex; align-items: center; min-width: 0; }
.dshns-shimmer-text { color: inherit; }
.dshns-shimmer-text[data-shimmer-text]:after { content: attr(data-shimmer-text); }
.dshns-shimmer-decoration {
  position: absolute;
  inset: 0;
  overflow: clip;
  pointer-events: none;
  user-select: none;
}
.dshns-shimmer-sweep {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-shimmer);
  mask-image: linear-gradient(105deg, transparent 0%, black 40% 60%, transparent 100%);
  transform: translate(-100%);
  animation-name: dshns-row-shimmer-sweep;
}
.dshns-shimmer-sweep * { color: inherit !important; }
.dshns-shimmer-sweep [data-shimmer-decoration] { background: currentColor; }
.dshns-shimmer-highlight {
  width: 100%;
  height: 100%;
  transform: translate(100%);
  animation-name: dshns-row-shimmer-highlight;
}
.dshns-shimmer-sweep,
.dshns-shimmer-highlight {
  animation-duration: 1.5s;
  animation-delay: .3s;
  animation-timing-function: steps(48, end);
  animation-iteration-count: infinite;
}
@keyframes dshns-row-shimmer-sweep {
  0% { transform: translate(-100%); }
  66.6667%, to { transform: translate(100%); }
}
@keyframes dshns-row-shimmer-highlight {
  0% { transform: translate(100%); }
  66.6667%, to { transform: translate(-100%); }
}
@media (prefers-reduced-motion: reduce) {
  .dshns-shimmer-decoration { display: none; }
  .dshns-shimmer-sweep,
  .dshns-shimmer-highlight { animation: none; }
}

/* Settings section (copied SegmentedControl styles + row layout). */
.dshns-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 8px 20px 24px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 1.6;
}
.dshns-settings-heading {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  margin: 8px 0 12px;
}
.dshns-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 0;
  border-top: .5px solid var(--dsw-alias-border-l3);
}
.dshns-setting-label { min-width: 0; color: var(--dsw-alias-label-primary); }
.dshns-setting-note {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0 0;
}
.dshns-settings-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.dshns-settings-status {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.dshns-segmented {
  position: relative;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 4px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshns-segmented-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc((100% - 8px - 2px * (var(--dsh-segment-count) - 1)) / var(--dsh-segment-count));
  height: calc(100% - 8px);
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft);
  transform: translate(calc(var(--dsh-segment-index) * (100% + 2px)));
  transition: transform .16s ease;
  pointer-events: none;
}
.dshns-segmented-tab {
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color .12s ease;
}
.dshns-segmented-tab[aria-selected=true] { color: var(--dsw-alias-label-primary); }
.dshns-segmented-tab:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshns-segmented-tab:disabled { cursor: default; opacity: .4; }

/* Process row: copied from the official action-card DisclosureRow/ProposeRow. */
.dshns-disc-root { display: flex; flex-direction: column; width: 100%; min-width: 0; }
.dshns-disc-header { display: flex; align-items: center; min-width: 0; }
.dshns-disc-header[data-has-accessory] { gap: 8px; }
.dshns-disc-header[data-has-accessory] .dshns-disc-row { flex: 0 1 auto; }
.dshns-disc-row {
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  transition: color .1s ease;
}
.dshns-disc-row[data-expandable] { cursor: pointer; }
.dshns-disc-row:hover { color: var(--dsw-alias-label-secondary); }
.dshns-disc-leading {
  position: relative;
  flex: none;
  width: calc(16px + var(--dsh-content-font-delta, 0px));
  height: calc(16px + var(--dsh-content-font-delta, 0px));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
}
.dshns-disc-leading svg:not([data-state]) {
  width: calc(14px + var(--dsh-content-font-delta, 0px));
  height: calc(14px + var(--dsh-content-font-delta, 0px));
}
button.dshns-disc-leading { cursor: pointer; }
.dshns-disc-iconIdle { display: inline-flex; opacity: 1; transition: opacity .1s ease; }
.dshns-disc-chevronHover { position: absolute; inset: 0; margin: auto; opacity: 0; transition: opacity .1s ease; }
.dshns-disc-row:hover .dshns-disc-iconIdle { opacity: 0; }
.dshns-disc-row:hover .dshns-disc-chevronHover { opacity: 1; }
.dshns-disc-content { display: flex; align-items: center; min-width: 0; }
.dshns-disc-title {
  flex: none;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: inherit;
}
.dshns-row-summary {
  min-width: 0;
  color: inherit;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  font-size: 12px;
  display: flex;
}
.dshns-row-summary > :first-child { flex-shrink: 0; }
.dshns-row-title { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.dshns-row-reason {
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 8px 0;
  padding: 12px;
  font-size: 12px;
}
.dshns-row-inspect {
  color: var(--dsw-alias-link);
  font: inherit;
  cursor: pointer;
  background: 0 0;
  border: none;
  align-self: flex-start;
  padding: 4px 0;
  font-size: 12px;
}
`
