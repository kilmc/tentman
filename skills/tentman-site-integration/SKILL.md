---
name: tentman-site-integration
description: Use when integrating Tentman into an existing website, adding or revising `.tentman.json` or `*.tentman.json` files, mapping an existing site content model onto Tentman, or updating an existing Tentman integration using the latest published docs.
---

# Tentman Site Integration

Use this skill for external-site integration work. Keep the scope tight: inspect the target site, refresh the published Tentman docs, use Tentman tooling when it helps, and make the smallest config changes that fit the site's current content model.

Assume `tentman` may be directly available on `PATH` in a local development environment. Prefer the direct CLI when it exists.

## Start With Published Docs

Refresh the public Tentman docs before giving advice or editing files:

1. Fetch `https://tentman.netlify.app/docs`.
2. Fetch `https://raw.githubusercontent.com/kilmc/tentman/main/README.md`.
3. Optionally run `git ls-remote https://github.com/kilmc/tentman.git HEAD` if you need a freshness check.

Treat the published docs as the default source of truth for integration guidance. If the docs and repo examples disagree, call that out and explain which source you are following.

Only fall back to local or unpublished repo state when:

1. the published docs are unavailable,
2. the user explicitly asks for unpublished behavior, or
3. the task is clearly about validating a change that has not shipped yet.

Use the repo's current CLI and examples as validation and implementation aids, not as a substitute for published docs when answering public integration questions.

## Workflow

1. Read [references/integration-playbook.md](references/integration-playbook.md).
2. Inspect the target site's stack, content files, loaders, asset paths, and any existing Tentman files.
3. If Tentman CLI commands are available in the working repo, use them to inspect and validate the integration.
4. Propose the smallest Tentman shape that preserves the current site architecture.
5. Add or update the required Tentman files.
6. Verify every Tentman path relative to the file that declares it and run the most relevant validation commands.

## Prefer Real Tooling

When you are working inside a repo that already has Tentman available, prefer the real CLI and project behavior over guesswork.

Useful commands include:

1. `tentman doctor [project-root]`
2. `tentman ci [project-root]`
3. `tentman content inspect <config-reference> [item-reference] [project-root]`
4. `tentman schema [config-reference] [project-root]`
5. `tentman nav check [project-root]`
6. `tentman assets check [project-root]`
7. `tentman format --check [project-root]`

If `tentman` is not directly available, try the repo-local wrapper in the Tentman monorepo, for example `pnpm run tentman -- doctor [project-root]`.

If no CLI entrypoint is available, continue with careful file inspection and explain that validation was limited to static repo analysis.

## Important Current Constraints

1. `blockPackages` work in GitHub-backed or server mode, not local browser-backed mode.
2. In local mode, custom adapter files must be self-contained ESM `.js` or `.mjs` modules.
3. Root config paths resolve relative to `.tentman.json`.
4. Content paths resolve relative to the config file that declares them.
5. Block adapter paths resolve relative to the block config that declares them.

## Output Expectations

For each Tentman task, provide:

1. The published docs you checked and the parts that matter for this site.
2. The site structure and current content model you found.
3. The Tentman config shape you chose and why it fits.
4. The validation you ran, including any relevant CLI checks or why they were unavailable.
5. The concrete file changes when implementation is requested.
6. Any remaining limitations, mismatches, or follow-up work.
