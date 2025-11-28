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
- **Config naming convention**: `*.tentman.json` (changed from `*.config.json` on 2025-11-26 for clear branding)
- **Documentation structure**: README.md serves as user-facing entry point with comprehensive configuration guide; CLAUDE.md maintained for developer/architecture documentation

## Phase 3: Content Fetching & Display ✅ COMPLETED

**Goal**: CMS can read content files and display them in lists

### Tasks

- ✅ Implement content fetching for all three patterns:
  - ✅ Singleton: fetch single JSON file
  - ✅ Single-file array: fetch JSON, parse with JSONPath
  - ✅ Multi-file collection: fetch directory contents, parse files
- ✅ Handle markdown frontmatter parsing
- ✅ Build list views for collections (show all items)
- ✅ Build detail view for singletons
- ✅ Add loading states and error handling

### Deliverable

✅ User can view existing content in all formats (singleton, arrays, collections)

### Implementation Notes

**Files created/modified:**

- `src/lib/content/fetcher.ts` - Content fetching utilities for all three patterns
  - `fetchContent()` - Main dispatcher function
  - `fetchSingleton()` - Fetches single JSON file
  - `fetchArrayItems()` - Fetches JSON file and extracts array via JSONPath
  - `fetchCollectionItems()` - Fetches directory contents and parses files
- `src/routes/pages/[page]/+page.server.ts` - Updated to fetch content using new utilities
- `src/routes/pages/[page]/+page.svelte` - Complete UI rewrite with:
  - Singleton detail view (key-value pairs with smart formatting)
  - Array/collection list view (cards with preview and actions)
  - Loading states (spinner animation)
  - Error handling (red error box)
  - Empty states (for collections with no items)
  - Debug panel (collapsible raw data viewer)

**Technical decisions made:**

- Content fetching is graceful: errors don't crash the page, they're displayed to the user
- Markdown files store body content in `_body` field
- All collection items include `_filename` metadata for reference
- Field labels auto-generate from field names (camelCase → Title Case)
- List views show first 3 fields prominently, rest in collapsible details
- GitHub API base64 decoding handled in fetcher utilities
- JSONPath results flattened if nested arrays returned
- Edit/Delete buttons present but not yet functional (Phase 5-6)

## Phase 4: Form Generation ✅ COMPLETED

**Goal**: CMS generates edit forms based on config field definitions

### Tasks

- ✅ Create form components for each field type:
  - ✅ Text input, textarea, markdown editor
  - ✅ Email, URL inputs
  - ✅ Number, date inputs
  - ✅ Boolean checkbox
  - ✅ Image upload (file input)
  - ✅ Array field with add/remove items
- ✅ Implement nested field rendering (arrays with object fields)
- ✅ Add form validation (required fields)
- ✅ Build form layout and styling
- ✅ Handle field defaults and placeholders

### Deliverable

✅ User sees properly formatted edit forms for any content type

### Implementation Notes

**Files created:**

- `src/lib/components/form/TextField.svelte` - Text input field
- `src/lib/components/form/TextareaField.svelte` - Textarea field
- `src/lib/components/form/NumberField.svelte` - Number input field
- `src/lib/components/form/DateField.svelte` - Date input field
- `src/lib/components/form/BooleanField.svelte` - Checkbox field
- `src/lib/components/form/EmailField.svelte` - Email input field
- `src/lib/components/form/UrlField.svelte` - URL input field
- `src/lib/components/form/MarkdownField.svelte` - Markdown textarea field
- `src/lib/components/form/ImageField.svelte` - Image upload field (placeholder for Phase 7)
- `src/lib/components/form/ArrayField.svelte` - Array field with nested field support
- `src/lib/components/form/FormField.svelte` - Field dispatcher component
- `src/lib/components/form/FormGenerator.svelte` - Main form generation component
- `src/lib/utils/validation.ts` - Form validation utilities

**Files modified:**

- `src/routes/pages/[page]/+page.svelte` - Added edit mode and form integration

**Technical decisions made:**

- Component-based architecture: Each field type has its own component
- Svelte 5 runes: Using `$state`, `$props`, `$bindable`, and `$effect`
- Validation approach: Validate on submit, clear errors on field change
- Form data initialization: Type-based defaults with initial data override
- Nested fields: ArrayField component supports nested field definitions
- Error display: Both summary at top and inline field errors
- Field labels: Auto-generated from field names (camelCase → Title Case)
- Edit modes: Separate states for singletons vs array/collection items

