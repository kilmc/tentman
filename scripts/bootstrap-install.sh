#!/bin/sh

set -eu

workspace_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$workspace_root"

if ! command -v corepack >/dev/null 2>&1; then
	printf 'Corepack is required but was not found in PATH.\n' >&2
	exit 1
fi

exec corepack pnpm install "$@"
