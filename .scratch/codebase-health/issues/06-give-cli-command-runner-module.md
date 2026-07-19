# Give the CLI a command runner module

Status: needs-triage
Type: architecture-improvement
Strength: Worth exploring
Suggested order: Later
Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html#cli-runner`

## Affected files

- `packages/cli/src/index.js`
- `packages/core/src/index.js`
- `packages/cli/package.json`

## Problem

Command parsing, presentation, core calls, watch lifecycle, console I/O, signals, and exit behavior all share one executable module.

The report describes `index.js` directly handling argv parsing, console output, core commands, chokidar watch, signals, and process exit codes.

## Proposed direction

Deepen a CLI command runner module. Leave process, console, core command, and watcher behavior behind adapters.

The executable should become a thin adapter into a command runner that returns deterministic exit results.

## Expected benefits

- Locality: CLI behavior concentrates.
- Leverage: deterministic tests can cover command behavior without process state.
- Interface clarity: runner results replace implicit console/process behavior.

## Grill-with-docs prompt

Use this candidate as the focus for a `grill-with-docs` session. Do not re-run the architecture survey. Grill the command runner interface, adapter responsibilities, watch lifecycle, exit semantics, and deterministic test harness.

## Comments
