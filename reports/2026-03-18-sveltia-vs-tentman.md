# Tentman vs. Sveltia CMS

Date: 2026-03-18

## Executive Summary

Sveltia is much broader and more mature as a product today than Tentman. It already covers the classic Git-backed CMS shape well: CDN-served browser app, multiple Git backends, many field types, strong i18n, richer asset management, local workflow, external media storage, stock-photo integration, AI translation, and a meaningful extension API.

Tentman is not trying to do all of that yet. What it does have is a simpler, more opinionated model around GitHub-backed content editing with a custom draft-branch workflow. The most notable things Tentman currently has that I did not find as first-class Sveltia features are:

- A repo-wide single draft branch flow with publish and discard review UI.
- Direct comparison of draft vs. main content by config.
- A first-class "single JSON file + JSONPath array" content model.
- Tentative Netlify preview branch support.

The big architectural catch is deployment. Tentman is not currently a browser-only CDN app. It is a SvelteKit server app with server-side OAuth, server-side GitHub access, server-side actions, and server-side caches. Hosting it on Netlify is already plausible with the current codebase. Turning it into a Sveltia-style CDN script is possible, but it is a substantial architectural rewrite, not a packaging tweak.

## Sveltia: Feature Inventory

This is the most complete picture I could assemble from Sveltia's official docs, homepage, package page, and GitHub repo.

### Product and deployment model

- CDN-served SPA that runs entirely in the browser.
- NPM package also available for self-hosting.
- No database or app server required for the default setup.
- Manual initialization and JS API are available.
- Supports deploying on static hosts such as Netlify, Cloudflare Pages, GitHub Pages, Vercel, and standard web servers.

### Git backends and authentication

- GitHub backend.
- GitLab backend.
- Gitea / Forgejo backend.
- Local repository workflow using browser file system APIs.
- PAT sign-in for quick developer setup.
- OAuth-based auth flows depending on backend.
- Optional separate "Sveltia CMS Authenticator" worker for some remote auth setups.
- GitHub Enterprise support.

Important caveat:

- The GitHub backend docs list Local Workflow, Simple Workflow, Editorial Workflow, and Open Authoring as supported.
- But the dedicated Editorial Workflow and Open Authoring docs both explicitly mark those workflows as unimplemented.
- My read is that the config surface and backend intent exist, but those advanced workflows are not actually ready yet.

### Content modeling

- Entry collections.
- File collections.
- Top-level singletons.
- Collection dividers and icons.
- Relational content modeling through relation fields.
- Markdown, YAML, JSON, and TOML content formats.
- Custom file formats via API.

### Field types

Built-in field types documented by Sveltia:

- Boolean
- Code
- Color
- Compute
- DateTime
- File
- Hidden
- Image
- KeyValue
- List
- Map
- Markdown
- Number
- Object
- Relation
- RichText
- Select
- String
- Text
- UUID

### Rich editing

- Lexical-based rich text editor.
- Rich text and raw Markdown modes.
- Configurable toolbar.
- Built-in editor components including code blocks and images.
- Image paste / drop in editor.
- Custom editor components via API.

### Media and DAM

- Internal media storage in the Git repo.
- External media storage integrations:
  - Amazon S3
  - Cloudflare R2
  - Cloudinary
  - DigitalOcean Spaces
  - Uploadcare
- Asset library.
- Folder structures.
- Search and filtering in asset management.
- Drag-and-drop uploads.
- Stock photo integrations:
  - Pexels
  - Pixabay
  - Unsplash
- Image optimization, including resizing and format conversion.

### Internationalization

- First-class i18n support.
- Locale-aware field behavior.
- Duplicate vs localized field behavior.
- Several content storage structures for translated content:
  - single_file
  - multiple_files
  - multiple_folders
  - multiple_root_folders
- Locale placeholders for file collections.
- AI-assisted translation integrated into the editor.

### AI / translation integrations

- Google Cloud Translation.
- Anthropic Claude Haiku 4.5.
- Google Gemini 2.5 Flash-Lite.
- OpenAI GPT-4o mini.
- Translation buttons at field and pane level.
- BYOK model with keys stored in browser local storage.

### UX / editor features

- Mobile and tablet support.
- Dark mode.
- Keyboard shortcuts.
- Accessibility-first positioning.
- Full-text search across content.
- Entry backups while editing.
- QR login on mobile.

### Developer-facing features

- JSON Schema-backed config validation and autocomplete.
- TypeScript support.
- JS API methods for:
  - init
  - preview styles
  - preview templates
  - editor components
  - field types
  - custom formats
  - event listeners
