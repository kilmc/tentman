# Content Components for Source Authoring

## Summary

Design a new Tentman content component system that helps developers automate the same kinds of source-file edits they would make by hand in a real site codebase. The core model should be renderer-agnostic and stack-agnostic: developers define a small component contract plus one or more templates, authors insert semantic markers into content, and the site build renders those markers into final output.

The first adapter can target `mdsvex + remark-directive`, but the system must not be architected around mdsvex-specific quirks. The durable abstraction is the content component itself, not the first adapter.

This work is intended to replace the current direction of storing final HTML shapes in Tentman-authored markdown plugins for cases like `buy-button`, where changing rendered structure should update all existing instances on the next build without requiring content rewrites.

## Current Decisions

The following decisions are currently in scope for implementation unless superseded by a later revision:

- content components are the preferred model for source-authored reusable content
- component definitions live in `component.json`
- final site output is rendered from `render.njk`
- Tentman authoring representation is rendered from `preview.njk`
- `@tentman/core` owns the bounded `content-components` module
- `@tentman/mdsvex` is a thin adapter over `@tentman/core`
- the first source syntax target is markdown directives
- the first template engine is `nunjucks`
- component markers remain semantic source syntax, not stored final HTML
- serialization rules for v1 are:
  - all active non-label attributes are written explicitly
  - attributes are serialized in alphabetical order
  - markdown-label values are not duplicated into explicit attributes
  - quoting and escaping are canonicalized
- preview rendering in Tentman is restricted to safe presentational markup with no arbitrary client-side scripting

## Problem Statement

The current local plugin direction couples persisted content too closely to rendered markup:

- plugin instances are persisted as concrete HTML markers
- changing output structure can require re-inserting or rewriting existing content
- plugin authors are pushed toward low-level code or string-built HTML
- the integration boundary is centered on Tentman internals instead of the site's real source-authoring model

For a developer maintaining a site like Theresa's, the desired workflow is much simpler:

- define a reusable content component once
- let authors insert a semantic marker into markdown
- have the site build render that marker through a real template
- update the template later and have all existing instances update automatically on rebuild

Tentman should automate that workflow rather than invent a parallel runtime-specific markup system.

## Design Principles

### 1. Source-first, not Tentman-first

Tentman should automate edits a developer would reasonably make by hand in the site's real source files.

### 2. Semantic content, rendered output

Content files should store semantic component invocations, not final rendered HTML structure.

### 3. Cross-stack core, stack-specific adapters

The component definition model should be portable across markdown pipelines and site stacks. Adapters may differ, but the component contract should stay stable.

### 4. Templates over string-built markup

Developers should author render output in template files rather than hand-building HTML strings inside plugin code.

### 5. Minimal config, obvious conventions

The component definition should stay small and boring. File naming and directory conventions should remove the need for extra config wherever possible.

### 6. Tentman owns infrastructure

Developers should not have to write AST adapters, parser visitors, or content-pipeline glue just to use the feature. Tentman should provide that integration layer.

## Goals

- Let developers define reusable content components with a tiny declarative config
- Let developers author final render output in a template file
- Let authors use semantic markers in content files
- Let changing a component template update all existing instances on the next build
- Make the core model useful beyond mdsvex, including other markdown pipelines and component-oriented systems
- Keep the first developer setup small enough to feel realistic for normal site work

## Non-Goals

- Replacing markdown as the primary authoring format
- Supporting arbitrary user-authored Svelte or JavaScript inside Tentman previews in v1
- Managing arbitrary imports inside content files in v1
- Solving every renderer ecosystem up front
- Designing a marketplace or distribution system for these components in this phase

## Proposed Developer Workflow

For a site developer, the happy path should look like this:

1. Install one Tentman adapter package for the site's content stack
2. Add one integration line to the site's content pipeline config
3. Create a content component folder
4. Add a small `component.json`
5. Add a `render.njk` template
6. Add a `preview.njk` template for Tentman authoring surfaces
7. Start using the component's semantic marker in content
8. Let Tentman discover the component and provide authoring UI for it

For the `buy-button` example, this means:

- content stores something like `:buy-button[Buy tickets]{href="/tickets" variant="default"}`
- the site build renders it through `render.njk`
- changing `render.njk` later updates every existing buy button on rebuild

## Proposed File Structure

The initial filesystem convention should be simple:

