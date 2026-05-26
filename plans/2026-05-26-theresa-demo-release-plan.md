# Theresa Demo Release Plan

## Summary

This plan captures the minimum work needed over the next couple of evenings to get Tentman into a demoable and useful private-release state for Theresa.

This is intentionally not the full public-release plan.

The goal is to:

- publish the minimum package set needed to build Theresa's site
- get Theresa's site deploying from published packages instead of workspace-local copies
- make image/assets predictable in the CMS for a private GitHub repo
- keep scope narrow enough to finish quickly

## Goal State

At the end of this plan:

- `@tentman/core`, `@tentman/mdsvex`, and `@tentman/vite` are published to npm under `@tentman`
- Theresa's site installs those published packages and builds on Netlify
- Tentman can render saved assets in GitHub-backed mode for Theresa's private repo without depending on the public live site
- unpublished items with saved images still render in the CMS

## Working Decisions

### Package Scope For This Week

In scope:

- `@tentman/core`
- `@tentman/mdsvex`
- `@tentman/vite`

Out of scope:

- CLI publishing
- Changesets
- CI-based publishing
- full public release hardening
- package-boundary cleanup beyond what is required to publish these three packages

### Asset Strategy

Do not rely on the live deployed site as the primary asset source for authoring.

Reason:

- Theresa's repo is private
- unpublished content may reference assets that do not exist on the live site yet
- Netlify preview/deploy behavior is useful for ergonomics later, but should not be required for the CMS to show saved assets

Chosen strategy:

- unsaved local uploads continue to use existing blob preview behavior
- saved draft assets in GitHub-backed mode should render through a Tentman asset proxy
- the proxy should read from the active draft branch when present
- if the asset is not present on the draft branch, fall back to the repository default branch
- external absolute URLs can still render directly

### Site URL / Preview URL Ergonomics

These are secondary for this week.

They may still be useful later for:

- opening a public or draft site preview from the CMS
- resolving already-published public assets against a known live site origin

But they should not be the core mechanism for CMS asset rendering in GitHub-backed mode.

## Pre-Flight Facts Already Confirmed

- npm org scope `@tentman` exists
- the publishing account already has 2FA enabled
- `npm pack --dry-run` already succeeds for:
  - `@tentman/core`
  - `@tentman/mdsvex`
  - `@tentman/vite`

This means the package work is mostly metadata and dependency-wiring cleanup, not a fundamentally broken publish path.

## Evening 1

### 1. Make The Three Packages Minimally Publishable

- remove `private` from packages that need to publish
- ensure published package names are final and correct
- replace `workspace:*` dependencies with real version ranges where needed
- add minimum metadata:
  - `license`
  - `repository`
  - `homepage`
  - `bugs`
  - `engines`
  - `files` allowlist if needed
- add short package READMEs

### 2. Validate Publish Artifacts

- run `npm pack --dry-run` again for `core`, `mdsvex`, and `vite`
- confirm package contents are clean enough for a first private/public npm release
- check that `mdsvex` resolves `@tentman/core` as a published dependency, not a workspace dependency

### 3. Publish Packages

Publish in this order:

1. `@tentman/core`
2. `@tentman/mdsvex`
3. `@tentman/vite`

Important first-publish note:

- use `npm publish --access public`

### 4. Switch Theresa's Site To Published Packages

- update package versions in Theresa's site
- install cleanly from npm
- confirm the site builds without any local workspace references

### 5. Get Theresa's Site Deploying

- deploy on Netlify
- verify at least one mdsvex-backed page and one image-backed page build correctly

## Evening 2

### 1. Implement A GitHub-Backed Asset Proxy

Add a read endpoint for CMS asset rendering in GitHub-backed mode.

Target behavior:

- image components request an app URL, not the final public site URL
- the server resolves the selected repo and ref
- the server reads the asset file from GitHub and streams it back with the correct content type

Likely shape:

- `GET /api/repo/asset?...`

Inputs likely needed:

- asset value
- block or root `assetsDir`
- selected repo identity from session
- active draft branch when present

### 2. Ref Selection Rules

Use this resolution order:

1. active Tentman draft branch if one exists
2. repository default branch otherwise

This keeps unpublished but saved work visible in the CMS.

### 3. Path Resolution Rules

The endpoint should:

- allow absolute `http(s)` URLs to bypass proxying
- keep `draft-asset:*` values on the existing in-browser draft asset path until save
- map relative and public asset paths back into the repo using configured `assetsDir`
- reject path traversal and values outside the intended public asset roots

### 4. Security Constraints

- require authenticated GitHub-backed mode
- do not expose arbitrary repo file reads
- only allow asset reads within configured public asset directories
- send sensible content headers

### 5. Demo Smoke Tests

Verify all of these:

- overview cards show images
- item edit pages show hero images
- markdown embedded images render
- unpublished items with saved images still render
- already-published assets still render

## Risks

### Highest Risk

The biggest risk is asset predictability, not npm publishing.

If the CMS depends on the public site or deploy previews to render images, unpublished content becomes fragile and the authoring experience is confusing.

### Secondary Risk

Package publishing may still reveal missing metadata or dependency-shape issues, but the existing successful `npm pack --dry-run` result suggests those are manageable.

## Explicitly Deferred

- CLI release
- Changesets
- CI/trusted publishing
- npm provenance setup
- object storage / asset bucket
- fully hardened CSP and release-security follow-up work
- polished preview-button ergonomics

## Success Criteria

This plan is complete when:

- Theresa's site installs the published Tentman packages from npm
- the site deploys on Netlify
- saved assets render in the CMS for her private repo without depending on the public site
- Theresa can continue matching content to the current site inside Tentman with working image previews

## Resume Here Next Session

If picking this up in a later session, start by checking:

1. whether `@tentman/core`, `@tentman/mdsvex`, and `@tentman/vite` have already been published
2. whether Theresa's site has already been switched off workspace/local package references
3. whether the GitHub-backed asset proxy endpoint exists yet
4. whether image rendering in GitHub-backed mode still relies on site-origin URLs instead of app-served proxy URLs

If packages are not yet published, start with Evening 1.

If packages are published and Theresa's site is deploying, move directly to Evening 2.
