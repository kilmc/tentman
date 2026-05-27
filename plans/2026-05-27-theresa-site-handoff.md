# Theresa Site Handoff

## Purpose

This handoff is for the agent working in Theresa's private site repo.

Tentman-side prerequisites are now ready for the private demo track:

- `@tentman/core@0.0.1` is published
- `@tentman/mdsvex@0.0.1` is published
- `@tentman/vite@0.0.1` is published
- Tentman now supports GitHub-backed asset proxy rendering for saved CMS assets
  - unsaved uploads still use blob previews
  - saved assets load from the managed draft branch when present
  - otherwise they fall back to the repo default branch

The next job is to update Theresa's site repo to consume the published packages and get it ready for a private Netlify deploy.

## Handoff Prompt

Use this prompt in Theresa's repo if you want a direct agent handoff:

```md
Please update this site repo to work with the newly published Tentman packages and prepare it for a private Netlify demo deploy.

Context:
- This repo is Theresa's private site repo.
- On the Tentman side, these packages are now published and should be used instead of any local/workspace references:
  - @tentman/core@0.0.1
  - @tentman/mdsvex@0.0.1
  - @tentman/vite@0.0.1
- Tentman now has a GitHub-backed asset proxy for saved CMS assets, so CMS image rendering should not depend on the public live site or Netlify preview URLs.
- We are optimizing for a private demo this week, not a full public release.
- CLI publishing, Changesets, CI publishing, and bucket/object-storage work remain out of scope.

Please do the following:
1. Inspect the repo for any local, workspace, file, link, git, or otherwise non-npm Tentman package references.
2. Replace those references with the published npm packages above.
3. Ensure the site still imports and configures Tentman correctly.
   - If the repo uses mdsvex, keep or wire:
     - `@tentman/mdsvex`
     - `mdsvex`
     - `remark-directive`
   - If the repo uses the Tentman Vite helper, keep or wire:
     - `@tentman/vite`
4. Run a clean install and confirm the site builds without workspace-local Tentman dependencies.
5. Keep changes narrowly scoped to what is required for the private demo release.
6. Prepare the repo for Netlify deployment, but do not broaden scope into unrelated infra work.
7. Verify the most relevant pages and asset-backed content still build correctly.

Important things to check:
- `package.json`
- lockfile
- `svelte.config.*`
- `vite.config.*`
- any local scripts or aliases pointing at the Tentman monorepo
- any references to `workspace:*`, `file:`, `link:`, or direct local paths for Tentman packages

Important behavior note:
- Saved CMS assets in GitHub-backed mode should now render through Tentman's app-served proxy, not through the public site origin.
- If image rendering still appears tied to public-site URLs, do not work around it by adding preview-origin hacks. Flag the exact case instead.

Please report back with:
- what package source references were changed
- whether install succeeded cleanly
- whether build succeeded cleanly
- any Netlify config or env vars that still need manual setup
- any remaining blockers for the private demo
```

## Expected Repo Tasks

The likely work in Theresa's repo is:

1. Replace old Tentman package sources.
   - Search for `workspace:*`, `file:`, `link:`, local paths, or direct monorepo references.
   - Replace them with `0.0.1` package versions.

2. Reinstall dependencies cleanly.
   - Use the repo's existing package manager.
   - Regenerate the lockfile only as needed.

3. Confirm Tentman wiring still matches the published package API.
   - mdsvex setup should still use `tentmanComponents` from `@tentman/mdsvex`.
   - Vite setup should still use `tentmanContentComponentReload` from `@tentman/vite` if that helper is in use.

4. Build and smoke-test the site.
   - Verify at least one mdsvex-backed page.
   - Verify at least one image-backed page.
   - Verify the site no longer depends on local Tentman workspace packages.

5. Prepare for Netlify.
   - Keep scope limited to getting the private demo deploy working.
   - Avoid unrelated refactors or public-release hardening.

## Netlify Notes

Netlify prep is expected soon, but not every step must be automated by the agent.

The main things to confirm are:

- the correct build command for Theresa's repo
- the correct publish/output directory
- any required environment variables
- GitHub OAuth callback/homepage settings if her deployed Tentman app path depends on them

If the repo already has Netlify config, preserve it unless a Tentman package source change requires a small update.

## Demo Smoke Checklist

Once Theresa's repo is updated and deploying from npm packages, verify:

- the site installs from npm cleanly
- the site builds on Netlify
- overview cards show images in the CMS
- item edit pages show hero images
- markdown embedded images render
- unpublished items with saved images still render
- already-published assets still render

## Scope Guardrails

Do not expand scope into:

- CLI release work
- Changesets
- CI/trusted publishing
- object storage or buckets
- public-release hardening
- broad cleanup unrelated to the private demo