```text
src/lib/content-components/
  buy-button/
    component.json
    render.njk
    preview.njk
```

The v1 shape should stay this small.

Possible later additions:

- `README.md`
- test fixtures
- migration files

## Component Definition

The initial component definition should be a plain JSON file:

```json
{
  "id": "buy-button",
  "name": "buy-button",
  "kind": "inline",
  "attributes": {
    "href": {
      "type": "string",
      "required": true
    },
    "label": {
      "type": "string",
      "required": true,
      "valueFromMarkdownLabel": true
    },
    "variant": {
      "type": "enum",
      "default": "default",
      "options": ["default", "secondary"]
    }
  }
}
```

### Meaning of keys

- `id`: stable internal identifier
- `name`: author-facing component name used in source markers
- `kind`: `inline` or `block`, defaulting to `inline`
- `attributes`: named values passed into rendering

### Initial supported attribute options

- `type`
- `required`
- `default`
- `options` for enum values
- `valueFromMarkdownLabel`

### Deliberate omissions from v1

Do not include these in the initial schema:

- renderer-specific settings
- template file paths
- custom validation expressions
- custom parser hooks
- editor layout metadata
- arbitrary code hooks

The point of v1 is to define the semantic contract, not an entire plugin platform.

## Rendering Model

Each component renders through two template files:

- `render.njk` for site/build output
- `preview.njk` for Tentman authoring surfaces such as the WYSIWYG editor and preview UI

For `buy-button`, that might look like:

```njk
<a
  class="buy-button buy-button--{{ variant }}"
  href="{{ href | escape }}"
  data-buy-button
  data-variant="{{ variant | escape }}"
>
  <span class="sr-only">{{ label | escape }}</span>
</a>
```

Important model decisions:

- content stores semantic component markers, not the rendered HTML above
- the site build renders component instances into final output
- changing the template later updates all existing instances on rebuild

This is the key behavior Tentman needs for long-term maintainability.

## Preview Model

Tentman needs a predictable way to represent these components in authoring surfaces without asking site developers to ship arbitrary Svelte or JavaScript into Tentman itself.

For v1, each component should provide a `preview.njk` template alongside `render.njk`.

For `buy-button`, that could look like:

```njk
<span
  class="tm-component-preview tm-component-preview--buy-button tm-component-preview--{{ variant }}"
  data-tm-component="buy-button"
>
  Buy button: {{ label | escape }}
</span>
```

Important preview decisions:

- `preview.njk` is rendered by Tentman, not by the consumer site
- it is representation-oriented, not the source of truth for final site markup
- it should be safe, simple, and deterministic
- it should not allow arbitrary client-side scripting in v1

This gives Tentman a first-class preview contract while keeping authoring-time rendering separate from the consumer site's final output.

### Preview contract

`preview.njk` should be treated as a restricted authoring representation, not as a general-purpose app extension point.

The contract for v1 should be:

- input context is the normalized component attribute map only
- output is HTML markup intended for Tentman-controlled rendering
- no user-authored JavaScript executes inside Tentman as part of preview rendering
- Tentman owns the surrounding editor chrome, selection behavior, focus behavior, and interaction shell

In other words, `preview.njk` is allowed to describe what the component should look like in authoring surfaces, but not how Tentman itself should behave.

### Allowed scope in `preview.njk`

For v1, previews should be limited to safe presentational markup:

- standard HTML elements
- text content
- classes
- data attributes
- simple structural wrappers

This should be enough for:

- inline chips
- button-like previews
- embeds with placeholder representation
- block previews with labels, summaries, or thumbnails

### Disallowed scope in `preview.njk`

For v1, previews should not be able to define or trigger:

- arbitrary script execution
- inline event handlers
- custom client-side logic
- external asset loading assumptions that Tentman does not control
- editor behavior overrides

If richer interactivity is needed later, that should be designed as a separate, explicit extension surface rather than smuggled in through templates.

### Tentman-controlled wrapper

Tentman should render the preview output inside its own controlled wrapper in the editor.

That wrapper should be responsible for:

- selection state
- focus state
- keyboard interaction
- drag/reorder behavior if relevant
- invalid/error display

This keeps component previews visually expressive without giving them control over editor semantics.

### Styling expectations

`preview.njk` should not require the consumer site's CSS to look correct inside Tentman.

