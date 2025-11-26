# Tentman CMS

A Git-based CMS - a standalone SvelteKit admin application that allows non-technical users to manage content for static sites via a web interface.

## Setup

### 1. Install Dependencies

```sh
pnpm install
```

### 2. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Tentman CMS (or your preferred name)
   - **Homepage URL**: `http://localhost:5173` (for development)
   - **Authorization callback URL**: `http://localhost:5173/auth/callback`
4. Click "Register application"
5. Copy the **Client ID**
6. Generate a new **Client Secret** and copy it

### 3. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```sh
cp .env.example .env
```

Edit `.env` and add your GitHub OAuth credentials:

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id_here
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret_here
SESSION_SECRET=change_this_to_a_random_string_in_production
```

### 4. Run Development Server

```sh
pnpm run dev

# or start the server and open the app in a new browser tab
pnpm run dev -- --open
```

## Using the CMS

1. Click "Login with GitHub" in the header
2. Authorize the application
3. Select a repository to manage
4. The CMS will discover `*.tentman.json` files and display available content types

## Configuration Guide

This guide explains how to create configuration files for your static site content that Tentman can manage.

### Quick Start

1. Create a `*.tentman.json` config file next to your content
2. Create a template file for new content items
3. Define your content structure using field definitions
4. Tentman will discover and render forms automatically

### Current Implementation (Phase 1)

The current version supports **multi-file collections** - managing multiple content files in a directory (like blog posts, projects, or case studies).

> **Note:** Singleton and single-file array patterns are planned for future releases.

### Basic Structure

A Tentman config file has four required properties:

```json
{
	"label": "Blog Posts",
	"template": "./post.template.md",
	"filename": "{{slug}}",
	"fields": [
		{ "label": "Title", "type": "text" },
		{ "label": "Slug", "type": "text" }
	]
}
```

#### Required Properties

- **`label`** (string): Display name in the CMS interface
- **`template`** (string): Path to template file (relative to config)
- **`filename`** (string): Pattern for new files, using `{{fieldName}}` placeholders
- **`fields`** (array): Content structure definition

### File Naming

Config files must follow the naming convention: `*.tentman.json`

Examples:

- `posts.tentman.json` - Blog posts configuration
- `projects.tentman.json` - Portfolio projects
- `team-members.tentman.json` - Team member profiles

### Template Files

Template files define the structure for new content items. They can be:

- Markdown files (`.md`) with frontmatter
- JSON files (`.json`) with initial structure

#### Markdown Template Example

```markdown
---
title: { { title } }
slug: { { slug } }
date: { { date } }
published: { { published } }
---

Write your content here...
```

#### JSON Template Example

```json
{
	"title": "{{title}}",
	"slug": "{{slug}}",
	"date": "{{date}}",
	"published": false,
	"tags": []
}
```

> **Tip:** Template placeholders like `{{slug}}` will be replaced with form values when creating new content.

### Field Types

Tentman currently supports these field types:

| Type       | Description                 | Use For                         |
| ---------- | --------------------------- | ------------------------------- |
| `text`     | Single-line text input      | Titles, names, short strings    |
| `textarea` | Multi-line text input       | Descriptions, excerpts          |
| `markdown` | Markdown editor (planned)   | Long-form content               |
| `email`    | Email input with validation | Contact emails                  |
| `url`      | URL input with validation   | Links, external URLs            |
| `number`   | Numeric input               | Counts, prices, IDs             |
| `date`     | Date picker                 | Publish dates, event dates      |
| `boolean`  | Checkbox toggle             | Published status, feature flags |
| `image`    | Image uploader (planned)    | Cover images, photos            |

### Field Definitions

Fields can be defined in two ways:

#### Simple Format

```json
{
	"label": "Title",
	"type": "text"
}
```

#### Extended Format (Planned)

Future versions will support additional properties:

```json
{
	"label": "Title",
	"type": "text",
	"required": true,
	"generated": true,
	"placeholder": "Enter a title..."
}
```

### Complete Example

Here's a complete configuration for blog posts:

#### `posts.tentman.json`

```json
{
	"label": "Blog Posts",
	"template": "./post.template.md",
	"filename": "{{slug}}",
	"fields": [
		{ "label": "Title", "type": "text" },
		{ "label": "Slug", "type": "text" },
		{ "label": "Date", "type": "date" },
		{ "label": "Author", "type": "text" },
		{ "label": "Cover Image", "type": "image" },
		{ "label": "Excerpt", "type": "textarea" },
		{ "label": "Published", "type": "boolean" }
	]
}
```

#### `post.template.md`

