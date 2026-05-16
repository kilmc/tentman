# Markdown Content Component Editor Interactions

## Summary

Refactor Tentman's markdown/content-component editor behavior so marker-style content components feel native inside the Tiptap/ProseMirror document model instead of being managed through ad hoc app-state workarounds.

The core direction is:

- keep marker-style content components as native ProseMirror nodes
- rely on native node selection, deletion, and typing-over replacement behavior
- move Tentman-specific behavior into a small editor-layer interaction policy
- keep app-level Svelte code responsible for UI and navigation, not document semantics

This plan is intentionally architecture-first. It should be used as the working reference before implementing editor behavior changes.

## Current Problem

The current implementation works, but responsibilities are split across too many layers:

- the content-component node spec already models components as atomic/selectable nodes
- the node view also manages click-selection and second-click activation
- the shared editor setup overrides deletion and text replacement for selected content components
- the Svelte field layer separately decides whether the selected component should edit, jump, or open a popover

This makes it hard to reason about failures. A broken interaction could be caused by:

- schema and node-spec choices
- node-view click handling
- editor props and key handlers
- field-level Svelte state and contextual UI

The result is unstable behavior for marker-only block components such as `::gallery-embed`, especially where we want them to stay selectable and interactive without turning them into special cases managed outside the editor model.

## Goals

- Marker-only components remain selectable and discoverable.
- Native ProseMirror behavior handles:
  - node selection
  - `Backspace` / `Delete`
  - typing over a selected node
  - normal cursor and arrow-key behavior
- Tentman can still provide custom actions:
  - edit component attributes
  - jump to a referenced source block
  - open an external href when meaningful
  - show a small action chooser when more than one action is available
- Component authors should not need to think about interaction rules.
- Interaction policy should be easy to tune while testing UX.

## Non-Goals

- Replacing marker-style components with app-managed decorations or fake widgets
- Making components non-interactive to avoid selection problems
- Forcing all editing into a popover
- Baking final UX policy directly into component definitions

## Current Implementation Notes

Important current responsibilities:

- [apps/web/src/lib/content-components/markdown.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/markdown.ts)
  - defines content-component node extensions
  - sets `atom: true` and `selectable: true`
  - renders preview node views
  - currently also handles click-selection and second-click activation in the node view
- [apps/web/src/lib/features/markdown-editor/create-editor.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/markdown-editor/create-editor.ts)
  - sets shared editor props
  - currently overrides `Backspace`, `Delete`, `Enter`, and `handleTextInput` for selected content components
- [apps/web/src/lib/components/form/MarkdownField.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownField.svelte)
  - resolves whether the selected component can edit or jump
  - opens dialogs and contextual popovers
  - performs source-block navigation
- [apps/web/src/lib/components/form/markdown-field-content-component-selection.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/markdown-field-content-component-selection.ts)
  - derives selected-component state and reference targets

This split is the main architectural issue. The editor and node view are doing app-policy work, while the app layer is compensating for editor mechanics.

## Model-Level Decision

Marker-only block content components should remain block nodes represented directly in the ProseMirror document.

Recommended node characteristics:

- block node when the component is declared as block
- inline node when the component is declared as inline
- `selectable: true`
- `atom: true`
- no editable child content

Rationale:

- ProseMirror already supports node selection for selectable nodes
- native selection deletion and typing-over replacement work correctly on atomic nodes
- a node view can render a rich preview without making the content editable
- keeping these as real nodes preserves document semantics and keyboard behavior

Avoid:

- replacing them with decorations
- introducing app-owned shadow selection state
- storing them as ordinary text and simulating widget behavior on top

## Editor Model Principles

### 1. ProseMirror owns document behavior

The editor model should own:

- selection
- deletion
- replacement by typing
- cursor navigation
- block splitting and normal `Enter` behavior

Tentman should stop overriding native behavior unless a real model-level gap is proven.