The preview contract should assume:

- Tentman provides baseline preview styles
- component previews may emit class names for local styling hooks
- Tentman decides whether and how component-specific preview styles are supported in v1

The simplest v1 path is:

- no separate component-authored preview stylesheet
- Tentman provides a small shared design language for preview atoms and blocks
- `preview.njk` composes that shared language with component-specific labels or structure

This avoids creating a second uncontrolled styling surface too early.

### Failure behavior

If `preview.njk` fails to render or produces invalid output, Tentman should:

- preserve the underlying markdown source
- show a safe fallback representation
- surface a clear error message tied to the component

The editor should remain usable even when preview rendering fails.

### Relationship to `render.njk`

`preview.njk` and `render.njk` serve different purposes and should not be expected to match exactly.

- `render.njk` is for final site output
- `preview.njk` is for authoring-time comprehension and manipulation

They may share labels, attributes, and high-level meaning, but they do not need to share exact markup structure.

This is intentional: a good editor preview is often more schematic and controllable than the final site output.

## Developer Scaffolding and Setup

The setup burden should be mostly one-time pipeline wiring, followed by a lightweight scaffolded component workflow.

### One-time site setup

For an mdsvex site, the intended one-time setup should be:

1. install `@tentman/mdsvex`
2. install `remark-directive`
3. add `tentmanComponents(...)` to the mdsvex config
4. choose or accept the default `componentsDir`
5. commit that configuration once

After that, creating a new content component should not require more content-pipeline work.

### Scaffolding goal

Tentman should provide a scaffold flow so a developer does not start from an empty directory and a blank JSON file.

Conceptually:

```bash
tentman component create buy-button
```

This should generate the minimum viable component folder:

```text
src/lib/content-components/
  buy-button/
    component.json
    render.njk
    preview.njk
```

### Scaffolded `component.json`

For `buy-button`, the starter file could look like:

```json
{
  "id": "buy-button",
  "name": "buy-button",
  "kind": "inline",
  "attributes": {
    "label": {
      "type": "string",
      "required": true,
      "valueFromMarkdownLabel": true
    }
  }
}
```

This should stay intentionally small. The developer can expand it by adding `href`, `variant`, and other attributes they need.

### Scaffolded `render.njk`

The starter render template should be obviously editable and safe:

```njk
<span data-tentman-component="buy-button">
  {{ label | escape }}
</span>
```

The intent is:

- valid template
- valid output
- immediately editable
- no clever abstraction

### Scaffolded `preview.njk`

The starter preview template should be visibly usable in Tentman right away:

```njk
<span class="tm-component-preview">
  {{ label | escape }}
</span>
```

The point is not polish. The point is giving the developer a functioning authoring representation immediately.

### Scaffolding modes

There are two possible levels of ambition here:

#### 1. Generic scaffold

```bash
tentman component create buy-button
```

Generates a neutral starter with simple defaults.

#### 2. Archetype scaffold

Examples:

```bash
tentman component create buy-button --kind inline --template buy-button
tentman component create gallery --kind block --template media-block
```

This could come later if the generic scaffold feels too bare.

For v1, a generic scaffold is enough.

### Validation after scaffold

Immediately after scaffolding, the component should:

- be discoverable by `@tentman/core`
- pass basic validation
- render a minimal preview in Tentman
- render a minimal output in the site build

That means the scaffold should produce a working baseline, not just placeholder files that fail until manually fixed.

### Developer edit loop

Once the component is scaffolded, the intended edit loop should be:

1. edit `component.json`
2. edit `render.njk`
3. edit `preview.njk`
4. use the component marker in markdown
5. reload the site build and Tentman authoring surface

The system should make that loop feel direct and legible.

### Setup documentation expectations

Tentman should document this feature in terms of the developer's real tasks:

- how to install the adapter
- where component folders live
- what `component.json` means
- what `render.njk` does
- what `preview.njk` does
- how to insert the component in markdown
- how changing the template updates all instances on rebuild

Documentation should avoid teaching unified/remark internals unless a developer is explicitly extending the adapter itself.

## CLI and Scaffold UX

The scaffolding command should be small, unsurprising, and useful on the first run.

### v1 command shape

The initial command can be:

```bash
tentman component create <name>
```

Examples:

```bash
tentman component create buy-button
tentman component create image-gallery
```

### v1 behavior