```markdown
---
title: { { title } }
slug: { { slug } }
date: { { date } }
author: { { author } }
coverImage: { { coverImage } }
excerpt: { { excerpt } }
published: { { published } }
---

Start writing your blog post here...
```

### Testing Your Configuration

#### For Local Testing (Current Phase)

1. Place your `*.tentman.json` file in `src/lib/examples/`
2. Place your template file in the same directory
3. Run `pnpm run dev`
4. Navigate to `/pages` to see your configuration listed
5. Click on your configuration to see the generated form

#### For Production Use (Future Phases)

Once GitHub integration is complete:

1. Place config files next to your content in your repository
2. Tentman will discover them automatically via GitHub Trees API
3. Authenticate with GitHub OAuth
4. Manage your content through the web interface

### Common Patterns

#### Blog Posts

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

#### Portfolio Projects

```json
{
	"label": "Portfolio Projects",
	"template": "./project.template.json",
	"filename": "{{slug}}",
	"fields": [
		{ "label": "Project Name", "type": "text" },
		{ "label": "Slug", "type": "text" },
		{ "label": "Client", "type": "text" },
		{ "label": "Year", "type": "number" },
		{ "label": "Website URL", "type": "url" },
		{ "label": "Description", "type": "textarea" },
		{ "label": "Featured", "type": "boolean" }
	]
}
```

#### Team Members

```json
{
	"label": "Team Members",
	"template": "./member.template.json",
	"filename": "{{slug}}",
	"fields": [
		{ "label": "Name", "type": "text" },
		{ "label": "Slug", "type": "text" },
		{ "label": "Role", "type": "text" },
		{ "label": "Email", "type": "email" },
		{ "label": "Photo", "type": "image" },
		{ "label": "Bio", "type": "textarea" }
	]
}
```

### Best Practices

#### Naming Conventions

- Use descriptive, plural labels: "Blog Posts" not "Post"
- Use lowercase, kebab-case for slugs: `my-first-post`
- Name template files clearly: `post.template.md`, `project.template.json`

#### Slug Fields

- Always include a `slug` field for URL-friendly identifiers
- Use slug in the `filename` pattern: `"filename": "{{slug}}"`
- Slugs should be unique within a collection

#### Date Fields

- Use ISO date format in templates: `{{date}}`
- Consider including both created and updated dates for auditing

#### Boolean Fields

- Use for toggles: published/draft, featured/normal, active/inactive
- Set sensible defaults in templates (usually `false`)

### Troubleshooting

#### Config not appearing in CMS

- Check filename ends with `.tentman.json`
- Verify JSON is valid (use a JSON validator)
- Ensure file is in `src/lib/examples/` for Phase 1 testing
- Check browser console for errors

#### Template not working

- Verify template path is correct and relative to config
- Check template file exists
- Ensure placeholder names match field labels (case-sensitive)

#### Form not generating correctly

- Verify all required properties are present
- Check field types are valid
- Ensure fields array is properly formatted
- Look for TypeScript errors in terminal

### Future Features

The following features are planned but not yet implemented:

- **Singleton pattern**: Single object content (about page, site config)
- **Single-file array pattern**: Arrays in one file (tour dates, releases)
- **Field validation**: Required fields, min/max, patterns
- **Auto-slug generation**: Generate slugs from titles automatically
- **Image uploads**: Upload images to repository
- **Array fields**: Nested repeatable content
- **GitHub integration**: Full OAuth and API support
- **Multi-repo support**: Manage multiple sites from one CMS

### Need Help?

- See example configs in `src/lib/examples/`
- Check `CLAUDE.md` for architectural details
- Review the TypeScript types in `src/lib/examples/index.ts`

### Migration Note

When upgrading to future versions, the config format will change to use field names as object keys instead of arrays:

**Current (Phase 1):**

```json
{
	"fields": [{ "label": "Title", "type": "text" }]
}
```

**Future:**

```json
{
	"fields": {
		"title": "text"
	}
}
```

Migration documentation will be provided when this change is released.

## Building

To create a production version:

```sh
pnpm run build
```

Preview the production build:

```sh
pnpm run preview
```

## Deployment

The project uses `@sveltejs/adapter-netlify` for Netlify deployment. Make sure to:

1. Set environment variables in Netlify dashboard
2. Update the GitHub OAuth App callback URL to your production URL
3. Deploy!

## Tech Stack

- **Framework**: SvelteKit + TypeScript + Svelte 5
- **Styling**: Tailwind CSS v4
- **GitHub API**: Octokit
- **Auth**: GitHub OAuth
- **Markdown**: gray-matter for frontmatter parsing
- **JSONPath**: jsonpath-plus for array operations

## Developer Documentation

For architecture details, development guidelines, and technical documentation, see [CLAUDE.md](./CLAUDE.md).
