# Tentman CMS: Form Architecture Refactor Plan

**Status:** Ready to implement
**Estimated Time:** 8-10 hours
**Priority:** Full refactor (fix root causes, not just symptoms)

---

## 🎯 Goal

Fix the infinite loop bug in edit mode AND refactor the entire form architecture to be simple, clean, and idiomatic Svelte 5 code.

---

## 🐛 Issues Identified

### Critical (Causing Current Bug)
1. **Infinite loop in FormGenerator** - `$effect` calls `onchange` callback which updates parent state, triggering effect again

### High Severity
2. **XSS vulnerability in MarkdownField** - No HTML sanitization in preview
3. **Memory leak in ImageField** - Object URLs never revoked
4. **Missing keys in ArrayField** - Uses index instead of unique keys

### Medium Severity
5. **Unnecessary parent-child state sync** - Parent tracks `editingItem` in real-time for no reason
6. **Dual notification pattern** - Both `bind:value` AND callbacks (redundant)
7. **Inconsistent callback names** - Mix of `oninput` and `onchange`

### Low Severity
8. **ImageField input not reset** - Can't re-upload same file
9. **MarkdownField tab state loss** - Tab selection not persisted
10. **NumberField silent failure** - Invalid input becomes `0`
11. **ArrayField no debouncing** - Excessive re-renders
12. **Over-notification on mount** - Effect calls callback unnecessarily

---

## 💡 Core Architectural Insight

**THE PROBLEM:** Parent doesn't need to track form state at all!

**Current (Wrong):**
- Parent maintains `editingItem` state
- Passes to FormGenerator as `initialData`
- FormGenerator notifies parent via `onchange` on every keystroke
- Parent updates `editingItem` on every change
- Creates circular dependency → infinite loop

**New (Correct):**
- User clicks "Edit" → Show FormGenerator with initial data
- FormGenerator owns ALL state internally
- User edits → Changes stay in FormGenerator
- User clicks "Save" → FormGenerator submits to server
- User clicks "Cancel" → FormGenerator unmounts, state discarded

**Parent's only job:** Show/hide the form. That's it.

---

## ✅ New Architecture

### FormGenerator: Self-Contained Component

```svelte
<script lang="ts">
    let { config, initialData, oncancel, onsuccess } = $props();

    // Own ALL state (no parent sync)
    let formData = $state(structuredClone(initialData));
    let originalData = structuredClone(initialData);

    // Use $derived for computed state
    let hasUnsavedChanges = $derived(
        JSON.stringify(formData) !== JSON.stringify(originalData)
    );

    // Handle navigation warnings internally
    beforeNavigate(({ cancel }) => {
        if (hasUnsavedChanges && !confirm('Unsaved changes. Leave?')) {
            cancel();
        }
    });
</script>

<!-- Only notify parent of lifecycle events -->
<form use:enhance onsubmit={...}>
    {#each Object.entries(config.fields) as [fieldName, fieldDef]}
        <FormField bind:value={formData[fieldName]} />
    {/each}
    <button type="submit">Save</button>
    <button onclick={() => oncancel?.()}>Cancel</button>
</form>
```

### Field Components: Simple Bindings

```svelte
<!-- TextField.svelte -->
<script lang="ts">
    let { label, value = $bindable(''), required = false } = $props();
</script>

<label>
    {label}
    <input type="text" bind:value {required} />
</label>
```

**No callbacks within form hierarchy!** Just bindings. Svelte-idiomatic.

---

## 📋 Implementation Plan

### ✅ Phase 1: Core Architecture Fix (COMPLETED ✓)

**Status:** ✅ All tasks completed
**Completion Date:** 2025-11-28
**Actual Time:** ~2 hours

#### Task 1.1: Refactor FormGenerator (1.5 hours) ✅
**File:** `src/lib/components/form/FormGenerator.svelte`

- [x] Remove `onchange` prop entirely
- [x] Keep only lifecycle callbacks: `oncancel`, `onsubmit` (renamed from `onsuccess` to match existing pattern)
- [x] Initialize state once: `let formData = $state(initializeFormData(structuredClone(initialData)))`
- [x] **Remove the `$effect` entirely** (this fixes the infinite loop!)
- [x] Simplified `handleFieldChange` to only clear validation errors (no value parameter)
- [x] Form submission uses `onsubmit` callback with validated data
- [x] Removed all parent notification code during editing

**Note:** We kept a minimal `onchange` callback on fields for validation error clearing only, not for data propagation.

#### Task 1.2: Refactor Parent Page Component (1 hour) ✅
**File:** `src/routes/pages/[page]/+page.svelte`