Given `tentman component create buy-button`, the CLI should:

1. resolve the target components directory
2. fail if the component directory already exists
3. create the component folder
4. write `component.json`
5. write `render.njk`
6. write `preview.njk`
7. print the created paths and next steps

### Directory resolution

For v1, the command should prefer convention over flexibility.

Resolution rules:

- if the site already has a configured content components directory, use it
- otherwise default to `src/lib/content-components`

We should avoid a complicated directory selection UX in the first pass.

### Name normalization

The CLI should normalize the user-provided component name into both:

- folder name
- `id`
- `name`

For v1, the simplest rule is:

- preserve a valid kebab-case name as given
- reject invalid names with a clear error

This avoids inventing aggressive auto-rewrite behavior too early.

### Initial output

The command should generate files that are valid immediately, not half-complete placeholders.

The generated `component.json` should be valid under `@tentman/core` validation.

The generated templates should:

- render successfully
- be obviously editable
- use the generated component name where relevant

### Success output

The command should print concise next steps, for example:

1. edit `component.json`
2. edit `render.njk`
3. edit `preview.njk`
4. use `:<name>[Label]{...}` in markdown

### Future CLI additions

Possible later additions:

- `--kind inline|block`
- `--template <archetype>`
- `tentman component validate`
- `tentman component list`

These should not be required to make v1 useful.

## Source Syntax

The cross-stack component model should not be defined in terms of one specific syntax, but the first adapter does need a concrete source form.

For the first markdown-oriented adapter, directive syntax is a strong fit:

```md
:buy-button[Buy tickets]{href="/tickets" variant="default"}
```

Terminology:

- `buy-button` is the component `name`
- `Buy tickets` is the markdown label
- the brace contents are attributes

The component model should remain neutral enough that a different adapter could later map the same component to another source syntax.

## Core and Adapter Boundaries

The shared content component model should live in `@tentman/core`, not inside the mdsvex adapter package.

This keeps the core model aligned with Tentman's product semantics while keeping renderer integrations thin and replaceable.

### `@tentman/core` responsibilities

`@tentman/core` should own the bounded `content-components` module and remain disciplined about what belongs there.

Core responsibilities should include:

- component folder discovery
- `component.json` parsing
- schema validation
- required file validation
- normalized component types
- attribute normalization
- template rendering for:
  - `render.njk`
  - `preview.njk`

Tentman itself and renderer adapters should both depend on this same core implementation.

### `@tentman/mdsvex` responsibilities

`@tentman/mdsvex` should stay intentionally thin.

Its job is to:

- integrate with mdsvex and remark-directive
- map directive syntax into normalized content component invocations
- call into `@tentman/core` for discovery, validation, normalization, and rendering
- return output in a form mdsvex can continue processing safely

It should not become a second place where the component model is reimplemented.

### Guardrail for `@tentman/core`

`@tentman/core` should not become a junk drawer. The content component feature should live in a clearly bounded module such as `content-components`, with a narrow public surface and no leakage into unrelated core areas.

## `@tentman/core` Content Components Module

The `content-components` module in `@tentman/core` should expose a small, explicit surface that both Tentman and adapter packages can rely on.

The lifecycle should be:

1. discover component folders
2. load raw component files
3. validate and normalize component definitions
4. normalize one component instance from source input
5. render that instance for either site output or Tentman preview

### Public types

The public types should stay simple and renderer-agnostic.

Conceptually:

```ts
type ContentComponentKind = 'inline' | 'block';

type ContentComponentAttributeDefinition =
  | {
      type: 'string';
      required?: boolean;
      default?: string;
      valueFromMarkdownLabel?: boolean;
    }
  | {
      type: 'enum';
      required?: boolean;
      default?: string;
      options: string[];
      valueFromMarkdownLabel?: boolean;
    };

type ContentComponentDefinition = {
  id: string;
  name: string;
  kind: ContentComponentKind;
  attributes: Record<string, ContentComponentAttributeDefinition>;
};

type LoadedContentComponent = {
  definition: ContentComponentDefinition;
  directory: string;
  renderTemplatePath: string;
  previewTemplatePath: string;
};

type NormalizedContentComponentInstance = {
  componentId: string;
  componentName: string;
  kind: ContentComponentKind;
  attributes: Record<string, string>;
};

type ContentComponentRenderMode = 'render' | 'preview';
```