- AI-tool support documentation (`llms.txt`).
- CSP builder.

### Project status

As of the sources I found on 2026-03-18:

- Official docs still describe Sveltia as beta and say 1.0 is expected in early 2026.
- The GitHub repo search result showed the latest indexed release as `v0.127.0` on 2025-12-29.
- I did not find evidence in the indexed sources of a shipped 1.0 release yet.

## Tentman: Current State

### What exists in code today

Tentman is already a functioning GitHub-backed CMS prototype, not just a rough idea.

Implemented capabilities I found in the codebase:

- GitHub OAuth login flow with cookie-based session token storage.
- Repository picker for authenticated users.
- Config discovery from `*.tentman.json` files in GitHub repos.
- Three content models:
  - singleton
  - single-file array via JSONPath
  - multi-file collection
- Relative path resolution for content and templates.
- Markdown frontmatter parsing and writing.
- JSON file parsing and writing.
- CRUD flows for content.
- Image upload endpoint writing images back into the GitHub repo.
- Form generation from config.
- Supported Tentman field types:
  - text
  - textarea
  - markdown
  - email
  - url
  - number
  - date
  - boolean
  - image
  - array
- Validation for required fields, lengths, email, URL, date, number, and ID uniqueness.
- Draft workflow built around preview branches.
- Draft comparison against main.
- Publish page that reviews changes and merges then deletes the draft branch.
- Netlify adapter in the app build.
- Root config support for Netlify site name.

### Notable Tentman-specific ideas

These are the parts that feel genuinely differentiated rather than just "smaller Sveltia":

- Single draft branch model:
  - Tentman creates or reuses a preview branch and accumulates unpublished edits there.
  - That is closer to a lightweight editorial queue than Sveltia's documented simple workflow.
- Draft comparison and publish screen:
  - Tentman compares main vs draft per config and then merges/discards the draft branch.
- Single-file array model:
  - Tentman can manage arrays embedded in one JSON file using JSONPath.
  - I did not find an equivalent first-class collection model in Sveltia's documented collection system.
- Netlify preview awareness:
  - There is explicit code for generating branch-specific Netlify preview URLs.

### Current health

The repo is active but not cleanly shippable yet.

What I verified locally:

- `pnpm build` succeeds.
- `pnpm check` fails with TypeScript errors and a number of Svelte a11y / reactivity warnings.
- `pnpm test` does not currently run in this sandbox because Vitest tried to listen on a local port and hit an `EPERM`, so I could not verify real test coverage.

The most relevant current problems:

- Type errors in publish and edit routes.
- Several accessibility warnings in form fields and modal UI.
- Some docs are stale relative to the code:
  - README still says singleton and single-file arrays are planned.
  - README marks markdown and image support as planned.
  - README references `CLAUDE.md`, but that file is deleted in the current worktree.

## What Tentman Has That Sveltia Does Not

This is the shortest honest list I can defend from the sources and code:

- Repo-wide draft branch staging and publish/discard flow.
- Per-config draft comparison against the main branch.
- A built-in "single JSON file + JSONPath array" CRUD model.
- A more opinionated branch-based preview/publish flow that could fit Netlify deploy previews very naturally.

I would not claim broader feature superiority anywhere else. In almost every other dimension, Sveltia is ahead.

## What Tentman Is Missing Relative to Sveltia

Tentman currently lacks, or only hints at, most of the following:

- Browser-only / CDN deployment model.
- Multiple Git backends beyond GitHub.
- PAT-based quick auth.
- Local repository workflow.
- File collections / content modeling breadth comparable to Sveltia.
- Rich field set beyond Tentman's current 10 field types.
- Rich text editor on the level of Lexical.
- Relation fields.
- UUID / compute / select / code / color / hidden / key-value / map field types.
- First-class multilingual content management.
- AI translation.
- Asset library / DAM experience.
- External media backends.
- Stock photo integrations.
- Full-text search.
- Entry backups.
- JS extension API for custom fields, formats, preview templates, event hooks.
- JSON schema / IDE support for the Tentman config format.
- Multi-platform deployment story.
- Mature authentication options for non-technical multi-user teams.

## Could Tentman Be Served Like a CDN Package?

Short answer: not easily in its current form.

### Why not

Tentman is built as a server app today, not a browser-only SPA.

The main blockers are architectural:

- GitHub OAuth uses server-only secrets and a server callback route.
- Authenticated Octokit clients are created server-side.
- Data loading is done in `+page.server.ts` and `+layout.server.ts`.
- Writes happen through SvelteKit server actions.
- Image upload goes through a server endpoint.
- Config and content caches are server-side module caches.