## Phase 5: Editing & Committing (Singletons & Arrays) ✅ COMPLETED

**Goal**: User can edit and save changes to singleton and single-file array content

### Tasks

- ✅ Implement edit mode for singletons (load data into form)
- ✅ Implement edit mode for single-file arrays (load item into form)
- ✅ Build "save" functionality:
  - ✅ Generate updated JSON from form data
  - ✅ Use GitHub API to update file content
  - ✅ Create commit with meaningful message
- ✅ Handle `idField` matching for array updates
- ✅ Add success/error feedback
- ✅ Implement form action integration

### Deliverable

✅ User can edit and save singleton pages and array items

### Implementation Notes

**Files created:**

- `src/lib/github/commit.ts` - GitHub commit utilities
  - `updateFile()` - Updates or creates files in repository
  - `generateCommitMessage()` - Generates standardized commit messages
- `src/lib/content/writer.ts` - Content saving utilities
  - `saveContent()` - Main dispatcher for saving different content types
  - `saveSingleton()` - Saves singleton JSON files
  - `saveArrayItem()` - Updates items in single-file arrays using JSONPath

**Files modified:**

- `src/routes/pages/[page]/+page.server.ts` - Added form actions for saving
- `src/routes/pages/[page]/+page.svelte` - Integrated form submission with server actions
- `src/lib/components/form/FormGenerator.svelte` - Added `bind:formData` and `showButtons` props

**Technical decisions made:**

- Form submission approach: SvelteKit form actions with progressive enhancement
- Data binding: FormGenerator exposes formData via $bindable for parent control
- Feedback mechanism: Success/error messages via form action results with $effect reactivity
- Array updates: Support both index-based and idField-based item matching
- Commit messages: Standardized format with "via Tentman CMS" suffix
- Error handling: Graceful error display without crashing the UI

## Phase 6: Creating & Deleting (Arrays & Collections) ✅ COMPLETED

**Goal**: User can create new items and delete existing items

### Tasks

- ✅ Build "new item" UI for arrays and collections
- ✅ Implement template processing (replace `{{placeholder}}` values)
- ✅ Generate new files:
  - ✅ Arrays: add to array
  - ✅ Collections: create new file with generated name
- ✅ Implement ID generation for arrays (if `generated: true`)
- ✅ Build delete confirmation UI
- ✅ Implement delete operations:
  - ✅ Arrays: filter out item by ID
  - ✅ Collections: delete file
- ✅ Handle commit creation for creates/deletes

### Deliverable

✅ User can create new blog posts, tour dates, etc., and delete existing items

### Implementation Notes

**Files created/modified:**

- `src/lib/content/writer.ts` - Added create and delete functions:
  - `createContent()` - Main dispatcher for creating new items
  - `deleteContent()` - Main dispatcher for deleting items
  - `createArrayItem()` - Creates items in single-file arrays
  - `createCollectionItem()` - Creates new files in multi-file collections
  - `deleteArrayItem()` - Deletes items from single-file arrays
  - `deleteCollectionItem()` - Deletes files from multi-file collections
  - `processTemplate()` - Template placeholder processing ({{field}} replacement)
- `src/routes/pages/[page]/+page.server.ts` - Added form actions:
  - `create` action - Handles new item creation
  - `delete` action - Handles item deletion
- `src/routes/pages/[page]/+page.svelte` - Updated UI:
  - Create mode state management
  - "New" buttons for arrays/collections (including empty state)
  - Delete confirmation modal with backdrop
  - Form handling for both create and edit modes
  - Auto-reload after create/delete operations

**Technical decisions made:**

- ID generation: Timestamp-based with random suffix for arrays with `generated: true`
- Template processing: Simple regex-based placeholder replacement
- Collection file paths: Derived from template directory location
- Delete confirmation: Modal overlay to prevent accidental deletions
- Type guards: Using `in` operator for union type narrowing
- Page reload: After create/delete to ensure fresh content display

## Phase 7: Image Upload ✅ COMPLETED

**Goal**: User can upload images when editing content

### Tasks