These exact names may change, but the surface should look roughly like this.

### Public functions

The module should expose a minimal public API:

```ts
discoverContentComponents(options?)
loadContentComponent(directory)
validateContentComponent(component)
normalizeContentComponentInstance(component, input)
renderContentComponent(component, instance, mode)
```

### `discoverContentComponents(options?)`

Purpose:

- scan a root directory
- find candidate component folders
- load, validate, and return normalized components

Suggested input:

```ts
type DiscoverContentComponentsOptions = {
  componentsDir: string;
  onError?: 'throw' | 'warn';
};
```

Suggested output:

- array of validated `LoadedContentComponent`

Responsibilities:

- filesystem discovery
- duplicate `id` detection
- duplicate `name` detection
- consistent ordering

### `loadContentComponent(directory)`

Purpose:

- read one component folder from disk
- parse `component.json`
- resolve required template paths

Suggested output:

- raw or lightly normalized `LoadedContentComponent`

This function should not silently succeed if required files are missing.

### `validateContentComponent(component)`

Purpose:

- validate definition shape
- validate supported attribute schema
- validate required files

Validation should cover:

- valid JSON
- required keys present
- supported `kind`
- supported attribute types
- valid enum options
- valid `valueFromMarkdownLabel` usage
- `render.njk` exists
- `preview.njk` exists

The output should be either:

- validated normalized component
- or structured validation errors

### `normalizeContentComponentInstance(component, input)`

Purpose:

- take source-level invocation data
- produce the final attribute map used for rendering

Suggested input shape:

```ts
type NormalizeContentComponentInstanceInput = {
  markdownLabel?: string | null;
  attributes?: Record<string, string | null | undefined>;
};
```

Responsibilities:

- map markdown label into any attribute using `valueFromMarkdownLabel`
- apply defaults
- enforce required attributes
- validate enum values
- trim and normalize strings

Suggested output:

- `NormalizedContentComponentInstance`

This function is a key shared boundary. Adapters should not each reimplement this logic.

### `renderContentComponent(component, instance, mode)`

Purpose:

- render the requested template with the normalized attribute map

Suggested input:

- validated `LoadedContentComponent`
- validated `NormalizedContentComponentInstance`
- `mode: 'render' | 'preview'`

Responsibilities:

- choose `render.njk` or `preview.njk`
- render with the normalized attributes as template context
- return the rendered HTML/string result

v1 should keep the render context intentionally small:

- only normalized attribute values
- no adapter-specific magic objects
- no arbitrary runtime hooks

### Public vs internal boundary

The public surface should stop at discovery, validation, normalization, and rendering.

Internal details that should stay private to core:

- low-level filesystem helpers
- raw template engine plumbing
- JSON parsing utilities
- caching details, if any
- error formatting internals

This helps keep the module stable even if implementation details change.

### Error model

The core module should prefer structured, high-signal errors.

At minimum, errors should identify:

- component directory
- file path when relevant
- failing key or attribute when relevant
- human-readable reason

Adapters can decide whether to throw or warn, but core should produce consistent diagnostics.

### Reuse inside Tentman

Tentman itself should use the same public surface to:

- discover available content components in a repo
- read normalized definitions for form generation
- normalize edited attribute values before insertion
- render `preview.njk` for WYSIWYG/editor display

This keeps Tentman and renderer adapters aligned on one shared source of truth.

## Tentman Authoring Flow

Tentman needs to support these components as editable authoring objects, not just as build-time transforms.

The authoring flow should cover:

1. component discovery
2. insertion into markdown content
3. editing existing instances
4. previewing instances in the WYSIWYG surface
5. preserving semantic source of truth in markdown

### Discovery in the app

When Tentman opens a compatible repo, it should:

- discover content components through `@tentman/core`
- show available components where relevant in the editor UI
- use component `name`, `kind`, and `attributes` to build insertion/editing controls

Tentman should not maintain a second component registry format.

### Insertion flow

For the `buy-button` example, the insertion flow should feel like:

1. author clicks an insert action in the WYSIWYG editor
2. Tentman shows a generated form based on `attributes`
3. author fills values such as:
   - `href`
   - `label`
   - `variant`
4. Tentman normalizes the values through `@tentman/core`
5. Tentman inserts a semantic source marker into the markdown document
6. the WYSIWYG view displays the inserted instance using `preview.njk`

