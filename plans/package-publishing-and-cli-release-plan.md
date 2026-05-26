# Tentman Package Publishing And CLI Release Plan

## Summary

This document captures the current intended direction for Tentman's package publishing, CLI release, and trust posture.

It is a plan, not an enforced repo policy.

The goal is to make the target state explicit without slowing ordinary development before the public-release work is actually completed.

Until the work in this plan is done:

- the current repo and package state remains provisional
- parts of the target release model may be temporarily violated
- normal development should continue without pretending the release system is already finished

## What This Plan Is For

Use this document to guide:

- package-boundary cleanup
- CLI stabilization work
- release-tooling setup
- documentation work for first public release

Do not use it as a reason to block unrelated development before release-prep work is actually underway.

## Direction Already Decided

### Open Source And Business Boundary

Tentman should stay simple and open at the repo level.

Working direction:

- keep the repository public
- do not split the codebase into public and private logic packages without a concrete technical reason
- put the monetization boundary primarily in hosting and managed convenience, not in closed source code

This fits the trust needs of a repo-connected product better than a half-open source model.

### License Direction

Current intended license direction:

- use `Apache-2.0`
- do not require a CLA or DCO for now
- stay maintainer-led for a while, while remaining open to good outside contributions

### Initial Public Package Set

The first intended public package set is:

- `tentman` for the CLI
- `@tentman/core`
- `@tentman/mdsvex`
- `@tentman/vite`

The web app should remain source-open but unpublished.

### Package Roles

#### `tentman`

This should become the primary public entry point.

Working assumptions:

- the CLI is the main supported public surface
- command names, flags, exit codes, and write behavior need real stabilization work
- the CLI should remain local-first and avoid hidden network behavior

#### `@tentman/core`

This should be public and directly installable, but clearly documented as unstable for now.

Working assumptions:

- it is the real headless Tentman engine
- it exists primarily to serve Tentman itself right now
- it should not be hidden or bundled away as an implementation detail
- most users should still be guided toward `tentman` instead of direct `core` use

#### `@tentman/mdsvex` And `@tentman/vite`

These should be public secondary adapter packages.

Working assumptions:

- both are real package boundaries
- both are useful enough to publish
- both should remain secondary to the CLI for onboarding and support expectations

#### `packages/runtime`

This should be removed.

Current repo reality:

- it is unused
- it duplicates navigation-manifest logic already living in `core`
- it muddies the package story rather than clarifying it

### Early Release Posture

The early public release line should be:

- lockstep `0.x`
- published from CI
- managed with Changesets
- honest about instability

Working compatibility posture:

- breaking changes are allowed during `0.x`
- breaking changes should be called out clearly
- no formal deprecation policy is needed yet

### Node, Module, And Packaging Shape

Current intended package shape:

- keep the current modern Node baseline: `^20.19.0 || >=22.12.0`
- ship ESM-only packages
- use explicit `exports`
- use tight `files` allowlists
- avoid undocumented deep imports
- allow a small number of clearly justified documented subpath exports
- avoid build/bundle steps unless a package clearly needs one

### CLI Trust And Safety Model

Current intended CLI posture:

- local-first
- no hidden network behavior
- conservative repo mutations
- preserve user formatting wherever possible outside Tentman-owned fields
- treat the navigation manifest as a more fully Tentman-owned artifact

Write-command ergonomics should follow this model:

- execute by default
- support `--dry-run` where meaningful
- treat missing `--dry-run` support on public write commands as a gap to close
- make `--dry-run` concrete by showing affected file paths and concise reasoning
- defer mandatory full diff output unless a later explicit flag makes that useful

### Docs Direction

The intended docs posture is:

- CLI README is the canonical "start here" guide for developers
- repo README stays broader and more architectural
- `@tentman/core` README should explicitly steer casual users toward the CLI
- package READMEs should exist for every published package
- docs should not overpromise a plugin ecosystem or broad stable third-party extensibility story yet
- docs should explicitly say Tentman is pre-`1.0`, evolving, local-first in CLI mode, and conservative in repo writes
- docs should include a short "who this is for right now" statement

## Release Blockers Before First Public Publish

These are the things that should be treated as real blockers for the first public package release.

### 1. Clarify And Simplify Package Boundaries

- remove `packages/runtime`
- make the intended published package set explicit in repo docs and package metadata
- settle the CLI package naming direction toward `tentman`

### 2. Stabilize The CLI Surface Enough To Publish

The CLI does not need to be perfect before release, but it does need enough polish to serve as the primary supported surface.

Minimum stabilization targets:

- sanity-check command names
- sanity-check flag names
- verify consistent non-zero exit codes for failure cases
- keep `--json` explicitly experimental for now
- support conservative write behavior with predictable summaries
- identify public write commands that need `--dry-run`

### 3. Add Public Package Metadata

