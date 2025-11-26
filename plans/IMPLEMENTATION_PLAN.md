# Implementation Plan

## Phase 1: GitHub Authentication & Repo Connection ✅ COMPLETED

**Goal**: User can authenticate with GitHub and select a repository to manage

### Tasks

- ✅ Set up GitHub OAuth flow (login, callback, token storage)
- ✅ Create session management (store access token securely)
- ✅ Build repo selection UI (list user's repos, allow selection)
- ✅ Store selected repo in session/state
- ✅ Create basic app layout (header with auth status, repo switcher)

### Deliverable

✅ User can log in with GitHub and select a repo to work with

### Implementation Notes

**Files created/modified:**

- `src/routes/auth/login/+server.ts` - OAuth login route
- `src/routes/auth/callback/+server.ts` - OAuth callback handler
- `src/routes/auth/logout/+server.ts` - Logout route
- `src/routes/repos/+page.server.ts` - Repository list and selection
- `src/routes/repos/+page.svelte` - Repository selection UI
- `src/routes/+layout.server.ts` - Layout data loader
- `src/routes/+layout.svelte` - App header with auth UI
- `src/hooks.server.ts` - Server hooks for auth state
- `src/app.d.ts` - TypeScript types for locals
- `.env` and `.env.example` - Environment configuration
- `README.md` - Setup documentation

**Dependencies added:**

- `octokit` - GitHub API client
- `@octokit/auth-oauth-app` - OAuth authentication
- `gray-matter` - Markdown frontmatter parsing (for future use)
- `jsonpath-plus` - JSONPath for array operations (for future use)

**Technical decisions made:**

- Session storage: HTTP-only cookies for security
- Token stored in cookie with 30-day expiration
- Selected repo stored in separate cookie
- Authentication state validated on every request via hooks

## Phase 2: Config Discovery & Parsing ✅ COMPLETED

**Goal**: CMS can find and parse all config files in the selected repo

### Tasks

- ✅ Implement GitHub Trees API integration to get full repo structure
- ✅ Filter tree for `*.tentman.json` files (excluding `_*.tentman.json`)
- ✅ Fetch and parse config files from repo
- ✅ Create type inference logic (detect singleton vs array vs multi-file)
- ✅ Build data structures to represent discovered configs
- ✅ Create navigation UI showing available collections/pages

### Deliverable

✅ CMS displays a list of editable content types found in the repo

### Implementation Notes

**Files created/modified:**

- `src/lib/types/config.ts` - TypeScript types for configs and inference
- `src/lib/config/discovery.ts` - Config discovery utilities using GitHub Trees API
- `src/routes/pages/+page.server.ts` - Server-side config discovery
- `src/routes/pages/+page.svelte` - Config list UI with cards
- `src/routes/pages/[page]/+page.server.ts` - Individual config loader
- `src/routes/pages/[page]/+page.svelte` - Config detail view
- `src/routes/+page.svelte` - Enhanced home page with status
- `src/routes/+layout.svelte` - Added Content navigation link

**Technical decisions made:**

- Config type inference based on presence of `template`, `contentFile`, and `collectionPath`
- GitHub Trees API used with recursive fetch for full repo structure
- Configs cached per request (not persisted between requests)
- Slug generation from config label for URL routing

## Phase 3: Content Fetching & Display

**Goal**: CMS can read content files and display them in lists

### Tasks

- Implement content fetching for all three patterns:
  - Singleton: fetch single JSON file
  - Single-file array: fetch JSON, parse with JSONPath
  - Multi-file collection: fetch directory contents, parse files
- Handle markdown frontmatter parsing
- Build list views for collections (show all items)
- Build detail view for singletons
- Add loading states and error handling

### Deliverable

User can view existing content in all formats (singleton, arrays, collections)

## Phase 4: Form Generation

**Goal**: CMS generates edit forms based on config field definitions

### Tasks

- Create form components for each field type:
  - Text input, textarea, markdown editor
  - Email, URL inputs
  - Number, date inputs
  - Boolean checkbox
  - Image upload (file input)
  - Array field with add/remove items
- Implement nested field rendering (arrays with object fields)
- Add form validation (required fields)
- Build form layout and styling
- Handle field defaults and placeholders

### Deliverable

User sees properly formatted edit forms for any content type

## Phase 5: Editing & Committing (Singletons & Arrays)

**Goal**: User can edit and save changes to singleton and single-file array content

### Tasks

- Implement edit mode for singletons (load data into form)
- Implement edit mode for single-file arrays (load item into form)
- Build "save" functionality:
  - Generate updated JSON from form data
  - Use GitHub API to update file content
  - Create commit with meaningful message
- Handle `idField` matching for array updates
- Add success/error feedback
- Implement optimistic UI updates

### Deliverable

User can edit and save singleton pages and array items

## Phase 6: Creating & Deleting (Arrays & Collections)

**Goal**: User can create new items and delete existing items

### Tasks

- Build "new item" UI for arrays and collections
- Implement template processing (replace `{{placeholder}}` values)
- Generate new files:
  - Arrays: add to array
  - Collections: create new file with generated name
- Implement ID generation for arrays (if `generated: true`)
- Build delete confirmation UI
- Implement delete operations:
  - Arrays: filter out item by ID
  - Collections: delete file
- Handle commit creation for creates/deletes

### Deliverable

User can create new blog posts, tour dates, etc., and delete existing items

## Phase 7: Image Upload

**Goal**: User can upload images when editing content

### Tasks

- Build image upload UI (file input, drag-and-drop)
- Implement image upload to repo:
  - Convert to base64 for GitHub API
  - Store in `/static/images/` or configured path
  - Generate file path/URL
- Update form field value with image path
- Show image preview in form
- Handle image deletion (optional)

### Deliverable

User can upload images when editing content

## Phase 8: Multi-File Collection Editing

**Goal**: Complete CRUD operations for markdown and JSON file collections

### Tasks

- Implement markdown editor (textarea with preview)
- Handle frontmatter serialization/deserialization
- Support filename changes (rename operations)
  - Delete old file, create new file
  - Show warning about URL changes
- Ensure slug/ID field uniqueness validation
- Test with both markdown and JSON collections

### Deliverable

User can fully manage blog posts, year-end lists, etc.

## Phase 9: UX Polish & Error Handling

**Goal**: Production-ready user experience

### Tasks

- Add comprehensive error handling:
  - GitHub API errors
  - Config parsing errors
  - Validation errors
- Improve loading states and transitions
- Add confirmation dialogs for destructive actions
- Implement "unsaved changes" warnings
- Add keyboard shortcuts (save, cancel)
- Mobile responsive design
- Add user feedback (toasts, notifications)
- Create help text and documentation

### Deliverable

Polished, production-ready CMS interface

## Phase 10: Advanced Features (Optional/Future)

**Goal**: Enhanced functionality for power users

### Tasks

- Array item reordering (drag-and-drop)
- Batch operations (delete multiple, publish multiple)
- Search/filter in collections
- Auto-slug generation from titles
- Rich text editor option for markdown
- Preview mode (show how content will look)
- Commit history/rollback
- Multi-repo management (switch between client sites)
- Field validation rules (patterns, min/max)
- Custom field types via plugins

### Deliverable

Enhanced CMS with power user features

## Technical Decisions Made

- ✅ **Session storage approach**: HTTP-only cookies with secure settings
- ✅ **Authentication flow**: GitHub OAuth with token stored in cookie
- ✅ **Repository storage**: Selected repo stored in separate cookie
- ✅ **Config discovery**: GitHub Trees API with recursive fetch
- ✅ **Type inference**: Based on config structure (template/contentFile/collectionPath)
- ✅ **URL routing**: Slug generation from config labels

## Technical Decisions Still To Make

- Image upload path convention (configurable vs fixed)
- Commit message format
- Error logging/monitoring
- Rate limiting handling (GitHub API)
- Large file handling strategies
- Conflict resolution (if file changed externally)

---

## Current Status

**Last Updated**: 2025-11-24

**Completed Phases**: 2 of 10

**Next Up**: Phase 3 - Content Fetching & Display

**Setup Required Before Testing**:

1. Create GitHub OAuth App at https://github.com/settings/developers
2. Add credentials to `.env` file
3. Run `pnpm run dev`
4. Test login flow and repository selection
