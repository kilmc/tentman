# Tentman Product Vision

## Purpose

This document captures the broad product and architecture direction Tentman is building toward.

It is not a fixed spec and it is not a locked roadmap. It is a vision document meant to help with product and technical planning so new features can be evaluated against a clear long-term direction.

When planning new work, use this document to answer:

- Does this feature support the core Tentman promise?
- Does it fit the kind of product Tentman is trying to become?
- Does it respect the open and portable parts of the system?
- Does it preserve a cheap and sustainable operating model?
- If it changes the direction, should this document be updated first?

## Tentman In One Sentence

Tentman is an open, Git-backed CMS with a zero-setup hosted default experience and an optional paid extension layer for deeper developer customization.

## The Core Product Shape

Tentman is not trying to be only one thing.

The intended product shape is:

- Hosted by default
- Extensible if a developer wants to invest more
- Open in its content model and config language
- Safe by default in the hosted product
- Practical for building sites for friends, clients, and small projects

The default experience should let someone log in, point Tentman at a repo, and manage content with little or no setup as long as the repo stays within the standard Tentman feature set.

The advanced experience should allow deeper customization, but that extra power is allowed to introduce more setup and a more specialized workflow.

## Primary User

The first user Tentman should serve well is a developer building and maintaining sites for friends, clients, and small organizations, where those people later manage content themselves.

That means Tentman should optimize for:

- A strong developer setup experience
- A simple and pleasant editing experience for non-technical content editors
- Low operational overhead for the person maintaining the system

Broader markets such as agencies, larger teams, and public package ecosystems may matter later, but they should not distort early product decisions.

## Core Promise

The central Tentman promise should remain:

- Log in with GitHub
- Point Tentman at a repo
- Tentman reads the repo's config
- Tentman gives you a functioning CMS without requiring a custom build

This promise should hold for the default feature set.

Custom extensions are allowed to go beyond this promise, but they should be treated as an advanced mode rather than something the core hosted product depends on.

## Product Tiers In Principle

### Core / Basic Tentman

The default hosted product should:

- Work without per-repo build steps
- Read Tentman config directly from the repo
- Support built-in fields and reusable grouped blocks
- Provide a good editing and publishing workflow
- Allow modest customization such as basic branding where appropriate

This mode should be cheap to operate and easy to understand.

### Pro / Custom Tentman

The advanced hosted product may include:

- Custom block displays
- Custom adapters
- Richer theming and branding
- Future extension points for more specialized CMS behavior

This mode is allowed to involve a build pipeline and repo-specific custom bundles.

The paid value should come from hosted convenience, managed extension infrastructure, and deeper customization, not from locking up the content model.

## Open-Source And Portability Principles

The following should remain open and portable:

- The Tentman config language
- The content format
- Block definitions as a concept
- The ability for someone to build or self-host a compatible manager

Tentman should be designed so that users are not trapped by the hosted service.

If Tentman ever shuts down, users should be able to retain:

- Their content
- Their config
- Their mental model of how the CMS is wired

The hosted service may provide premium convenience and runtime capabilities, but the underlying content model should remain legible and reusable outside the hosted product.

## Strategic Product Boundaries

These boundaries currently fit the intended direction:

- The hosted product should not run arbitrary customer code on request by default.
- The default mode should stay simple, generic, and cheap to operate.
- Advanced customization should be explicit and opt-in.
- The most portable parts of the system should be config and content, not hosted service glue.
- Tentman should optimize for sustainable operation rather than maximizing lock-in.

## Tentman's Long-Term Architecture Direction

Tentman should move toward a split between:

- A hosted Tentman shell
- A repo-specific extension bundle

### Hosted Shell

The hosted shell is the stable product runtime owned by Tentman.

It should be responsible for:

- Authentication
- Repo selection
- Base CMS UI
- Content load, save, draft, and publish flows
- Talking to the Git provider
- Loading and enforcing supported extension points

### Repo Extension Bundle

The repo extension bundle is the optional customization layer for a specific repo.

It may be responsible for:

- Custom block displays
- Custom adapters
- Theme and branding extensions
- Other bounded repo-specific CMS behavior in the future

This bundle should extend the shell, not replace it.

## Preferred Extension Model

The current preferred direction is to use named extension ids rather than raw file paths in config.

For example:

- A block config might say `display: "teamMemberCard"`
- A repo's CMS extension entrypoint would register which component implements `teamMemberCard`

This has a few benefits:

- Config stays more portable
- The shell only deals in allowed extension points
- The repo bundle can change internal file structure without rewriting config
- It feels safer and simpler than path-driven runtime loading

Conceptually:

- Config declares intent
- The bundle provides implementation
- The shell provides the runtime contract

## Build-First Customization

The preferred long-term direction for advanced customization is build-time compilation, not request-time execution.

That means:

- Repo-owned customization source lives in the repo
- A build pipeline compiles that source into a browser bundle
- Tentman serves the built bundle from static hosting or a CDN
- Editors use the hosted shell plus that pre-built bundle

This direction is attractive because it:

- Avoids running arbitrary repo code on the hosted app during requests
- Makes `.svelte`-based custom UI more realistic
- Moves compute cost toward builds instead of constant server-side execution
- Keeps the runtime experience fast and predictable

## Why The Hosted Shell + Bundle Split Matters

This split preserves several important goals at once.

It allows:

- A free or basic generic mode
- A paid customized mode
- A good local developer workflow
- A cheaper operating model than per-request customer code execution
- A better business boundary than shipping a fully standalone paid app bundle

