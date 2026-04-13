# Tentman Instructions v1

## Summary

Add a new `Instructions` feature so repos can define scaffold-like generation flows under `tentman/instructions/<instruction-id>/`. An Instruction lets a developer provide schema-driven inputs, Hygen-like file templates, optional Tentman-native navigation behavior, human-friendly confirmation copy, and post-run notes.

The feature should be client-planned by default:

- local mode handles discovery, input collection, preview, and writes entirely in the browser
- GitHub-backed mode reuses the same client-side planning flow and uses the server only for authenticated remote reads/writes
- Tentman does not gain framework-specific page semantics; repo-authored Instructions own framework and domain conventions

## Key Changes

### Instruction contract and on-disk convention

- Add a new instruction folder convention:

```text
tentman/instructions/<instruction-id>/
  instruction.json
  templates/**/*.tmpl
```

- `instruction.json` should support:
  - `id`
  - `label`
  - `description`
  - `inputs`
  - optional `navigation`
  - optional `confirmation`
  - optional `notes`
- All `*.tmpl` files under `templates/` are auto-discovered. Do not require explicit template registration in metadata.
- Template files use lightweight frontmatter with:
  - required `to`
  - optional `if`
  - optional `skip_if_exists`
- Template bodies support simple variable interpolation like `{{slug}}`.
- Do not support embedded JS, arbitrary code execution, shell commands, or repo-authored prompt scripts in v1.

### File generation and Tentman-native behavior

- Use template frontmatter for generated file destinations so authors keep file path intent co-located with template content.
- Do not add a generic `operations` or generic `updates` system in v1.
- Support one Tentman-native built-in at the top level:

```json
"navigation": {
  "enabled": "{{showInNavigation}}",
  "addItem": "{{configId}}"
}
```

- Navigation behavior:
  - if `enabled` resolves false, do nothing
  - if the manifest exists, append the item if missing
  - if the manifest does not exist, create a minimal valid navigation manifest
  - preserve existing content order otherwise
  - preview no-op if the item already exists
- Do not expose raw manifest paths or generic structured mutation targets in author-facing metadata for v1.

### Client-side planning, confirmation, and execution

- Build an Instructions flow that works like:
  1. discover available Instructions for the selected repo
  2. show an Instruction picker
  3. render an input form from `instruction.json`
  4. compile a client-side execution plan from inputs, templates, and the navigation built-in
  5. show a user-facing confirmation screen
  6. allow the user to go back and edit inputs
  7. apply the plan
  8. show success state plus notes
- The confirmation step should default to human-friendly content, not file-level detail.
- `confirmation` should support:
  - `title`
  - `summary` as an array of strings
  - optional conditional detail lines
- Example confirmation copy:
  - `This will create a new page at /press.`
  - `The page will be editable in Tentman as Press Page.`
  - `This page will be added to Tentman navigation.`
- Technical details should exist only behind an advanced disclosure:
  - generated file paths
  - skipped files
  - navigation manifest changes
  - collisions and conflicts

### Thin-backend implementation model

- For local browser-backed repos:
  - discovery, parsing, validation, template rendering, confirmation generation, collision checks, and writes all happen through the local repository backend in the browser
- For GitHub-backed repos:
  - discovery can use the existing thin repo/config read pattern
  - template rendering, input validation, confirmation generation, and plan assembly should stay client-side
  - the server should only perform privileged remote reads and writes plus plan validation before execution
- The server must not own instruction semantics beyond validating and applying a client-produced plan.

### Focused subsystems

- Add a new Instructions feature area with responsibilities split into:
  - discovery and parsing for `instruction.json` and template files
  - template frontmatter parsing and interpolation
  - a client-side planner that compiles inputs into an execution plan
  - an execution layer that applies a plan against a `RepositoryBackend`
  - a navigation helper for Tentman-native manifest behavior
  - UI for picker, input form, confirmation, advanced technical details, and success state
- Prefer reusing existing Tentman patterns for:
  - schema-driven UI
  - repository backend abstractions
  - navigation manifest parsing and serialization helpers
  - thin API boundaries for GitHub-backed mode

## Public Interfaces / Types

- Add explicit types for:
  - `InstructionDefinition`
  - `InstructionInputDefinition`
  - `InstructionTemplateFile`
  - `InstructionConfirmation`
  - `InstructionNote`
  - `InstructionNavigationConfig`
  - `InstructionExecutionPlan`
  - `PlannedFileCreate`
  - `PlannedNavigationChange`
- Template frontmatter contract:
  - `to: string`
  - `if?: string`
  - `skip_if_exists?: boolean`
- Input types in v1:
  - `text`
  - `slug`
  - `boolean`
  - `select`
- Do not add arbitrary action types, plugin hooks, JS prompt files, or generic mutation primitives in v1.

## Test Plan

- instruction discovery finds valid folders under `tentman/instructions` and ignores incomplete ones
- invalid `instruction.json` fails clearly without breaking other discovered Instructions
- all `templates/**/*.tmpl` files are auto-discovered without metadata registration
- template frontmatter parsing handles `to`, `if`, and `skip_if_exists`
- interpolation works in template bodies, frontmatter values, confirmation copy, notes, and navigation config
- client-side planner builds a correct execution plan for a singleton-page Instruction
- client-side planner builds a correct execution plan for a collection-style Instruction
- confirmation content renders resolved, human-friendly summaries from inputs
- users can return from confirmation to edit inputs and regenerate the plan
- advanced details show generated files and navigation changes without being the default UI
- collision handling reports file conflicts and honors `skip_if_exists`
- navigation built-in appends a missing item, no-ops when already present, and creates a manifest when absent
- local mode applies the full flow without server involvement
- GitHub-backed mode reuses the same planner and only delegates authenticated writes to the thin server layer
- malformed or unsupported Instructions fail safely and surface useful author-facing errors

## Assumptions And Defaults

- The feature is named `Instructions`.
- Instruction discovery root is `tentman/instructions`.
- Every `*.tmpl` file under an Instruction's `templates/` directory is included automatically.
- File generation stays template-driven and convention-based.
- Tentman-native behavior in v1 is limited to top-level `navigation`.
- The default preflight UI is a confirmation screen, not a technical execution plan.
- Technical file-level details are available only in an advanced disclosure.
- Input editing is supported from the confirmation screen.
- Local-first implementation is the fastest path, but GitHub-backed execution is a required product target and should be preserved in the architecture from the start.
- v1 intentionally excludes arbitrary code patching, regex injection, shell execution, embedded JS templating, and generic structured update escape hatches.