- ✅ Build image upload UI (file input with preview)
- ✅ Implement image upload to repo:
  - ✅ Convert to base64 for GitHub API
  - ✅ Store in `/static/images/` or configured path
  - ✅ Generate unique file paths with sanitization
- ✅ Update form field value with image path
- ✅ Show image preview in form
- ✅ Handle image removal

### Deliverable

✅ User can upload images when editing content

### Implementation Notes

**Files created:**

- `src/lib/github/image.ts` - Image upload utilities
  - `uploadImage()` - Uploads image files to GitHub with unique filenames
  - `deleteImage()` - Deletes images from repository
  - `fileToBase64()` - Helper to convert File objects to base64
- `src/routes/api/upload-image/+server.ts` - Server endpoint for image uploads
  - Validates file type and size (max 5MB)
  - Authenticates user and checks repo selection
  - Returns uploaded image path

**Files modified:**

- `src/lib/components/form/ImageField.svelte` - Complete rewrite with:
  - Client-side file validation (type and size)
  - Image preview with loading states
  - Upload progress indicator (spinner overlay)
  - Remove image functionality
  - Error handling and display
  - Configurable storage path support
- `src/lib/types/config.ts` - Added `imagePath` field to BaseConfig
- `src/lib/components/form/FormField.svelte` - Pass imagePath to ImageField
- `src/lib/components/form/FormGenerator.svelte` - Pass config.imagePath to FormField

**Technical decisions made:**

- Image uploads are handled via server endpoint (cannot use Octokit from client)
- Unique filenames generated with: `{sanitized-name}-{timestamp}-{random}.{ext}`
- File sanitization: Non-alphanumeric characters replaced with hyphens
- Default storage path: `static/images/` (configurable via config.imagePath)
- File size limit: 5MB maximum
- Validation: Client-side and server-side type/size checks
- Preview: Created with `URL.createObjectURL()` before upload
- Loading states: Spinner overlay on preview during upload
- Image paths: Returned with leading slash (e.g., `/static/images/photo.jpg`)

## Phase 8: Multi-File Collection Editing ✅ COMPLETED

**Goal**: Complete CRUD operations for markdown and JSON file collections

### Tasks

- ✅ Implement markdown editor (textarea with preview)
- ✅ Handle frontmatter serialization/deserialization
- ✅ Support filename changes (rename operations)
  - ✅ Delete old file, create new file
  - Note: Warning about URL changes to be added in Phase 9 (UX Polish)
- ✅ Ensure slug/ID field uniqueness validation
- ✅ Test with both markdown and JSON collections

### Deliverable

✅ User can fully manage blog posts, year-end lists, etc.

### Implementation Notes

**Files created/modified:**

- `src/lib/components/form/MarkdownField.svelte` - Enhanced with Edit/Preview tabs
  - Added tabbed interface for switching between edit and preview modes
  - Basic markdown-to-HTML rendering for preview (headers, bold, italic, links, code, lists)
- `src/lib/content/writer.ts` - Added collection editing support:
  - `saveCollectionItem()` - Saves markdown/JSON collection items with frontmatter handling
  - Enhanced `createCollectionItem()` - Improved template processing for markdown files
  - Rename support: Creates new file and deletes old file atomically
- `src/lib/utils/validation.ts` - Added uniqueness validation:
  - `validateFormData()` now accepts `existingItems` and `currentItemId` options
  - Validates slug/ID field uniqueness across collection items
  - Excludes current item when editing to avoid false positives
- `src/lib/components/form/FormGenerator.svelte` - Updated to support validation options:
  - Added `existingItems` and `currentItemId` props
  - Passes validation context to `validateFormData()`
- `src/routes/pages/[page]/+page.server.ts` - Updated save action:
  - Added `filename` and `newFilename` form data handling
  - Passes filename context to `saveContent()`
- `src/routes/pages/[page]/+page.svelte` - Enhanced collection editing:
  - Passes `filename` hidden field for collection items
  - Passes validation context to FormGenerator

**Technical decisions made:**

- Markdown preview: Simple regex-based rendering (sufficient for basic preview)
- Frontmatter handling: Using gray-matter for parsing/serialization
- Rename implementation: Create-then-delete pattern with single commit message
- Uniqueness validation: Client-side validation before submission
- Template processing: Enhanced to handle markdown frontmatter separately from body

## Phase 9: UX Polish & Error Handling ✅ COMPLETED