The important rule is:

- Tentman inserts semantic source syntax, not final rendered HTML

### Editing flow

When an author selects an existing component instance in the WYSIWYG editor:

1. Tentman identifies the underlying source marker
2. Tentman parses its current label and attributes
3. Tentman maps them into editable form values
4. author updates values
5. Tentman normalizes the updated values through `@tentman/core`
6. Tentman rewrites the semantic marker in markdown
7. the WYSIWYG representation re-renders from `preview.njk`

This should behave like editing a structured content atom, not like editing raw HTML.

### Source of truth

Raw markdown remains the source of truth for authored content.

That means:

- the markdown tab shows the semantic component marker
- the WYSIWYG editor shows a representation rendered from `preview.njk`
- the site build renders the final output from `render.njk`

Each layer has its own job:

- markdown stores the semantic invocation
- Tentman preview shows an authoring-oriented representation
- the site build produces final markup

### Marker serialization

Tentman needs one canonical serialization format for the first markdown-oriented adapter.

For inline components, the initial source shape should be:

```md
:buy-button[Buy tickets]{href="/tickets" variant="default"}
```

Serialization rules should be deterministic:

- the directive name comes from component `name`
- the markdown label is used when `valueFromMarkdownLabel` is set
- all active non-label attributes are serialized explicitly
- attributes are serialized in alphabetical order
- values already represented by the markdown label are not duplicated as explicit attributes
- one canonical quoting and escaping format is always used

These rules should stay stable so content diffs remain meaningful and do not churn when developers reorder internal config keys.

### Parsing existing instances

For editing to work, Tentman needs to recover a component instance from source markdown.

For the mdsvex-oriented path, that means:

- parsing directive nodes from markdown
- matching directive `name` to a discovered content component
- reading markdown label and brace attributes
- normalizing those values through `@tentman/core`

This parsing logic should align with the same syntax assumptions used by the mdsvex adapter.

### WYSIWYG representation

In the editor, a component instance should appear as a selectable structured atom.

For v1, the display contract should be:

- render the instance using `preview.njk`
- wrap it in Tentman-controlled editor chrome if needed for selection and focus
- avoid exposing raw template markup directly to authors

The editor should treat these as structured insertable/editable items, similar to how embedded rich content atoms are typically handled.

### Validation and author feedback

If a component instance is invalid while editing or while parsing existing markdown, Tentman should:

- show a clear error state in the editor
- preserve the underlying markdown rather than silently discarding it
- explain which attribute or rule failed

This is especially important when:

- a component definition changed after content was authored
- a user manually edited the markdown marker
- a repo contains malformed component syntax

### v1 scope limits for authoring

The first version should keep the authoring model tight:

- support insertion and editing of semantic component markers
- support preview rendering through `preview.njk`
- support deterministic markdown serialization

The first version should not try to solve:

- arbitrary nested rich text inside component bodies
- import management in source files
- component-defined client-side behavior inside Tentman
- custom per-component parser extensions

These can be layered on later if the base model proves solid.

## Tentman-Owned Adapter Layer

Tentman should provide the content-pipeline integration package rather than asking developers to write AST transforms by hand.

For mdsvex, the desired setup should feel closer to:

```ts
import remarkDirective from 'remark-directive';
import { tentmanComponents } from '@tentman/mdsvex';

export default {
  extensions: ['.md', '.svx'],
  remarkPlugins: [
    remarkDirective,
    tentmanComponents({
      componentsDir: './src/lib/content-components'
    })
  ]
};
```

The package surface should stay very small. The main export should be one adapter factory:

```ts
tentmanComponents(options?: TentmanMdsvexOptions)
```

The intended shape of `TentmanMdsvexOptions` is:

```ts
type TentmanMdsvexOptions = {
  componentsDir?: string;
  templateEngine?: 'nunjucks';
  onError?: 'throw' | 'warn';
};
```

### Initial config options

- `componentsDir`
  - optional
  - default: `./src/lib/content-components`
  - controls where component folders are discovered

- `templateEngine`
  - optional
  - default: `nunjucks`
  - included mostly to leave a stable config slot for future expansion

- `onError`
  - optional
  - default: `throw`
  - controls whether invalid components break the build or degrade with warnings

This should be the full public config surface for v1 unless real implementation pressure proves otherwise.

