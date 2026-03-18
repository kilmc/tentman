## UX Improvements - Low-Hanging Fruit (1-4 hours each)

- [COMPLETED] **Enhanced Markdown Preview Styling** - Use svelte-markdown + @tailwindcss/typography for professional rendering with proper typography
- **Toast Notification Improvements** - Add slide-in animations, increase visibility/duration, add action buttons support, stack multiple toasts
- **Loading State Consistency** - Create reusable LoadingSpinner component, add "Saving..." inline indicators, consistent disabled state styling
- **Empty State Icons & Copy** - Add friendly empty state messaging with SVG icons/emoji and clear CTAs

## UX Improvements - Medium Effort (5-8 hours each)

- **Skeleton Loading Screens** - Create skeleton components for ItemCard, animate skeleton pulse, replace spinner with skeleton on list pages
- **Enhanced Delete UX with Preview** - Show item preview in delete confirmation modal, add to draft changes section immediately with clear visual feedback
- **Store Form State in Preview Flow** - Use Svelte stores to preserve form data when navigating to preview, allow navigation back to edit, clear store after successful save
- **Better Diff Representation** - GitHub-style diffs with green additions and red removals, integrate diff library (diff2html), add expand/collapse for large files
- **Form Validation Improvements** - Add real-time validation feedback, character counters for text fields, improve error message clarity
- **Image Upload Progress** - Add progress bar during upload, show file size and upload speed, add preview thumbnail immediately
- **Create Tentman Settings UI** - Settings section for config.tentman.json editing, Netlify preview URL configuration, theme color customization

## UX Improvements - High Effort (8+ hours each)

- **Draft Change Management System** - Add ability to discard individual changes, add change history/timeline view, better conflict resolution UI
- **Rich Markdown Editor** - Replace basic textarea with proper editor using marked.js or markdown-it, add toolbar for formatting shortcuts, add side-by-side live preview, support image drag-and-drop

## Before Launch

- Adjust the codebase to do as little compute as possible on Netlify's side to save me money in hosting this project
- Security audit to ensure we are not doing anything dangerous for the user or ourselves.

## Future Features

- Config-based theming. Add colors to have the different repos look a little different while you're editing.
- Logged out Homepage that walks you through the functionality of the project
- Add content grouping to put content, nav, header and footer or other things in logical sections.
- Rich text editor that writes to markdown