That means Tentman currently behaves like:

- "host a SvelteKit app on Netlify"

not like:

- "drop a single JS file into `/admin/index.html` and let the browser do everything"

### What would be easy

Easy path:

- Keep Tentman as a SvelteKit app.
- Deploy it to Netlify using the existing adapter.
- Use Netlify server functions / edge support as needed.

That path is already aligned with the current codebase.

### What would be medium to hard

Moderately hard:

- Extract some UI pieces and config logic into a reusable package.
- Keep a separate hosted SvelteKit shell for auth and GitHub API access.

This could improve reuse, but it would not make Tentman truly browser-only.

Hard path:

- Re-architect Tentman into a browser-first app like Sveltia.
- Replace server-side load/actions with client-side state and API calls.
- Replace cookie/server-session auth with PAT, PKCE, or an external OAuth helper.
- Move GitHub operations to browser-safe flows.
- Rework upload handling.
- Rebuild persistence / caching around browser storage rather than Node process memory.
- Probably simplify or redesign routes around a client router / SPA shell.

My judgment:

- This is a substantial rewrite, not a packaging exercise.
- If the goal is "Sveltia-style static admin app served from a CDN", it is better thought of as Tentman v2 architecture than Tentman deployment work.

## Recommendation

If your goal is to ship something soon, the best path is probably:

- Decide whether Tentman should remain a differentiated GitHub-only, branch-workflow CMS.
- If yes, keep it as a hosted SvelteKit app and lean into its unique draft-branch workflow.
- Do not chase a CDN build yet.

If your goal is specifically:

- "maintenance-light, static admin page, browser-only, cheap hosting"

then Tentman in its current shape is pointed in the wrong architectural direction, and Sveltia is already much closer to that target.

If you want Tentman to continue, I think the strongest product direction is not "catch Sveltia feature-for-feature." It is:

- GitHub-first
- branch-centric publishing
- excellent JSON and markdown repo editing
- strong preview/deploy integration
- opinionated and simple for small teams

That would give Tentman a clearer identity than becoming a partial clone of Sveltia.

## Sources

Sveltia sources:

- https://sveltiacms.app/en/docs/intro
- https://sveltiacms.app/en/docs/features
- https://sveltiacms.app/en/docs/start
- https://sveltiacms.app/en/docs/backends/github
- https://sveltiacms.app/en/docs/workflows/local
- https://sveltiacms.app/en/docs/workflows/simple
- https://sveltiacms.app/en/docs/workflows/editorial
- https://sveltiacms.app/en/docs/workflows/open
- https://sveltiacms.app/en/docs/collections
- https://sveltiacms.app/en/docs/fields
- https://sveltiacms.app/en/docs/fields/relation
- https://sveltiacms.app/en/docs/fields/richtext
- https://sveltiacms.app/en/docs/i18n
- https://sveltiacms.app/en/docs/media/internal
- https://sveltiacms.app/en/docs/media/uploadcare
- https://sveltiacms.app/en/docs/integrations/translations
- https://sveltiacms.app/en/docs/releases
- https://github.com/sveltia/sveltia-cms
- https://github.com/sveltia/sveltia-cms-auth

Tentman code and docs inspected:

- `README.md`
- `package.json`
- `TODOS.md`
- `REFACTOR_PLAN.md`
- `plans/REFACTOR_COMPLETE.md`
- `src/lib/types/config.ts`
- `src/lib/config/discovery.ts`
- `src/lib/content/fetcher.ts`
- `src/lib/content/writer.ts`
- `src/lib/github/branch.ts`
- `src/lib/github/commit.ts`
- `src/lib/github/image.ts`
- `src/lib/stores/config-cache.ts`
- `src/lib/stores/content-cache.ts`
- `src/lib/utils/draft-comparison.ts`
- `src/lib/utils/validation.ts`
- `src/routes/auth/login/+server.ts`
- `src/routes/auth/callback/+server.ts`
- `src/routes/repos/+page.server.ts`
- `src/routes/pages/+layout.server.ts`
- `src/routes/pages/[page]/+page.server.ts`
- `src/routes/pages/[page]/edit/+page.server.ts`
- `src/routes/pages/[page]/new/+page.server.ts`
- `src/routes/pages/[page]/preview-changes/+page.server.ts`
- `src/routes/pages/[page]/[itemId]/edit/+page.server.ts`
- `src/routes/pages/[page]/[itemId]/preview-changes/+page.server.ts`
- `src/routes/publish/+page.server.ts`
- `src/lib/config/root-config.ts`
- `src/lib/netlify/preview.ts`