The intended one-time setup for a site developer is:

1. Install `@tentman/mdsvex`
2. Add `remark-directive`
3. Add `tentmanComponents({ componentsDir })` to the site's mdsvex config
4. Create component folders under the configured directory
5. Use the resulting component names in markdown directives

After that, adding a new content component should not require more mdsvex pipeline work.

The adapter package is responsible for:

- parsing semantic source markers
- mapping label and directive attributes into core calls
- delegating discovery, validation, normalization, and rendering to `@tentman/core`

Site developers should not have to write parser visitors or renderer glue by hand.

### Filesystem expectations

The adapter should assume a simple convention:

- every direct child directory of `componentsDir` is a candidate component
- a valid component folder contains:
  - `component.json`
  - `render.njk`
  - `preview.njk`

If any required file is missing, validation should fail clearly.

### Validation responsibilities

The adapter should rely on `@tentman/core` for component validation and surface those errors clearly in the build.

The build should fail with high-signal messages by default. Silent fallback would make authoring much harder to debug.

### Rendering contract

For a directive like:

```md
:buy-button[Buy tickets]{href="/tickets" variant="default"}
```

the adapter should:

1. resolve the component by `name`
2. read the markdown label text
3. collect directive attributes
4. ask `@tentman/core` to normalize values using `component.json`
5. ask `@tentman/core` to render `render.njk`

The template context should be the normalized attribute map only. v1 should avoid injecting adapter-specific helper objects into component templates unless they are absolutely necessary.

### Output contract

The adapter should output HTML that mdsvex can continue processing as part of the site build.

Important output expectations:

- the component invocation in source remains semantic markdown
- the final emitted HTML comes from `render.njk`
- changing `render.njk` updates all instances on rebuild
- the adapter should not require per-component import management in content files

### mdsvex-specific responsibilities

The mdsvex adapter is the first concrete adapter, not the core model. Its responsibilities should stay narrow:

- treat remark directive syntax as the source invocation format
- resolve component folders from a configured directory
- ask `@tentman/core` to validate and normalize directive input
- ask `@tentman/core` to render `render.njk`
- emit output in a form mdsvex can continue processing safely

It should not:

- define the core content component schema around mdsvex-only needs
- require user-authored AST code
- require component authors to understand mdsvex internals
- manage arbitrary imports inside content files

### mdsvex adapter error behavior

The mdsvex adapter should be strict by default and graceful when explicitly configured otherwise.

#### Default behavior

Default:

- `onError: 'throw'`

In this mode:

- invalid components fail the build
- malformed directive instances fail the build
- missing required templates fail the build

This is the safest choice for developers, because it makes problems visible immediately.

#### Warning mode

Optional:

- `onError: 'warn'`

In this mode, the adapter may:

- emit a warning
- preserve the original source marker unchanged
- continue the build

This mode is primarily useful for migration periods or partial adoption, not as the recommended default.

#### Error message quality

Adapter errors should always include:

- component `id` or `name` when known
- file path when known
- markdown location when known
- a concrete reason

Examples of failure categories:

- invalid `component.json`
- duplicate component `id`
- duplicate component `name`
- missing `render.njk`
- missing `preview.njk`
- missing required attribute in a directive instance
- invalid enum value in a directive instance
- unknown component name used in content

#### Fallback rule

If the adapter does not throw, it should preserve source content rather than attempting a lossy rewrite.

The adapter should not redefine the component model around mdsvex internals. If a later adapter targets MDX or a generic remark pipeline, the same component definition and template contract should still make sense.

## Cross-Stack Shape

This feature should be useful beyond mdsvex.

The reusable layer is:

- component identity
- component attributes
- template-backed rendering
- semantic source invocation

The stack-specific layer is:

- how source markers are parsed
- where in the content pipeline rendering happens
- how previews are integrated

Potential future adapters:

- `@tentman/mdsvex`
- `@tentman/remark`
- `@tentman/mdx`

MDX may end up preferring a different invocation style, but the same component definition and template model should still be reusable.

## Tentman Editor Implications

Tentman should understand these components as authoring-time building blocks, not as site-runtime code.

Tentman needs to eventually provide:

- component discovery from the repo
- forms generated from `attributes`
- insertion and editing UI for component instances
- preview rendering from `preview.njk` that is safe and predictable

