#!/bin/bash
# Isolated publish/install test for @local/dsh-next-actions (audit task-3, 2026-11-09).
# Writes only under /tmp and a fake DSH_HOME; never touches the real ~/.dsh profile.
set -euo pipefail
ROOT=/tmp/dsh-na-audit
PLUGIN=/Users/arctic/Box/Terrace/deepseek-harness/default-workspace/plugins/dsh-next-actions
rm -rf "$ROOT"
mkdir -p "$ROOT/pkg" "$ROOT/pack" "$ROOT/fake-home"
cp -R "$PLUGIN/." "$ROOT/pkg/"
# npm's default cache under ~/.npm is root-owned in this environment, so isolate it.
export npm_config_cache="$ROOT/npm-cache"
export npm_config_store_dir="$ROOT/scratch/pnpm-store"
export XDG_DATA_HOME="$ROOT/scratch/xdg/data"
export XDG_CACHE_HOME="$ROOT/scratch/xdg/cache"
export XDG_STATE_HOME="$ROOT/scratch/xdg/state"
export PNPM_HOME="$ROOT/scratch/pnpm-home"
export COREPACK_HOME="$ROOT/scratch/corepack"
export CI=1
mkdir -p "$npm_config_cache" "$npm_config_store_dir"
# 1. Pack exactly what npm would publish.
(cd "$ROOT/pkg" && npm pack --pack-destination "$ROOT/pack")
tar -tvzf "$ROOT/pack/local-dsh-next-actions-0.1.0.tgz"
# 2. Install into a throwaway DSH_HOME (profile initialized by the CLI).
export DSH_HOME="$ROOT/fake-home"
/usr/local/bin/dsh plugin --profile web add "file:$ROOT/pack/local-dsh-next-actions-0.1.0.tgz"
cat "$DSH_HOME/profiles/web/package.json"
find "$DSH_HOME/profiles/web/node_modules/@local/dsh-next-actions" -type f | sort
# 3. Compose the profile: the bundle patch contributes the dsh-next-actions row.
/usr/local/bin/dsh --profile web --dump-config > "$ROOT/dump.yml"
grep -n -A3 "id: dsh-next-actions" "$ROOT/dump.yml"
# 4. Remove and confirm the profile no longer lists the bundle.
/usr/local/bin/dsh plugin --profile web remove @local/dsh-next-actions
cat "$DSH_HOME/profiles/web/package.json"
