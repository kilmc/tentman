---
_tentmanId: tent_01KTVA0B0VT000000000000004
title: Rendering with content components
slug: rendering-with-content-components
date: '2026-05-03'
author: Tentman Team
coverImage: '/images/posts/field-notes.svg'
excerpt: The new fixture uses Tentman content components in normal prose so the feature is visible without hijacking the entire site.
published: true
---

## Why use the official pattern

Tentman calls these **content components**. They are the preferred source-authoring model for reusable markdown content when you want stable semantic markers in source.

In practice that means an editor can write a sentence that points someone to :doc-link[the About page]{href="/about" variant="plain"} or :doc-link[the FAQ page]{href="/faq" variant="strong"} without storing final presentational HTML in the content file.

## Why this fixture includes one

The test app is not meant to show every possible component shape. It just needs one real example that proves the path works end to end: authoring, storage, and frontend rendering.

## Code example

This page works because the app registers a repo-local content component in `src/lib/content-components/doc-link` and then uses that marker in markdown:

```json filename="component.json" open
{
	"id": "doc-link",
	"name": "doc-link",
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
			"default": "plain",
			"options": ["plain", "strong"]
		}
	}
}
```

```njk filename="render.njk"
<a class="content-link content-link--{{ variant | escape }}" href="{{ href | escape }}">{{ label | escape }}</a>
```

```md filename="rendering-with-content-components.md"
:doc-link[the About page]{href="/about" variant="plain"}
:doc-link[the FAQ page]{href="/faq" variant="strong"}
```