### 2. Tentman owns semantic activation

Tentman-specific behaviors such as edit and jump are not native ProseMirror concerns. They should be layered on top of native selection through a small interaction system.

### 3. Node views render, but do not orchestrate app policy

Node views should focus on:

- rendering preview DOM
- exposing stable DOM for selection styling and measurement
- optionally exposing minimal state through data attributes

Node views should not decide:

- whether a click means edit or jump
- whether to open a dialog or popover
- how deletion and replacement should work

## Capability Model

The core integration should derive interaction capabilities automatically for the currently selected content-component node.

Suggested derived capabilities:

- `canEdit`
  - true when the component has editable dialog fields
- `canJump`
  - true when the selected node resolves to a reference target in the current form context
- `canOpenHref`
  - true when the selected node exposes a meaningful href
- `isBroken`
  - true when the node is in parse/validation/render error state
- `isMarkerOnly`
  - true when the component has no editable fields

These capabilities should come from Tentman's integration layer, not from author-authored interaction config.

## Intent Model

The editor interaction layer should emit a small set of semantic intents:

- `edit`
- `jump`
- `openHref`
- `openActions`
- `none`

This should be the boundary between editor behavior and app UI.

The app layer can respond by:

- opening a dialog
- opening a small action popover
- navigating to the referenced field
- opening a link

## Primary Action Resolution

Tentman should derive a primary action from the available capabilities.

Recommended rules:

- if `isBroken` and `canEdit`, primary action is `edit`
- if exactly one action is available, primary action is that action
- if more than one action is available, primary action is `openActions`
- if no action is available, primary action is `none`

Examples:

- marker-only component with only a resolvable reference
  - primary action: `jump`
- editable component with no reference
  - primary action: `edit`
- editable component with a reference target
  - primary action: `openActions`
- editable component with href and reference
  - primary action: `openActions`

## Interaction Policy

The interaction policy should be centralized and swappable so we can tune the feel without rewriting the feature.

### Native editing behavior

Keep native ProseMirror behavior for:

- single click selection
- arrow navigation
- `Backspace`
- `Delete`
- typing over a selected node
- plain `Enter`

### Tentman activation behavior

Recommended first-pass policy:

- single click
  - select the node only
- double click
  - trigger the node's primary action
- `Cmd/Ctrl+Click`
  - direct open only when the node has a meaningful href
- contextual action UI
  - shown only when the primary action resolves to `openActions`

Plain `Enter` should not be repurposed for activation. It should preserve ordinary editor behavior.

`Mod-Enter` may be considered later as an optional activation shortcut, but it should not be required for the first pass.

## Popover Versus Dialog

Do not replace dialogs with popovers.

Recommended split:

- popover = lightweight action chooser
- dialog = full attribute editing UI

Examples:

- component with only editable attrs
  - double click opens dialog
- component with only a reference target
  - double click jumps directly
- component with attrs and a reference target
  - double click opens a small popover with `Edit` and `Jump`

This preserves room for more complex future components without forcing cramped editing UI into a small contextual bubble.

## Layer Ownership

### ProseMirror schema / node spec

Owns:

- block vs inline node shape
- atomic/selectable node behavior
- attrs and serialization boundaries

Should not own:

- jump/edit policy
- app navigation
- dialog selection

### ProseMirror plugins / editor hooks / Tiptap extension

Owns:

- gesture to intent mapping
- double-click activation handling
- modifier-click handling
- any content-component-specific editor commands

Should expose a reusable editor abstraction such as:

- `getSelectedContentComponentCapabilities`
- `getSelectedContentComponentPrimaryAction`
- `activateSelectedContentComponent`

### Node views

Own:

- preview rendering
- selected/broken DOM representation

Should avoid:

- opening dialogs directly
- navigating directly
- overriding document semantics

### App-level Svelte state and UI

Owns:

- opening dialogs
- opening popovers
- resolving reference targets using form context
- jumping to referenced fields
- opening href targets

Should receive semantic intents rather than infer behavior from low-level click quirks.

## Recommended Architectural Shape

Add a dedicated Tentman editor interaction layer for content components.

Possible responsibilities:

- detect whether the current selection is a content-component node
- derive capabilities for that node
- compute the node's primary action
- expose editor commands or callbacks for activation
- map gestures to those actions

This layer should sit between:

- the raw ProseMirror/Tiptap editor
- the Svelte markdown field UI

That gives us a stable seam for UX experimentation.

## Viable Approaches Considered

### Approach A: NodeSelection-first interaction model

- keep components as atomic/selectable nodes
- rely on native PM behavior for selection and replacement
- handle activation through editor-layer commands and hooks

Pros:

- most native PM feel
- best keyboard behavior
- smallest long-term maintenance burden

Cons:

- requires untangling current node-view and editor-props hacks

### Approach B: Node-view-driven widget behavior

- keep the current node model
- continue letting node views own click semantics

Pros:

- localized behavior for each node type

Cons:

- encourages DOM-event logic in rendering code
- harder to keep keyboard behavior consistent
- easier to regress into ad hoc special cases

### Approach C: Decoration-based or text-backed widget abstraction

- keep raw text/directives as the main model
- simulate widgets via decorations or app state

Pros:

- superficially close to literal markdown source

Cons:

- fights native PM selection semantics
- increases custom selection/replacement logic
- not recommended

## Recommendation

Choose Approach A.

This gives Tentman the cleanest long-term model:

- component authors define content structure only
- the editor owns document semantics
- Tentman owns interaction policy at the integration layer
- the app owns concrete UI and navigation

## Implementation Sequence

Implementation should happen in small, controlled steps.

### Step 1: Confirm native document behavior

- remove or temporarily bypass content-component-specific replacement/deletion overrides
- verify native PM node selection behavior for block components
- ensure typing over a selected component replaces it correctly

### Step 2: Remove crossed responsibilities

- stop using the shared editor setup to emulate deletion/replacement behavior
- reduce node-view click handling so it no longer owns activation policy

### Step 3: Introduce the interaction abstraction

- add capability derivation for the selected content component
- add primary-action resolution
- add reusable activation hooks/commands

### Step 4: Rewire Svelte to consume intents

- make the field layer respond to `edit`, `jump`, `openHref`, and `openActions`
- keep dialogs and popovers in app UI only

### Step 5: Tune UX policy

- validate that single click selection feels right
- test double click for primary action
- verify mixed-capability components open the right action chooser
- optionally experiment with future shortcuts such as `Mod-Enter`

## Execution Checklist

This checklist is the recommended implementation order. Each phase should leave the editor in a coherent, testable state before moving on.

## Progress Snapshot

Current implementation status after the first refactor pass:

- completed:
  - removed content-component-specific delete and text-replacement overrides from the shared editor setup
  - restored native ProseMirror behavior for deleting and typing over selected block content-component nodes
  - confirmed that selected content-component nodes are real `NodeSelection`s in the running editor
  - found and fixed a schema-level deletion issue where block content components were acting as the fallback block node when the document became empty
  - centralized content-component capability and primary-action resolution in shared helpers
  - rewired markdown-field activation and popover handling to consume resolved intents
  - removed the remaining component-popover fallback that inferred actions from active toolbar state
- partially completed:
  - moved selection behavior toward the editor/view layer rather than app-state workarounds
  - updated Playwright coverage to assert native block-node deletion and replacement behavior
  - expanded focused interaction coverage for editable-only, mixed, href-bearing, reference-only, and no-action marker scenarios
- still blocked:
  - broader repo-wide `svelte-check` noise still obscures full-project compile confidence beyond the focused editor surface

Important findings from this pass:

- native deletion and typing-over replacement are the right model
- the old editor-level `Backspace` / `Delete` / `handleTextInput` hooks were compensating for the wrong layer
- block content-component nodes should not be given elevated schema priority that causes them to become the default fallback block on delete
- the remaining work is now mostly cleanup, mobile/touch verification, and broader repo hygiene rather than document-model repair

### Phase 0: Baseline And Guardrails

- [x] Add or update focused tests that lock in current desired document behavior for selected content-component nodes:
  - [x] deleting a selected block component with `Backspace`
  - [x] deleting a selected block component with `Delete`
  - [x] typing over a selected block component replaces it
  - [x] single click selects a component node
- [~] Add or update focused interaction tests for the expected app behaviors we intend to preserve:
  - [x] editable component can still open editing UI
  - [x] reference-only component can still jump to source
  - [x] mixed edit-plus-reference component can still expose both actions
- [x] Identify and remove any tests that currently codify behavior we no longer want, especially tests that depend on app-managed replacement or deletion semantics.

Exit criteria:

- we have a clear failing-or-passing test surface for native node behavior and content-component actions
- we know which tests describe the target behavior versus old implementation quirks

### Phase 1: Restore Native ProseMirror Behavior

- [x] Remove content-component-specific `Backspace` / `Delete` overrides from [apps/web/src/lib/features/markdown-editor/create-editor.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/markdown-editor/create-editor.ts)
- [x] Remove content-component-specific `handleTextInput` replacement logic from [apps/web/src/lib/features/markdown-editor/create-editor.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/markdown-editor/create-editor.ts)
- [x] Keep plain `Enter` fully native
- [x] Verify that the selected content-component node still behaves correctly as a native `NodeSelection`
- [x] Confirm that no app-level code is required for delete or type-over replacement

Exit criteria:

- selected content-component nodes use native PM deletion behavior
- typing over a selected node uses native PM replacement behavior
- no content-component-specific document-editing hacks remain in the shared editor setup

### Phase 2: Simplify Node View Responsibilities

- [~] Reduce the content-component node view in [apps/web/src/lib/content-components/markdown.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/markdown.ts) so it focuses on preview rendering and minimal DOM state only
- [x] Remove node-view-owned activation policy such as “already selected means click should activate”
- [~] Preserve any harmless DOM metadata needed for:
  - [x] broken-state detection
  - [x] href detection
  - [ ] bounding-rect measurement for popovers
- [~] Preserve modifier-click behavior only if it remains cleanly scoped and does not interfere with normal selection

Exit criteria:

- node views render and expose state
- node views do not decide edit versus jump versus popover policy

### Phase 3: Introduce A Content-Component Interaction Abstraction

- [x] Add a dedicated editor-layer module for selected content-component interactions
- [x] Move selected-node capability derivation behind a small reusable API
- [x] Derive and expose:
  - [x] `canEdit`
  - [x] `canJump`
  - [x] `canOpenHref`
  - [x] `isBroken`
  - [x] primary action
- [x] Add a small intent model for:
  - [x] `edit`
  - [x] `jump`
  - [x] `openHref`
  - [x] `openActions`
  - [x] `none`
- [x] Add one reusable activation entrypoint, such as:
  - [x] `activateSelectedContentComponent`
  - [x] or `getSelectedContentComponentPrimaryAction`
- [x] Keep this abstraction independent from Svelte UI concerns

Notes:

- there is currently a temporary `activateSelectedContentComponent` path in [MarkdownField.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownField.svelte), but it is not yet the final editor-layer abstraction
- the remaining work here is to lift activation and capability resolution out of ad hoc field wiring into a reusable integration layer

Possible file placement:

- a new helper in `apps/web/src/lib/features/markdown-editor/`
- or a focused content-component interaction module adjacent to the markdown field helpers

Exit criteria:

- the editor layer can answer “what actions are available for the selected content component?”
- the editor layer can answer “what is the primary action?”
- Svelte no longer needs to infer these rules from scattered editor and node-view behavior