The preview model should stay separate from the final site render contract. v1 should avoid requiring user-authored Svelte inside Tentman just to display a preview.

## Open Questions

### 1. Template engine scope

Start with `nunjucks` only, or design for future template engines now?

Current leaning:

- ship `nunjucks` first
- keep the component contract neutral enough to add more engines later

### 2. Naming around markdown label sourcing

`valueFromMarkdownLabel` is explicit and currently accepted, but it may still deserve a shorter equivalent later if implementation pressure makes the verbosity painful.

### 3. Block component syntax and semantics

Inline components are clear. Block components likely need slightly different authoring and parsing behavior, but the same high-level model.

### 4. Migration from current local plugin model

The existing repo-local markdown plugin direction stores stable HTML markers. We need a migration strategy if this new content component model becomes the preferred path for source-authored site integrations.

## Phased Rollout

### Phase 1: Core model and plan

- finalize `component.json` shape
- finalize directory conventions
- finalize template engine choice for v1
- finalize the boundary between core model and adapters

### Phase 2: mdsvex adapter package

- ship `@tentman/mdsvex`
- support filesystem discovery of `component.json` + `render.njk` + `preview.njk`
- support inline directive-based component rendering
- validate and render `buy-button` end to end

### Phase 3: Tentman authoring integration

- detect site content components from the repo
- expose them as authoring controls in Tentman
- insert and edit semantic markers rather than final HTML
- render WYSIWYG/editor representations through `preview.njk`

### Phase 4: Broader adapter and preview work

- evaluate a generic `remark` adapter
- evaluate MDX support where the same component contract still makes sense

## Initial Implementation Tasks

The work should be sequenced so the core model lands before the adapter and the adapter lands before Tentman authoring integration.

### Step 1: Core module in `@tentman/core`

Add a bounded `content-components` module in core that includes:

- component definition types
- component discovery
- component loading
- component validation
- component instance normalization
- template rendering for `render.njk`
- template rendering for `preview.njk`

Suggested repo areas to inspect and extend:

- `packages/core/src/`
- existing config/discovery helpers that may inform file scanning or validation style

Deliverable:

- a tested core API that can load and render a `buy-button` component from disk

### Step 2: Shared fixtures and tests

Create representative fixture component folders for:

- valid inline component
- valid block component
- invalid missing template
- invalid enum config
- duplicate ids or names

Deliverable:

- focused tests covering discovery, validation, normalization, and rendering

### Step 3: `@tentman/mdsvex` adapter package

Create the first adapter package that:

- integrates with `remark-directive`
- resolves component folders through `@tentman/core`
- converts directive nodes into normalized component instances
- renders `render.njk`
- returns output safely to mdsvex

Deliverable:

- a minimal package with one exported `tentmanComponents(options?)` factory

### Step 4: mdsvex adapter tests

Add tests for:

- valid inline directive rendering
- invalid required attribute handling
- unknown component handling
- warning mode behavior

Deliverable:

- confidence that the adapter behaves predictably in both strict and warning modes

### Step 5: Tentman-side discovery and preview support

Use `@tentman/core` inside the Tentman app to:

- discover repo content components
- read normalized definitions
- render `preview.njk`

Deliverable:

- the app can render component previews without inventing a second component model

### Step 6: Tentman insertion and editing flow

Implement the authoring UI path that:

- lists available components
- generates forms from `attributes`
- inserts semantic markers into markdown
- parses existing markers back into editable values
- re-renders preview output after edits

Deliverable:

- end-to-end `buy-button` insertion and editing in the WYSIWYG editor

### Step 7: Scaffolding command

Add the initial CLI command:

```bash
tentman component create <name>
```

Deliverable:

- a developer can create a valid component folder with one command

### Step 8: Documentation

Document:

- component file structure
- `component.json` schema
- `render.njk`
- `preview.njk`
- mdsvex setup
- authoring marker syntax
- how template changes update all existing instances on rebuild

Deliverable:

- docs that teach the feature without requiring unified internals knowledge

## Recommendation

Adopt this as the new direction for component-like content automation in Tentman:

- semantic markers in source content
- template-backed rendering owned by the site build
- small declarative component definitions
- Tentman-owned adapter packages for concrete stacks

This keeps the core design aligned with how developers actually maintain sites while preserving a path to richer authoring automation inside Tentman.
