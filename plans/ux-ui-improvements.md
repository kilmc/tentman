# Tentman UX/UI Improvement Plan

## Objective
Enhance user experience and visual polish of Tentman CMS by tackling low-hanging fruit improvements and adding additional TODOs to the roadmap.

## Priority Focus
- Polish existing UX/UI (not new features)
- Quick wins that provide immediate value
- Better visual feedback for user actions
- Improved markdown editing experience

---

## New TODOs to Add

### Low-Hanging Fruit (1-4 hours each)

1. **Enhanced Markdown Preview Styling**
   - Install @tailwindcss/typography plugin
   - Use proper markdown parser (svelte-markdown)
   - Apply prose classes for professional typography

2. **Toast Notification Improvements**
   - Add slide-in animations
   - Increase visibility and duration
   - Add action buttons support
   - Stack multiple toasts properly

3. **Button Hover States & Micro-interactions**
   - Add scale transforms on hover
   - Add shadow transitions
   - Ensure consistent button styling across app

4. **Loading State Consistency**
   - Create reusable LoadingSpinner component
   - Add "Saving..." inline indicators
   - Consistent disabled state styling

5. **Empty State Icons & Copy**
   - Add friendly empty state messaging
   - Add SVG icons or emoji
   - Clear CTAs for each empty state

### Medium Effort (5-8 hours each)

6. **Skeleton Loading Screens**
   - Create skeleton components for ItemCard
   - Animate skeleton pulse
   - Replace spinner with skeleton on list pages

7. **Enhanced Delete UX with Preview**
   - Show item preview in delete confirmation
   - Add to draft changes section immediately
   - Allow "undo delete" before publish

8. **Form Validation Improvements**
   - Add real-time validation feedback
   - Add character counters for text fields
   - Improve error message clarity

9. **Image Upload Progress**
   - Add progress bar during upload
   - Show file size and upload speed
   - Add preview thumbnail immediately

### High Effort (8+ hours each)

10. **Draft Change Management System**
    - Add ability to discard individual changes
    - Add change history/timeline view
    - Better conflict resolution UI

---

## Recommended Low-Hanging Fruit (First Wave)

### 1. Enhanced Markdown Preview Styling ⭐ HIGHEST PRIORITY

**Current Issue**: Markdown preview uses basic regex replacement and has poor typography

**Solution**:
- Install `svelte-markdown` (Svelte-native, uses `marked` internally, SSR-safe)
- Install `@tailwindcss/typography` for prose styling
- Replace current regex-based preview with Svelte component
- Apply prose classes to preview container

**Why svelte-markdown?**
- Designed specifically for Svelte
- Uses battle-tested `marked` parser internally
- Avoids unsafe `@html` directive (renders to Svelte components)
- SSR-safe out of the box
- Simple to use for preview rendering

**Implementation**:
```bash
pnpm add svelte-markdown @tailwindcss/typography
```

**Files to Modify**:
- `src/lib/components/form/MarkdownField.svelte` - Replace with SvelteMarkdown component
- `package.json` - Add dependencies
- `tailwind.config.ts` - Add typography plugin

**Code Changes**:
```typescript
// In MarkdownField.svelte
import SvelteMarkdown from 'svelte-markdown';

// In template - replace preview div
<div class="prose prose-sm max-w-none dark:prose-invert">
  {#if value}
    <SvelteMarkdown source={value} />
  {:else}
    <p class="text-gray-400 italic">Nothing to preview</p>
  {/if}
</div>
```

**Benefits**:
- Professional markdown rendering with proper typography
- SSR-safe (important for SvelteKit)
- Better security (no @html)
- Supports GitHub Flavored Markdown

---

### 2. Improved Toast Notifications ⭐ HIGH PRIORITY

**Current Issue**: Toasts are small, fade quickly, lack visual prominence

**Solution**:
- Add slide-in animation from right edge
- Increase size and visibility
- Add optional action buttons
- Support toast stacking

**Files to Modify**:
- `src/lib/components/Toast.svelte` - Add animations, action buttons
- `src/lib/stores/toasts.ts` - Add action support to interface
- `src/app.css` - Add slide-in animation keyframes