### Phase 4: Centralize Gesture Policy

- [x] Add editor-layer gesture handling for content components in one place
- [x] Implement the current working policy:
  - [x] single click selects
  - [x] double click triggers primary action
  - [x] `Cmd/Ctrl+Click` directly opens href when meaningful
- [~] Keep the mapping configurable enough to swap behaviors later without rewriting the whole feature
- [x] Avoid using plain `Enter` for activation
- [x] Treat any future keyboard activation shortcut, such as `Mod-Enter`, as optional follow-up work rather than part of the initial refactor

Notes:

- single-click selection is now correct
- gesture handling is now centered in the editor/view layer instead of split across node view and field click branches
- several attempted integration points were tried during the refactor and are still worth knowing for future tuning:
  - `editorProps.handleDoubleClickOn`
  - `editorProps.handleClickOn` using `event.detail === 2`
  - node-view `dblclick`
  - node-view second-click timing
  - field-shell `ondblclick`
- those older paths should stay retired unless a future regression proves the current editor-layer path insufficient

Exit criteria:

- click and double-click behavior is defined in one interaction-policy layer
- gesture mapping is no longer split across node view, editor props, and Svelte click handlers

### Phase 5: Rewire Svelte To Consume Intents

- [x] Update [apps/web/src/lib/components/form/MarkdownField.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownField.svelte) so it reacts to semantic intents from the editor layer instead of raw click quirks
- [x] Keep the app layer responsible for:
  - [x] opening dialogs
  - [x] opening contextual action popovers
  - [x] jumping to referenced fields
  - [x] opening hrefs
- [x] Reuse the existing reference-target resolution logic where possible
- [x] Ensure mixed-capability components open the action chooser rather than jumping or editing directly
- [x] Ensure broken editable components still route to editing UI

Notes:

- the field layer is now mostly UI dispatch and navigation
- the remaining cleanup here is small-scale simplification, not architectural rework

Exit criteria:

- the Svelte field layer handles UI and navigation only
- editor semantics are no longer duplicated in app state

### Phase 6: Align Popover And Dialog Behavior

- [x] Keep dialogs as the full editing surface for components with real attribute forms
- [x] Restrict the contextual popover to lightweight action choice
- [x] Verify the intended outcomes:
  - [x] editable-only component double click opens dialog
  - [x] reference-only component double click jumps
  - [x] mixed component double click opens action popover
  - [x] href-capable component still supports direct external open when appropriate
- [~] Check that the existing link popover behavior and content-component action popover feel consistent without forcing them into the same implementation shape

Exit criteria:

- popovers remain lightweight
- dialogs remain available for real editing work
- mixed-capability nodes expose both actions clearly

### Phase 7: UX Tuning And Cleanup

- [x] Try the interaction model against at least these scenarios:
  - [x] marker-only component with no attrs and no reference
  - [x] marker-only reference-only component
  - [x] editable component with no reference
  - [x] editable component with a reference
  - [x] broken editable component
- [~] Verify mobile and desktop behavior where practical
- [~] Remove now-unused helper code and dead branches left over from the old implementation
- [ ] Reassess whether any optional shortcut such as `Mod-Enter` is still desirable after trying the click behavior

Exit criteria:

- the interaction model feels native enough in practice
- no obvious old workaround code remains

## File-Level Work Map

This is the expected hot path for the refactor.

### Likely primary files

- [apps/web/src/lib/features/markdown-editor/create-editor.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/markdown-editor/create-editor.ts)
  - remove document-editing workarounds
  - possibly host centralized gesture hooks
- [apps/web/src/lib/content-components/markdown.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/markdown.ts)
  - trim node-view responsibilities
  - preserve schema/node setup
- [apps/web/src/lib/components/form/MarkdownField.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownField.svelte)
  - consume intents
  - keep UI and navigation handling