The extension bundle should not be the whole CMS product.

The hosted shell should remain the platform.

## Runtime Philosophy

Tentman should distinguish between what is compiled into the CMS bundle and what is fetched live at runtime.

### Good Candidates To Compile

- UI shape
- Custom block displays
- Custom adapters
- Theme and styling extensions
- Other repo-specific CMS behavior

### Good Candidates To Fetch Live

- Content entries
- Draft state
- Branch and publish state
- Repo metadata
- Asset references

This keeps the CMS dynamic where it matters while still allowing a fast, pre-built editing experience.

## Local Developer Experience

A strong local developer experience is important to Tentman's identity.

Advanced customization should not require a push-and-deploy loop for every change.

The intended direction is a local workflow similar to:

- Run a local Tentman dev command
- Start a local shell
- Watch Tentman config and CMS extension files
- Build and hot-reload repo-specific custom UI locally
- Test the CMS before pushing changes

In other words:

- Local development should be fast
- Hosted builds should be for production and editor use

This keeps the developer experience strong without requiring the hosted product to execute arbitrary code live.

## Cost And Infrastructure Direction

Tentman should aim for low ongoing infrastructure cost.

The preferred operating model is:

- Keep the core hosted product lightweight
- Prefer static hosting and CDNs where possible
- Move expensive work to explicit build steps
- Avoid designing a system that depends on heavy request-time compute

The likely cost centers for advanced customization are:

- Build jobs
- Bundle storage
- Bandwidth
- Small amounts of metadata, auth, or orchestration infrastructure

This is preferable to an architecture that requires persistent customer-specific compute for normal editing flows.

## Multi-Repo Mental Model

Capabilities should belong primarily to repos, not to a user's account as a whole.

That means:

- One repo may use plain Tentman
- Another repo may use an advanced custom bundle
- Switching repos should mean loading a different capability set

This repo-first mental model is cleaner than trying to treat all repos in an account as if they share the same runtime.

## Tentman's Business Boundary

The ethically comfortable things to charge for include:

- Hosted convenience
- Managed builds for custom CMS extensions
- Advanced customization capabilities
- Richer theming and branding
- Future collaboration or workflow features if they become relevant

The product should avoid relying on dark-pattern lock-in.

The value of the paid product should come from:

- A well-run hosted system
- Strong developer and editor experience
- Managed extension infrastructure
- Reduced operational burden for users

Not from making the content model inaccessible.

## What Tentman Is Not Trying To Be

At least for now, Tentman should avoid drifting into these shapes by accident:

- A system that requires arbitrary server-side execution of customer code in the hosted request path
- A product where every repo requires a custom deployment before the CMS works at all
- A system where the config format is tightly coupled to a proprietary hosted runtime
- A workflow where developers must always wait for a hosted build to test simple UI changes

These may be tempting shortcuts in isolated features, but they would pull Tentman away from its intended identity.

## Current Direction For Custom CMS Extensions

The current conceptual direction is:

- Default hosted mode remains generic and config-driven
- Advanced repo-specific customizations are compiled into a repo extension bundle
- The hosted shell loads that bundle when opening the repo
- Extension ids are preferred over raw config file paths
- `.svelte` support is reasonable if it happens through a build pipeline rather than runtime loading

This is still directional rather than final, but it is the strongest current architectural throughline.

## Feature Planning Filter

Before starting a new feature, check it against the following questions.

### Product Fit

- Does this improve the zero-setup hosted experience?
- Does this improve the advanced customization story without harming the default mode?
- Does this help developers build better CMS experiences for editors?

### Portability Fit

- Does this preserve the openness of config and content?
- Would this make it harder for someone to understand or migrate their Tentman setup?

### Architecture Fit

- Does this belong in the shell, the repo bundle, or the content model?
- Are we moving work to build time when that would keep the hosted runtime simpler?
- Are we accidentally introducing request-time customer code execution?

### Cost Fit

- Will this create ongoing compute cost, or mostly explicit build cost?
- Is the operational complexity justified by the value it adds?

### UX Fit

- Will this make the editor experience better?
- Will this keep the developer workflow fast enough to be pleasant?

If the answer is "this feature is valuable, but it conflicts with the current vision," that is not automatically wrong. It means the tension should be made explicit and this document should be updated if the direction truly changes.

## How To Use This Document

This document should be treated as a living guide.

When planning a feature:

1. Identify whether the feature belongs to the core hosted mode, the advanced extension layer, or the open content model.
2. Check whether the feature strengthens or weakens the core Tentman promise.
3. Note any tradeoffs with cost, portability, or developer experience.
4. If the feature meaningfully changes Tentman's direction, update this document before or alongside implementation.

The goal is not to freeze the product. The goal is to make changes deliberate.

## Open Questions That Still Need Time

These areas are still intentionally unresolved:

- The exact API surface for repo extension bundles
- The exact build pipeline and manifest format
- How far theming should go in core versus pro
- Whether custom adapters and custom displays should launch together or separately
- Which advanced features belong in paid plans first
- How billing, repo eligibility, and repo capability warnings should work
- How far Tentman should go toward package ecosystems and shared extension reuse

These do not need to be solved immediately for the vision to be useful.

## Current North Star

Tentman should become a developer-friendly, editor-friendly, Git-backed CMS that is easy to adopt, cheap to run, open in its fundamentals, and capable of growing into a deeply customizable hosted platform without losing its simplicity at the core.
