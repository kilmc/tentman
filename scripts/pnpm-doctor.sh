#!/bin/sh

set -eu

workspace_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
expected_pnpm=$(node -p "JSON.parse(require('node:fs').readFileSync('$workspace_root/package.json', 'utf8')).packageManager.split('@')[1]")
expected_node=$(cat "$workspace_root/.nvmrc")
active_pnpm=$(pnpm -v)
active_node=$(node -v | sed 's/^v//')
pnpm_path=$(command -v pnpm)

printf 'workspace: %s\n' "$workspace_root"
printf 'expected node: %s\n' "$expected_node"
printf 'active node:   %s\n' "$active_node"
printf 'expected pnpm: %s\n' "$expected_pnpm"
printf 'active pnpm:   %s\n' "$active_pnpm"
printf 'pnpm path:     %s\n' "$pnpm_path"

if [ "$active_node" != "$expected_node" ]; then
	printf '\nNode version mismatch. Run `nvm use` and try again.\n' >&2
	exit 1
fi

if [ "$active_pnpm" != "$expected_pnpm" ]; then
	printf '\npnpm version mismatch. Run `corepack enable pnpm` or use `corepack pnpm ...`.\n' >&2
	exit 1
fi

printf '\nPackage manager setup looks good.\n'