Each published package should have:

- explicit `name`
- `version`
- `license`
- `repository`
- `homepage`
- `bugs`
- `engines`
- explicit `exports`
- `files` allowlist

Additional direction:

- `tentman` should publish a binary, not a programmatic API
- `@tentman/core` should be documented as unstable and lower-level

### 4. Add Package-Level READMEs

Each published package should be understandable in isolation.

Minimum package-doc needs:

- what the package is for
- who should start with it
- install instructions
- a minimal usage example
- current maturity / instability framing where relevant

### 5. Add Top-Level Trust Artifacts

Before first public publish, add:

- `LICENSE`
- `SECURITY.md`

`SECURITY.md` should explain:

- how to report a vulnerability
- that sensitive reports should not go through public issues
- what response/disclosure expectations are

### 6. Set Up Release Tooling

Before first public publish:

- release from CI, not manually from a laptop
- use Changesets
- keep early package releases in lockstep
- write release notes clearly enough to call out breaking changes during `0.x`

### 7. Validate Real Published-Artifacts Behavior

Workspace success is not enough.

Before first public publish, validate:

- local pack/install flow for each published package
- fresh-install smoke test in an external example repo using packed tarballs
- direct sanity check for `@tentman/core` as its own published artifact

### 8. Add A Real External Fixture Repo

`apps/test-app` is useful, but it is not enough as the main release-validation target because Tentman needs to operate against a real standalone Git repo.

The plan should include:

- a dedicated sibling fixture repo outside this monorepo
- its own Git root
- intentionally simple public example-consumer shape
- use as both QA target and public integration example

### 9. Create A Release Checklist

The first public release should be gated by an explicit checklist stored in the repo.

Minimum checklist coverage:

- package metadata present
- package README present
- license present
- security contact present
- explicit exports present
- files allowlist present
- basic install/use sanity checked
- CLI help output checked
- CLI representative success cases checked
- CLI representative failure cases checked
- CLI exit-code behavior checked
- manual QA against a real fixture repo checked

## Follow-Up Improvements After The First Public Release

These are good ideas, but they should not be allowed to masquerade as immediate blockers unless priorities change.

### CLI Refinement

- improve `--dry-run` coverage
- decide whether a later explicit diff flag is worthwhile
- refine watch-mode ergonomics
- revisit `--json` shape once the command surface settles

### Type Support

Type support should improve over time, but it does not need to be perfect for first release.

Current intended priority:

- favor "good enough" typing where it matters most
- prioritize `@tentman/mdsvex`, `@tentman/vite`, and the most direct `core` entry points first
- avoid forcing a full typed build pipeline into the first release

### Stronger Supply-Chain Hardening

Not a first-release blocker right now:

- npm provenance or equivalent publish attestations
- stronger signed-release posture

Good later hardening step once CI publishing is already in place.

### Future Package Splits

Do not split `core` just because it is public.

Only consider future splits when there is real pressure from:

- API clarity
- package size
- independently useful domains

Possible future shapes could include domain packages such as content-components or navigation, but that is not a current requirement.

### Governance And Contribution Process

For now:

- no CLA
- no DCO
- maintainer-led project

This can be revisited later if contributor volume or business/legal needs change.

## Recommended Execution Order

This is the recommended order for follow-up work.

### Phase 1. Simplify The Package Graph

- remove `packages/runtime`
- make the intended public package set explicit
- settle `tentman` naming direction in package/release planning

### Phase 2. Stabilize Public Package Boundaries

- tighten `exports`
- add `files` allowlists
- add missing package metadata
- confirm Node and ESM support posture in package manifests

### Phase 3. Refine The CLI Surface

- review command names and flags
- review write-command behavior and summaries
- review exit-code behavior
- identify and plan `--dry-run` coverage gaps
- keep `--json` marked experimental

### Phase 4. Write Public-Facing Docs

- add package-specific READMEs
- make CLI README the canonical developer entry point
- update repo-level framing so it matches the open-source, pre-`1.0`, CLI-first posture

### Phase 5. Add Trust And Release Infrastructure

- add `LICENSE`
- add `SECURITY.md`
- add Changesets
- set up CI publishing
- add release checklist document

### Phase 6. Build Release Validation Targets

- create the external example repo
- validate packed tarballs there
- verify CLI and adapter packages by installed package boundaries rather than workspace assumptions

### Phase 7. Perform First Release Readiness Pass

- run the release checklist
- confirm blockers are actually closed
- decide whether the package set is ready for first public publish

## Practical Working Position

If we need one short statement that captures this whole plan, it is this:

Tentman should move toward a public, open-source, CLI-first package release model built around `tentman`, `@tentman/core`, `@tentman/mdsvex`, and `@tentman/vite`, but this is still a target-state release plan rather than an already-enforced repo policy.