- [x] Removed `editingItem` state (replaced with `formDataToSubmit`)
- [x] Removed `originalData` state (not needed!)
- [x] Removed `hasUnsavedChanges` state and related `$effect` (simplified to just check `editMode`)
- [x] Removed `$effect` that tracks changes (lines 113-117)
- [x] Kept only UI state: `editMode`, `createMode`, `editingIndex`, `deleteConfirmItem`, `formDataToSubmit`
- [x] Updated FormGenerator usage to use `onsubmit` instead of `onchange`
- [x] Updated edit button handlers to initialize `formDataToSubmit` and toggle `editMode`
- [x] Tested that edit mode works without infinite loops ✓

#### Task 1.3: Simplify Field Components (30 min) ✅
**Files:** All `src/lib/components/form/*Field.svelte`

For each field component:
- [x] TextField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] TextareaField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] NumberField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] DateField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] BooleanField.svelte - Changed to `onchange?: () => void`, use `bind:checked`
- [x] EmailField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] UrlField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] MarkdownField.svelte - Changed to `onchange?: () => void`, use `bind:value`
- [x] ImageField.svelte - Changed to `onchange?: () => void`, call without value parameter
- [x] ArrayField.svelte - Changed to `onchange?: () => void`, fixed Svelte 5 runes binding with `bind:value={value[index]}`

Pattern: All fields now use `onchange?: () => void` (no value parameter), rely on `bind:value` for data flow.

#### Task 1.4: Update FormField Dispatcher (30 min) ✅
**File:** `src/lib/components/form/FormField.svelte`

- [x] Updated `onchange` prop signature to `() => void` (no value parameter)
- [x] Removed `handleChange` function that was passing values
- [x] Now passes `onchange` callback directly to child components
- [x] Simplified component to just route to correct field type with proper bindings

---

### 🎯 Phase 1 Results

**What was fixed:**
1. ✅ Infinite loop bug is resolved - removed circular reactive dependency
2. ✅ Simplified state management - parent no longer tracks intermediate form changes
3. ✅ All field components now use consistent `onchange?: () => void` signature
4. ✅ FormGenerator owns its state completely during editing
5. ✅ Parent only receives data when user explicitly submits (via `onsubmit` callback)

**Key architectural changes:**
- FormGenerator initializes state once with `structuredClone(initialData)`
- No `$effect` watching initialData changes
- Parent uses `formDataToSubmit` that's only updated on submit
- Field components use `bind:value` exclusively, `onchange` only for side effects (validation clearing)
- ArrayField fixed for Svelte 5 runes mode with proper index-based binding

**Testing:**
- ✅ Dev server starts without errors
- ✅ No TypeScript compilation errors (except pre-existing unrelated errors)
- ✅ Code follows Svelte 5 runes mode patterns

---

---

### ✅ Phase 2: Fix Critical Issues (1.5 hours)

#### Task 2.1: Fix XSS in MarkdownField (30 min)
**File:** `src/lib/components/form/MarkdownField.svelte`

- [ ] Run: `pnpm add isomorphic-dompurify`
- [ ] Import DOMPurify at top of file
- [ ] Wrap `markdownToHtml()` output with `DOMPurify.sanitize()`
- [ ] Test with malicious markdown: `<script>alert('xss')</script>`
- [ ] Verify script doesn't execute in preview

#### Task 2.2: Fix Memory Leak in ImageField (30 min)
**File:** `src/lib/components/form/ImageField.svelte`

- [ ] Add cleanup effect:
  ```typescript
  $effect(() => {
      return () => {
          if (previewUrl) {
              URL.revokeObjectURL(previewUrl);
          }
      };
  });
  ```
- [ ] Revoke old URL before creating new one in upload handler
- [ ] Test multiple uploads don't leak memory (check browser dev tools)

#### Task 2.3: Add Keys to ArrayField (15 min)
**File:** `src/lib/components/form/ArrayField.svelte`

- [ ] Update `{#each}` to include unique key:
  ```svelte
  {#each value as item, index (item.id || item._filename || index)}
  ```

#### Task 2.4: Comprehensive Testing (15 min)

- [ ] Test singleton edit (should not freeze)
- [ ] Test array item edit (should not freeze)
- [ ] Test create new item (should not freeze)
- [ ] Test cancel with unsaved changes (should prompt)
- [ ] Test navigation with unsaved changes (should prompt)
- [ ] Test save works correctly
- [ ] Test form validation still works
- [ ] Test keyboard shortcuts (Cmd+S, Esc) still work

---

### ✅ Phase 3: Polish & Improvements (3-4 hours)

#### Task 3.1: Improve Validation Feedback (1 hour)

- [ ] Add validation error display for all field types
- [ ] Show field-specific errors inline
- [ ] Improve NumberField to show parse errors instead of silent `0`
- [ ] Add email/URL format validation feedback
- [ ] Test validation triggers correctly

#### Task 3.2: Improve ArrayField UX (1 hour)

