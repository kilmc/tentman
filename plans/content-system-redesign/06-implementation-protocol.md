# Implementation Protocol

## Purpose

Keep implementation aligned with the redesign plan across multiple context windows without relying on chat history alone.

This protocol is for execution, not design exploration.

## Required Reading At The Start Of Every Session

Read these files before doing implementation work:

1. `/Users/kilmc/code/tentman/plans/content-system-redesign/README.md`
2. `/Users/kilmc/code/tentman/plans/content-system-redesign/04-v1-spec.md`
3. `/Users/kilmc/code/tentman/plans/content-system-redesign/05-hard-cut-migration.md`
4. `/Users/kilmc/code/tentman/plans/content-system-redesign/03-phased-rollout.md`
5. `/Users/kilmc/code/tentman/plans/content-system-redesign/07-implementation-status.md`

## Core Execution Rules

1. Follow the v1 spec and hard-cut migration plan.
2. Prefer a clean replacement over backwards compatibility.
3. Do not preserve legacy `singleton`, top-level `array`, inferred config type detection, or dual `fields`/`blocks` support.
4. Keep block adapters and content adapters as separate concerns.
5. Keep implementation feature-first and domain-first.
6. Work on the current slice recorded in the implementation status doc unless a real blocker requires widening scope.

## Current Slice Discipline

At the start of each session:

1. Read the current slice from `07-implementation-status.md`.
2. Summarize the slice briefly.
3. State the exact next step you are taking.
4. Implement only that slice unless blocked.

Do not invent a new slice if the current slice is still active.

## Handling Unexpected Findings

If implementation reveals a design flaw, hidden dependency, or better direction:

1. Do not silently drift from the plan.
2. Stop and identify the issue clearly.
3. Propose the smallest adjustment that preserves the core design ideals.
4. Update the relevant plan doc if the change is accepted during the session.
5. Record the change in `07-implementation-status.md` under `Plan changes`.

If the issue is substantial or has non-obvious tradeoffs, pause and ask for confirmation before proceeding.

## Required Updates Before Ending A Session

Before ending any implementation session:

1. Update `07-implementation-status.md`.
2. Mark the current slice as:
   - `in_progress`
   - `blocked`
   - or `completed`
3. If the current slice is complete, write the next slice into the status doc.
4. Add short notes for:
   - completed work
   - files changed
   - blockers or open questions
   - plan changes
   - exact next action
5. If the plan docs were affected by implementation findings, update them in the same session.

## Slice Advancement Rules

- Only move to the next slice if the current slice is complete enough to leave the codebase in a coherent state.
- If the current slice expands during implementation, update the status doc so the expanded scope is explicit.
- Do not jump to a later phase just because one subtask looks interesting.

## Context Window Handoff

Before ending due to context limits or natural stopping point:

1. Ensure `07-implementation-status.md` is current.
2. Provide a ready-to-paste continuation prompt.
3. The continuation prompt should tell the next session to:
   - read the required files
   - continue from the current slice in the status doc
   - update the status doc again before ending

## Success Criteria

This protocol is working if:

- the current slice always lives in the repo, not only in chat
- the next slice is always recorded when appropriate
- plan changes are documented when discovered
- a new conversation can continue reliably with minimal extra explanation
