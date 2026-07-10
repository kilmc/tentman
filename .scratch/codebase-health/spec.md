# Codebase Health Architecture Review

Source report: `/var/folders/l3/0q53d3812t3gvm4ytx3fp2680000gn/T/architecture-review-20260710-222036.html`

Generated: 2026-07-10

This folder captures the six architecture improvement candidates from the architecture review so they can be worked through over time. Each candidate starts as `Status: needs-triage`: it is an architectural direction, not yet a scoped implementation ticket.

## How to use this backlog

1. Pick one candidate from `issues/`.
2. Start a fresh `grill-with-docs` session pointed at that candidate file.
3. Use the grilling session to decide scope, record domain or ADR notes if needed, and produce a concrete spec.
4. If the result is larger than one implementation session, run `to-tickets` from that spec.

## Candidates

| Number | Candidate | Strength | Suggested order |
| ------ | --------- | -------- | --------------- |
| 01 | [Unify the navigation manifest module](issues/01-unify-navigation-manifest-module.md) | Strong | Start here |
| 02 | [Deepen repository route data](issues/02-deepen-repository-route-data.md) | Strong | Second tier |
| 03 | [Collapse the pages workspace state](issues/03-collapse-pages-workspace-state.md) | Strong | Second tier |
| 04 | [Hide content component reference state](issues/04-hide-content-component-reference-state.md) | Worth exploring | Later |
| 05 | [Deepen the mdsvex directive adapter](issues/05-deepen-mdsvex-directive-adapter.md) | Worth exploring | Later |
| 06 | [Give the CLI a command runner module](issues/06-give-cli-command-runner-module.md) | Worth exploring | Later |

## Top recommendation from the review

Start with **Unify the navigation manifest module**.

The report calls this the cleanest deletion-test signal: one domain schema is already copied across runtime, core, and web, so deepening it gives immediate locality and a shared test surface without fighting Svelte UI state or GitHub caching complexity first.

## Context used by the review

The review said its domain context came from:

- `README.md`
- `plans/product-vision.md`
- `plans/thin-backend-principle.md`

At review time, no `CONTEXT.md` or `docs/adr/` files were present.