**Code Changes**:
```typescript
// In toasts.ts - add action support
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  action?: {
    label: string;
    callback: () => void;
  };
}

// In Toast.svelte - add animation
<div
  class="animate-slideInRight shadow-lg ..."
  style="animation: slideInRight 0.3s ease-out">
  <!-- toast content -->
  {#if action}
    <button onclick={action.callback} class="...">
      {action.label}
    </button>
  {/if}
</div>

// In app.css
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

**Benefits**: Users won't miss important feedback, better engagement

---

### 3. Skeleton Loading Screens ⭐ HIGH PRIORITY

**Current Issue**: Generic spinner doesn't show structure, feels slow

**Solution**:
- Create ItemCardSkeleton component matching ItemCard layout
- Replace loading spinner with skeleton grid
- Add pulse animation

**Files to Modify**:
- `src/lib/components/ItemCardSkeleton.svelte` - NEW FILE
- `src/routes/pages/[page]/+page.svelte` - Replace spinner with skeleton grid
- `src/routes/pages/[page]/[itemId]/edit/+page.svelte` - Add form skeleton (optional)

**Code Changes**:
```typescript
// New file: ItemCardSkeleton.svelte
<div class="block rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
  <div class="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div class="h-4 bg-gray-200 rounded w-1/2 mb-1"></div>
  <div class="h-4 bg-gray-200 rounded w-2/3"></div>
</div>