- [apps/web/src/lib/components/form/markdown-field-content-component-selection.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/markdown-field-content-component-selection.ts)
  - likely source for capability and reference-target logic

### Likely supporting files

- [apps/web/src/lib/components/form/markdown-field-controller.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/markdown-field-controller.ts)
- [apps/web/src/lib/components/form/markdown-field-popover.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/markdown-field-popover.ts)
- [apps/web/src/lib/components/form/MarkdownContextualPopover.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownContextualPopover.svelte)
- browser tests around `MarkdownField`

## Test Checklist

At minimum, the final implementation should be covered by tests for:

- [x] selecting a block content-component node by click
- [x] deleting a selected block content-component node with `Backspace`
- [x] deleting a selected block content-component node with `Delete`
- [x] typing over a selected block content-component node
- [x] opening dialog for editable-only component
- [x] jumping for reference-only component
- [x] opening action popover for mixed edit-plus-reference component
- [x] modifier-click opening href when present
- [x] broken editable component routing to repair/edit UI

## Resume Notes

If work resumes in a new conversation, the most important current truth is:

- document-model and core activation behavior are both in solid shape, and the remaining work is mostly polish

Specifically:

- do not reintroduce delete or text-input workarounds in the shared editor setup
- do not restore elevated block-node priority for content-component nodes
- keep the centralized capability/primary-action path as the source of truth
- focus next on:
  - mobile/touch interaction verification
  - any remaining transitional helper cleanup
  - whether broader repo type-check cleanup is worth doing for developer velocity

Known passing focused coverage:

- selected block component deletes with native `Backspace`
- selected block component deletes with native `Delete`
- typing over a selected block component replaces it
- editable-only component double-click opens dialog
- mixed referenced component double-click opens action popover
- unresolved editable reference double-click opens repair/edit UI
- marker-only reference component double-click jumps to the source field
- href-bearing editable component supports modifier-click direct open
- marker-only component with no actions remains selectable and inert on double-click
- touch tap on a mixed-capability component remains selection-first on mobile

Known remaining gaps:

- mobile/touch coverage is started, but still not exhaustive across all component shapes
- full-project type-check noise remains broader than this refactor

## Suggested Commit Strategy

To keep the work reviewable, prefer splitting the implementation into small commits:

- [ ] test scaffolding and failing cases
- [ ] restore native PM delete/type-over behavior
- [ ] simplify node-view behavior
- [ ] add interaction abstraction and gesture policy
- [ ] rewire Svelte field UI to intents
- [ ] polish tests and cleanup

## Open Questions Before Coding

- Should `Cmd/Ctrl+Click` always mean open href, or should it be configurable for jump on reference-only nodes?
- Should multi-action components open the popover immediately on double click, or only after an explicit action gesture?
- Should there be a visible inline affordance on selected mixed-capability nodes, or is the contextual popover enough?
- Do broken but non-editable components need a dedicated recovery action beyond selection and deletion?

## Current Working Decision

Unless superseded by later testing, the working UX decision is:

- single click selects
- native PM handles delete and typing-over replacement
- double click triggers the primary action
- primary action is derived from capabilities
- mixed-capability components open a small action popover
- dialogs remain the full editor for attribute-heavy components

## Notes For Resume

If work resumes later with partial context, start by re-reading:

- this plan
- [apps/web/src/lib/content-components/markdown.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/content-components/markdown.ts)
- [apps/web/src/lib/features/markdown-editor/create-editor.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/features/markdown-editor/create-editor.ts)
- [apps/web/src/lib/components/form/MarkdownField.svelte](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/MarkdownField.svelte)
- [apps/web/src/lib/components/form/markdown-field-content-component-selection.ts](/Users/kilmc/code/tentman/tentman/apps/web/src/lib/components/form/markdown-field-content-component-selection.ts)

The first coding task should be to restore native editor behavior before adding the new interaction abstraction.
