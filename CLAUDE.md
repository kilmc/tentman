# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tentman is a Git-based CMS - a standalone SvelteKit admin application that allows non-technical users to manage content for static sites via a web interface. The CMS authenticates with GitHub, reads config files from repos to understand content structure, generates forms for editing, and commits changes back via the GitHub API.

### The Problem Being Solved

Enables building static sites (SvelteKit) for clients who want to manage content themselves without:
- Using platforms like Squarespace, Wix, or WordPress
- Paying for hosting or CMS services
- Losing the benefits of GitHub + Netlify (free, automated deployment)
- Loading CMS scripts on the public site

### Tech Stack
- **Framework**: SvelteKit + TypeScript + Svelte 5
- **Styling**: Tailwind CSS v4
- **GitHub API**: Octokit (to be integrated)
- **Auth**: GitHub OAuth (to be integrated)
- **Markdown**: gray-matter for frontmatter parsing (to be integrated)
- **JSONPath**: jsonpath-plus for array operations (to be integrated)

## Development Commands

### Run Development Server
```bash
npm run dev
# or with browser open
npm run dev -- --open
```

### Build & Preview
```bash
npm run build
npm run preview
```

### Type Checking
```bash
npm run check           # Run once
npm run check:watch     # Watch mode
```

### Linting & Formatting
```bash
npm run lint            # Check formatting and lint
npm run format          # Fix formatting
```

### Testing
```bash
npm run test            # Run all tests once
npm run test:unit       # Run tests in watch mode
```

The project uses Vitest with two test configurations:
- **Client tests** (`*.svelte.{test,spec}.{js,ts}`): Run in browser environment using Playwright/Chromium
- **Server tests** (`*.{test,spec}.{js,ts}`, excluding Svelte files): Run in Node environment

## Architecture

### Separation of Concerns

The CMS follows a clean separation principle:
- **Public site**: Normal SvelteKit app that reads content files (JSON, markdown)
- **CMS admin app**: This standalone SvelteKit app that edits those files via GitHub API
- **No coupling**: Public sites never know the CMS exists

### Three Content Patterns

The CMS supports three distinct content management patterns:

**1. Singleton** - Single object (about page, homepage hero)
- One JSON file with structured data
- Config describes fields only

**2. Single-file Array** - Array in one file (tour dates, releases)
- One JSON file containing an array
- Config specifies JSONPath to array location
- Uses `idField` for reliable updates/deletes

**3. Multi-file Collection** - Multiple files in directory (blog posts)
- Markdown or JSON files, one per item
- Config includes template for new items
- Filename-based identification

### Config File Design

**Convention-Based Discovery:**
- Configs are `*.config.json` files co-located with content
- CMS uses GitHub Trees API to discover all configs in repo
- No central manifest needed

**Type Inference:**
Behavior is inferred from config structure:
- Has `template`? → Multi-file collection
- Has `contentFile` + `collectionPath`? → Single-file array
- Has `contentFile` only? → Singleton

**Config Properties:**
- `label`: Display name in CMS
- `contentFile`: Path to content file (for singletons and arrays)
- `collectionPath`: JSONPath to array (for single-file arrays)
- `template`: Path to template file (for multi-file collections)
- `filename`: Pattern for new files, e.g., `{{slug}}` (extension auto-added from template)
- `idField`: Field name used as unique identifier
- `fields`: Object defining content structure and form inputs

**Field Types:**
```
Simple string types:
- "text", "textarea", "markdown"
- "email", "url"
- "number", "date", "boolean"
- "image" (uploads to repo)
- "array" (with nested fields object)

Fields can be:
- Simple: "fieldName": "text"
- Objects: "fieldName": {"type": "text", "required": true, "generated": true}
```

**Example Config** (`src/lib/examples/*.tent.json`):

Current implementation (Phase 1):
```json
{
  "label": "Blog Posts",
  "template": "./post.template.md",
  "filename": "{{slug}}",
  "fields": [
    { "label": "Title", "type": "text" },
    { "label": "Slug", "type": "text" },
    { "label": "Date", "type": "date" },
    { "label": "Published", "type": "boolean" }
  ]
}
```

Planned format (with field names as keys):
```json
{
  "label": "Blog Posts",
  "contentFile": "./posts/index.json",
  "collectionPath": "$.posts",
  "idField": "slug",
  "fields": {
    "title": "text",
    "slug": {"type": "text", "generated": true},
    "date": "date",
    "published": "boolean"
  }
}
```

### Current Implementation (Phase 1)

**Data Flow:**
1. Example configs are loaded via `import.meta.glob()` in `src/lib/examples/index.ts`
2. Configs are exported as the `examples` array
3. Routes dynamically load and render configurations:
   - `/pages` - Lists all examples
   - `/pages/[page]` - Renders specific example using slugified label as URL param

**Note:** The current implementation uses local example files. Full GitHub integration (OAuth, API, multi-repo support) is planned for future phases.

### Directory Structure

- `src/lib/` - Reusable library code
  - `examples/` - Example configurations (*.tent.json) and templates
  - `utils/` - Utility functions (e.g., `slugify`)
  - `assets/` - Static assets like icons
- `src/routes/` - SvelteKit file-based routing
  - `+layout.svelte` - Root layout (imports global CSS, sets favicon)
  - `+page.svelte` - Home page
  - `pages/` - Dynamic configuration pages
    - `+page.ts` - Loads all examples
    - `[page]/+page.ts` - Loads specific example by slug, throws 404 if not found

### Key Patterns

**Svelte 5 Runes:** This project uses Svelte 5 with runes syntax:
- `$props()` for component props
- `{@render children?.()}` for slot content

**Path Aliases:**
- `$lib` → `src/lib/`
- Managed by SvelteKit automatically

**Vite Globs:** The project uses Vite's `import.meta.glob()` for dynamic imports of configuration files. Templates are also discovered this way but aren't currently utilized (see console.log in `src/lib/examples/index.ts`).

## Key Features (Planned)

- GitHub OAuth authentication
- Multi-repo support (manage multiple client sites)
- Config-driven form generation
- Image uploads to repository
- Commit changes via GitHub API
- Support for markdown with frontmatter
- Template-based file creation
- Convention-based config discovery

## Design Philosophy

- **Convention over configuration**: Minimal required config, infer behavior from structure
- **Co-location**: Configs live near content they describe
- **Clean separation**: Public sites unaware of CMS
- **Type inference**: File extensions and structure determine behavior
- **Simple first**: Start with core field types, extend later if needed

## Future Considerations

- Field validation (required, min/max, patterns)
- Preview before commit
- Draft/publish workflows
- Array item reordering (drag-and-drop)
- Auto-slug generation
- Custom field type plugins
- External image hosting (Cloudinary, etc.)
- YAML support

## Deployment

The project uses `@sveltejs/adapter-netlify` for Netlify deployment.

## TypeScript Configuration

Strict mode is enabled with the following key settings:
- `strict: true`
- `moduleResolution: "bundler"`
- JSON module imports enabled

## Package Manager

This project uses **pnpm** (see `pnpm-workspace.yaml` and `.npmrc`).