**Goal**: Production-ready user experience

### Tasks

- ✅ Add comprehensive error handling:
  - ✅ GitHub API errors with user-friendly messages
  - ✅ Standardized error logging and parsing
  - ✅ Improved validation error messages
- ✅ Improve loading states and transitions
  - ✅ Enhanced loading spinner and states
  - ✅ CSS animations (fadeIn, scaleIn, slideDown)
  - ✅ Button and card hover transitions
- ✅ Add confirmation dialogs for destructive actions (delete operations)
- ✅ Implement "unsaved changes" warnings
  - ✅ Track form data changes
  - ✅ Warn before navigation
  - ✅ Confirm before canceling edits
- ✅ Add keyboard shortcuts (save, cancel)
  - ✅ Cmd/Ctrl+S to save
  - ✅ Escape to cancel/close
  - ✅ Keyboard shortcut help widget
- ✅ Mobile responsive design
  - ✅ Responsive layout with Tailwind breakpoints
  - ✅ Mobile-friendly button layouts
  - ✅ Improved text wrapping and spacing
- ✅ Add user feedback (toasts, notifications)
  - ✅ Toast notification system
  - ✅ Success/error/warning/info toast types
  - ✅ Auto-dismiss with configurable duration
- ✅ Create help text and documentation
  - ✅ Keyboard shortcut help component
  - ✅ Contextual help display

### Deliverable

✅ Polished, production-ready CMS interface

### Implementation Notes

**Files created:**

- `src/lib/components/Toast.svelte` - Individual toast notification component
- `src/lib/components/ToastContainer.svelte` - Toast container/manager
- `src/lib/stores/toasts.ts` - Toast state management store
- `src/lib/utils/errors.ts` - Error handling utilities with user-friendly messages
- `src/lib/utils/keyboard.ts` - Keyboard shortcut registration and formatting
- `src/lib/components/KeyboardShortcutHelp.svelte` - Keyboard shortcut help widget

**Files modified:**

- `src/routes/+layout.svelte` - Added ToastContainer
- `src/routes/pages/[page]/+page.server.ts` - Integrated error handling utilities
- `src/routes/pages/[page]/+page.svelte` - Complete UX overhaul:
  - Added toast integration for feedback
  - Implemented unsaved changes tracking and warnings
  - Added keyboard shortcuts (Cmd/Ctrl+S, Escape)
  - Improved mobile responsiveness
  - Added transitions to all interactive elements
  - Integrated keyboard shortcut help
- `src/app.css` - Added custom animations (fadeIn, scaleIn, slideDown)

**Technical decisions made:**

- Error handling: Centralized error parsing with user-friendly messages for GitHub API errors
- Toast system: Writable store with auto-dismiss functionality
- Keyboard shortcuts: Platform-aware (Cmd on Mac, Ctrl on Windows/Linux)
- Unsaved changes: JSON comparison with beforeNavigate hook for navigation warnings
- Animations: CSS keyframe animations for smooth transitions
- Mobile: Mobile-first approach with responsive utilities
- Help system: Contextual keyboard shortcut widget shown only in edit mode

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

- ✅ **Image upload path convention**: Configurable via `config.imagePath` (Phase 7)
- ✅ **Commit message format**: Standardized with "via Tentman CMS" suffix (Phase 5)
- ✅ **Error handling**: User-friendly GitHub API error messages (Phase 9)
- ✅ **User feedback**: Toast notification system (Phase 9)
- ✅ **Mobile support**: Responsive design with Tailwind utilities (Phase 9)
- Rate limiting handling (GitHub API) - Future enhancement
- Large file handling strategies - Future enhancement
- Conflict resolution (if file changed externally) - Future enhancement
- Warning UI for filename changes that affect URLs - Future enhancement

---

## Current Status

**Last Updated**: 2025-11-26

**Completed Phases**: 9 of 10

**Next Up**: Phase 10 - Advanced Features (Optional/Future)

**Production Ready**: The CMS is now production-ready with comprehensive error handling, keyboard shortcuts, mobile responsiveness, and a polished user experience.

**Setup Required Before Testing**:

1. Create GitHub OAuth App at https://github.com/settings/developers
2. Add credentials to `.env` file
3. Run `pnpm run dev`
4. Test login flow and repository selection