// In [page]/+page.svelte
{#if content === null}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each Array(6) as _}
      <ItemCardSkeleton />
    {/each}
  </div>
{:else}
  <!-- Actual content -->
{/if}
```

**Benefits**: Perceived performance improvement, shows content structure while loading

---

### 4. Button Consistency & Hover States (OPTIONAL - NOT PRIORITY)

**Current Issue**: Button styles vary across pages, hover states are inconsistent

**Note**: User indicated this is not a priority. Can revisit later if time permits.

---

### 5. Enhanced Delete Confirmation with Preview

**Current Issue**: Delete confirmation is generic, doesn't show what's being deleted, and deleted items don't appear in draft changes section

**Solution**:
- Show item preview in delete confirmation modal
- Display primary/secondary fields from ItemCard
- Add explanatory text about draft staging
- Consider adding immediate visual feedback in draft changes section

**Files to Modify**:
- `src/routes/pages/[page]/[itemId]/edit/+page.svelte` - Enhance delete modal with item preview
- Potentially `src/routes/pages/[page]/+page.svelte` - Show deleted items in draft section

**Code Changes**:
```typescript
// In [itemId]/edit/+page.svelte delete confirmation
<div class="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
  <h4 class="text-sm font-medium text-gray-700 mb-2">You are deleting:</h4>
  <div class="space-y-1">
    {#each Object.entries(cardFields.primary) as [fieldName, fieldDef]}
      <p class="font-semibold text-lg">{item[fieldName]}</p>
    {/each}
    {#each Object.entries(cardFields.secondary) as [fieldName, fieldDef]}
      <p class="text-sm text-gray-600">
        {getFieldLabel(fieldName, fieldDef)}: {formatFieldValue(item[fieldName])}
      </p>
    {/each}
  </div>
</div>
<p class="text-sm text-gray-600 mb-6">
  This will be staged as a draft change. You can review it on the
  <a href="/pages/{params.page}" class="text-blue-600 hover:underline">
    {config.label}
  </a> page before publishing.
</p>
```

**Benefits**: Users see exactly what they're deleting, reduces errors, clearer workflow

---

## Implementation Order (User Selected)

### Step 1: Update TODOS.md ✅ COMPLETE FIRST
- Add all new TODOs identified in this plan
- Categorize by effort level (Low/Medium/High)
- Keep existing TODOs and mark any that overlap

### Step 2: Enhanced Markdown Preview Styling ⭐ ✅ COMPLETED
- ✅ Installed `@humanspeak/svelte-markdown` (Svelte 5 compatible) and `@tailwindcss/typography` packages
- ✅ Updated MarkdownField.svelte to use SvelteMarkdown component with prose classes
- ✅ Configured Tailwind typography plugin using `@plugin` directive in app.css (Tailwind v4)
- ✅ Added "Content" markdown field to Blog Posts example for testing
- **Note**: Used `@humanspeak/svelte-markdown` instead of `svelte-markdown` due to Svelte 5 compatibility

### Step 3: Better Toast Notifications ⭐ ✅ COMPLETED
- ✅ Added slide-in and slide-out animations (slideInRight, slideOutRight)
- ✅ Added ToastAction interface and action button support throughout the stack
- ✅ Fixed bug where convenience methods (success, error, etc.) created new store instances
- ✅ Increased toast size (min-w-80, max-w-md) and visibility (border-2, shadow-2xl)
- ✅ Improved styling with better contrast, spacing, and typography
- ✅ Updated ToastContainer to pass action prop and increase gap between stacked toasts
- **Files Modified**:
  - `src/lib/stores/toasts.ts` - Added ToastAction interface, fixed store methods
  - `src/app.css` - Added slideInRight/slideOutRight keyframes and utility classes
  - `src/lib/components/Toast.svelte` - Added animations, action button, improved styling
  - `src/lib/components/ToastContainer.svelte` - Added action prop passing

### Step 4: Skeleton Loading Screens ⭐ ✅ COMPLETED
- ✅ Created ItemCardSkeleton component matching ItemCard structure
- ✅ Added pulse animation using Tailwind's built-in animate-pulse utility
- ✅ Updated pages/[page]/+page.svelte to replace spinner with skeleton grid
- ✅ Skeleton shows 6 placeholder cards in space-y-4 layout
- ✅ Includes optional badge placeholder for draft items
- **Files Modified**:
  - `src/lib/components/ItemCardSkeleton.svelte` - NEW FILE - Skeleton component with pulse animation
  - `src/routes/pages/[page]/+page.svelte` - Replaced loading spinner with skeleton cards

### Step 5: Enhanced Delete Confirmation ⭐ ✅ COMPLETED
- ✅ Updated delete modal to show item preview in a highlighted red box
- ✅ Display primary/secondary fields matching ItemCard layout
- ✅ Added explanatory text about draft staging with link to page
- ✅ Improved modal styling (max-w-lg, better colors, transition-colors)
- ✅ Enhanced button text clarity ("Delete Item" instead of just "Delete")
- **Files Modified**:
  - `src/routes/pages/[page]/[itemId]/edit/+page.svelte` - Added formatFieldValue(), getCardFields(), enhanced delete modal UI

### Step 6: Loading State Consistency ⭐ ✅ COMPLETED
- ✅ Created reusable LoadingSpinner component with size and variant props
- ✅ Replaced inline spinners in edit pages with LoadingSpinner component
- ✅ Replaced inline spinner in ImageField upload overlay with LoadingSpinner
- ✅ Standardized spinner sizes (sm: 4x4, md: 8x8, lg: 12x12) and colors (primary, white, gray)
- ✅ Button disabled states already consistent across the app (disabled:bg-gray-400, disabled:cursor-not-allowed)
- **Files Modified**:
  - `src/lib/components/LoadingSpinner.svelte` - NEW FILE - Reusable spinner with props for size, variant, label, inline
  - `src/routes/pages/[page]/[itemId]/edit/+page.svelte` - Import and use LoadingSpinner for content loading
  - `src/routes/pages/[page]/edit/+page.svelte` - Import and use LoadingSpinner for content loading
  - `src/lib/components/form/ImageField.svelte` - Import and use LoadingSpinner for upload overlay

### Step 7: Empty State Icons & Copy ⭐ ✅ COMPLETED
- ✅ Added SVG document icon to empty content items list state
- ✅ Improved messaging with heading, description, and clear CTA
- ✅ Enhanced button with plus icon for visual clarity
- ✅ Updated ArrayField empty state with dashed border and icon
- ✅ Improved singleton array field empty state display
- ✅ Consistent friendly messaging across all empty states
- **Files Modified**:
  - `src/routes/pages/[page]/+page.svelte` - Enhanced empty state for content items (lines 393-413) and singleton array display (lines 285-288)
  - `src/lib/components/form/ArrayField.svelte` - Improved empty state with icon and better messaging (lines 61-70)
- **Empty States Improved**:
  - Content items list: Large centered card with document icon, heading, description, and CTA button
  - Array fields: Dashed border box with plus icon and helpful messaging
  - Singleton array display: Dashed border with "No items in this list" message
  - Pages list: Already had good messaging (yellow banner) - no changes needed

### Step 8: Form Validation Improvements ⭐ ✅ COMPLETED
- ✅ Added minLength and maxLength properties to FieldOptions and FieldArrayItem interfaces
- ✅ Implemented length validation in validation utility for text/textarea/markdown/email/url fields
- ✅ Added character counters to TextField, TextareaField, and MarkdownField components
- ✅ Character counters show current/max count and turn red when over limit
- ✅ Input borders turn red when validation fails (over max or under min)
- ✅ Added realtimeValidation prop to FormGenerator for live validation feedback
- ✅ Real-time validation only shows errors for "touched" (interacted with) fields
- ✅ Enhanced error summary box with icon, better colors, and shadow
- ✅ Enhanced inline field errors with warning icon and font-medium styling
- ✅ Fixed accessibility warnings by adding proper for/id attributes to labels and inputs
- ✅ Updated Blog Posts example config with validation constraints for testing
- **Files Modified**:
  - `src/lib/types/config.ts` - Added minLength/maxLength to FieldOptions and FieldArrayItem
  - `src/lib/utils/validation.ts` - Added length validation logic
  - `src/lib/components/form/TextField.svelte` - Character counter, validation styling, accessibility
  - `src/lib/components/form/TextareaField.svelte` - Character counter, validation styling, accessibility
  - `src/lib/components/form/MarkdownField.svelte` - Character counter, validation styling
  - `src/lib/components/form/FormField.svelte` - Pass minLength/maxLength props to field components
  - `src/lib/components/form/FormGenerator.svelte` - Real-time validation, enhanced error display
  - `src/lib/examples/posts.tentman.json` - Added validation constraints for testing

### Step 9: Image Upload Progress ⭐ ✅ COMPLETED
- ✅ Replaced fetch() with XMLHttpRequest for upload progress tracking
- ✅ Added state management for progress (0-100%), file size, upload speed, and uploaded bytes
- ✅ Implemented real-time progress bar with smooth transitions
- ✅ Added file size display showing uploaded/total bytes in human-readable format
- ✅ Implemented upload speed calculation and display (bytes/second)
- ✅ Preview thumbnail already working (immediate ObjectURL creation)
- ✅ Enhanced UI layout to accommodate progress information
- ✅ Added helper functions formatBytes() and formatSpeed() for readable display
- **Files Modified**:
  - `src/lib/components/form/ImageField.svelte` - Complete rewrite of upload logic with XMLHttpRequest, progress tracking, and enhanced UI

**Total Estimated Time: 13-17 hours (low-hanging fruit) + 5-8 hours (medium effort) = 18-25 hours**
**Completed: ~24-28 hours** (All priority low-hanging fruit + Form Validation + Image Upload Progress complete!)
**Remaining: 8+ hours for Draft Change Management** ✅ IMAGE UPLOAD PROGRESS COMPLETE!

---

## Critical Files Reference

**Component Files**:
- `src/lib/components/form/MarkdownField.svelte` - Markdown editor with preview
- `src/lib/components/Toast.svelte` - Toast notification component
- `src/lib/components/ItemCard.svelte` - Content item display card
- `src/lib/components/ItemCardSkeleton.svelte` - Skeleton loading component
- `src/lib/components/LoadingSpinner.svelte` - Reusable loading spinner
- `src/lib/stores/toasts.ts` - Toast state management

**Route Files**:
- `src/routes/pages/[page]/+page.svelte` - Content list view with draft changes
- `src/routes/pages/[page]/[itemId]/edit/+page.svelte` - Edit form with delete
- `src/routes/publish/+page.svelte` - Publish draft changes view

**Config Files**:
- `package.json` - Dependencies
- `tailwind.config.ts` - Tailwind configuration
- `src/app.css` - Global styles and animations

---

## Success Criteria

After implementing low-hanging fruit, validation improvements, and image upload progress:
- ✅ Markdown preview looks professional with proper typography
- ✅ Toast notifications are visible and provide clear feedback
- ✅ Loading states show content structure (skeletons) instead of spinners
- ✅ Delete confirmations show exactly what's being removed with item preview
- ✅ Loading spinners are consistent across the app with reusable component
- ✅ Button disabled states are consistent and provide clear visual feedback
- ✅ Empty states have friendly icons, clear messaging, and helpful CTAs
- ✅ Form validation provides real-time feedback with character counters
- ✅ Validation errors are clear, prominent, and easy to understand
- ✅ Users can see character limits before submitting forms
- ✅ Image uploads show real-time progress with file size and upload speed
- ✅ Users can monitor upload progress with visual progress bar
- ✅ Upload feedback is clear and informative
- ✅ Overall UI feels more polished and responsive to user actions

**ALL SUCCESS CRITERIA MET! 🎉**

---

## Research Notes

**Markdown Parser Selection**:
- Chose `svelte-markdown` over raw `marked` or `markdown-it`
- Rationale: Svelte-native, SSR-safe, uses proven `marked` internally
- Avoids unsafe `@html` directive
- Sources:
  - [svelte-markdown on npm](https://www.npmjs.com/package/svelte-markdown)
  - [Parse markdown inside a svelte component - Stack Overflow](https://stackoverflow.com/questions/60857589/parse-markdown-inside-a-svelte-component)

**Tailwind Typography**:
- @tailwindcss/typography confirmed as best-in-class for prose styling
- Works seamlessly with SvelteKit
- No compatibility concerns