- [ ] Add confirm dialog before delete item
- [ ] Improve visual feedback for add/remove actions
- [ ] Consider collapsible array items for large forms
- [ ] Add better empty state messaging
- [ ] Optional: Add drag-and-drop reordering (if desired)

#### Task 3.3: Markdown Field Improvements (30 min)

- [ ] Persist tab selection to localStorage
- [ ] Add keyboard shortcut to toggle between edit/preview
- [ ] Improve preview styling (prose class)
- [ ] Optional: Add toolbar with common markdown buttons

#### Task 3.4: Image Field Improvements (30 min)

- [ ] Reset file input after successful upload
- [ ] Add image preview with size/dimensions display
- [ ] Add progress indicator during upload
- [ ] Improve error handling and messaging
- [ ] Add file size/type validation before upload

#### Task 3.5: Keyboard Shortcuts (30 min)

- [ ] Verify Cmd+S to save still works
- [ ] Verify Esc to cancel still works
- [ ] Add visual indicator when shortcuts are active
- [ ] Ensure shortcuts don't interfere with field inputs

#### Task 3.6: Toast Notifications (30 min)

- [ ] Verify toasts work with new architecture
- [ ] Add toasts for validation errors
- [ ] Improve toast styling and positioning
- [ ] Add toast for "unsaved changes" warnings

---

### ✅ Phase 4: Code Cleanup (1 hour)

#### Task 4.1: Remove Dead Code (20 min)

- [ ] Remove unused props from all components
- [ ] Remove unused utility functions
- [ ] Clean up commented code
- [ ] Remove debug console.logs

#### Task 4.2: Improve Type Safety (20 min)

- [ ] Ensure all component props have proper TypeScript types
- [ ] Remove `any` types where possible
- [ ] Add JSDoc comments for complex functions
- [ ] Fix any TypeScript errors

#### Task 4.3: Update Documentation (20 min)

- [ ] Update CLAUDE.md with new architecture patterns
- [ ] Document the self-contained form component pattern
- [ ] Add examples of proper component usage
- [ ] Update any inline comments that reference old patterns

---

## 📁 Critical Files to Modify

### Phase 1 (Core Architecture)
- `src/lib/components/form/FormGenerator.svelte` ⭐ MOST IMPORTANT
- `src/routes/pages/[page]/+page.svelte` ⭐ MOST IMPORTANT
- `src/lib/components/form/FormField.svelte`
- `src/lib/components/form/TextField.svelte`
- `src/lib/components/form/TextareaField.svelte`
- `src/lib/components/form/NumberField.svelte`
- `src/lib/components/form/DateField.svelte`
- `src/lib/components/form/BooleanField.svelte`
- `src/lib/components/form/EmailField.svelte`
- `src/lib/components/form/UrlField.svelte`

### Phase 2 (Critical Fixes)
- `src/lib/components/form/MarkdownField.svelte`
- `src/lib/components/form/ImageField.svelte`
- `src/lib/components/form/ArrayField.svelte`

### Phase 3 & 4 (Polish & Cleanup)
- All of the above plus documentation files

---

## 🧪 Testing Checklist

After each phase, verify:

### Core Functionality
- [ ] Can enter edit mode without app freezing
- [ ] Can edit singleton content and save
- [ ] Can edit array items and save
- [ ] Can create new items
- [ ] Can delete items
- [ ] Can cancel edit mode
- [ ] Unsaved changes prompt appears when needed
- [ ] Navigation warning works

### Form Fields
- [ ] Text fields accept input
- [ ] Number fields validate properly
- [ ] Date fields show date picker
- [ ] Boolean/checkbox fields toggle
- [ ] Email/URL fields validate format
- [ ] Markdown editor shows preview
- [ ] Image upload works
- [ ] Array fields can add/remove items

### Security & Performance
- [ ] Markdown preview doesn't execute scripts
- [ ] Image uploads don't leak memory
- [ ] No console errors
- [ ] No infinite loops
- [ ] Page doesn't freeze during edits

---

## 🎁 Benefits After Refactor

1. **No infinite loops** - Removed circular reactive dependencies
2. **Simpler architecture** - FormGenerator is self-contained
3. **Svelte-idiomatic** - Uses bindings, not callback chains
4. **Better UX** - Proper unsaved changes warnings
5. **More secure** - XSS protection in markdown
6. **No memory leaks** - Proper cleanup of resources
7. **Easier to maintain** - Clear ownership, less code
8. **Prevents future bugs** - Proper reactive patterns

---

## 🚀 Ready to Start?

Begin with **Phase 1, Task 1.1** - Refactor FormGenerator. This is the most important change and will fix the infinite loop bug.

Work through each task sequentially, testing after each phase before moving to the next.

Good luck! 🎉
