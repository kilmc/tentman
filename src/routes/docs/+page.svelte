<div class="prose prose-gray max-w-none">
	<div class="mb-8">
		<h1 class="mb-2 text-4xl font-bold text-gray-900">Tentman CMS Documentation</h1>
		<p class="text-xl text-gray-600">
			A Git-based content management system for static sites
		</p>
	</div>

	<!-- Table of Contents -->
	<nav class="mb-12 rounded-lg border border-gray-200 bg-gray-50 p-6">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Table of Contents</h2>
		<ul class="space-y-2">
			<li><a href="#overview" class="text-blue-600 hover:underline">Overview</a></li>
			<li><a href="#how-it-works" class="text-blue-600 hover:underline">How It Works</a></li>
			<li><a href="#content-patterns" class="text-blue-600 hover:underline">Content Patterns</a></li>
			<li><a href="#config-reference" class="text-blue-600 hover:underline">Configuration Reference</a></li>
			<li><a href="#field-types" class="text-blue-600 hover:underline">Field Types</a></li>
			<li><a href="#examples" class="text-blue-600 hover:underline">Example Configurations</a></li>
			<li><a href="#getting-started" class="text-blue-600 hover:underline">Getting Started</a></li>
		</ul>
	</nav>

	<!-- Overview -->
	<section id="overview" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Overview</h2>
		<p class="mb-4">
			Tentman is a standalone SvelteKit admin application that allows non-technical users to manage
			content for static sites via a web interface. It authenticates with GitHub, reads configuration
			files from your repositories to understand your content structure, generates forms for editing,
			and commits changes back via the GitHub API.
		</p>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">The Problem Being Solved</h3>
		<p class="mb-4">
			Tentman enables you to build static sites for clients who want to manage content themselves
			without:
		</p>
		<ul class="mb-4 ml-6 list-disc space-y-2">
			<li>Using platforms like Squarespace, Wix, or WordPress</li>
			<li>Paying for hosting or CMS services</li>
			<li>Losing the benefits of GitHub + Netlify (free, automated deployment)</li>
			<li>Loading CMS scripts on the public site</li>
		</ul>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Key Features</h3>
		<ul class="mb-4 ml-6 list-disc space-y-2">
			<li>
				<strong>Convention-based config discovery:</strong> Place
				<code class="rounded bg-gray-100 px-1.5 py-0.5">*.tentman.json</code> files alongside your content
			</li>
			<li><strong>Three flexible content patterns:</strong> Singletons, arrays, and collections</li>
			<li><strong>Multiple field types:</strong> Text, markdown, images, dates, and more</li>
			<li><strong>GitHub-powered:</strong> All changes committed directly to your repository</li>
			<li><strong>Draft workflow:</strong> Make multiple changes before publishing</li>
			<li><strong>No dependencies on your public site:</strong> Your static site never knows the CMS exists</li>
		</ul>
	</section>

	<!-- How It Works -->
	<section id="how-it-works" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">How It Works</h2>
		<ol class="ml-6 list-decimal space-y-3">
			<li>
				<strong>Authenticate:</strong> Login with GitHub to authorize Tentman to access your repositories
			</li>
			<li>
				<strong>Select Repository:</strong> Choose which repository you want to manage content for
			</li>
			<li>
				<strong>Config Discovery:</strong> Tentman scans your repository for
				<code class="rounded bg-gray-100 px-1.5 py-0.5">*.tentman.json</code> configuration files
			</li>
			<li>
				<strong>Edit Content:</strong> Use auto-generated forms based on your config to create and edit
				content
			</li>
			<li>
				<strong>Draft Changes:</strong> All changes are saved to a draft branch (
				<code class="rounded bg-gray-100 px-1.5 py-0.5">tentman-draft</code>)
			</li>
			<li>
				<strong>Publish:</strong> When ready, publish all draft changes to your main branch at once
			</li>
		</ol>
	</section>

	<!-- Content Patterns -->
	<section id="content-patterns" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Content Patterns</h2>
		<p class="mb-6">
			Tentman supports three distinct content management patterns. The pattern is automatically
			detected based on which properties are present in your configuration file.
		</p>

		<div class="space-y-8">
			<!-- Singleton -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-3 text-xl font-semibold text-gray-900">1. Singleton</h3>
				<p class="mb-3 text-gray-700">
					A single object with structured data. Perfect for pages like "About Us", homepage hero
					sections, or site settings.
				</p>
				<p class="mb-2 text-sm font-medium text-gray-700">Detected when config has:</p>
				<ul class="mb-3 ml-6 list-disc text-sm text-gray-600">
					<li><code class="rounded bg-gray-100 px-1 py-0.5">contentFile</code> property</li>
					<li>No <code class="rounded bg-gray-100 px-1 py-0.5">collectionPath</code></li>
					<li>No <code class="rounded bg-gray-100 px-1 py-0.5">template</code></li>
				</ul>
				<p class="text-sm text-gray-600">
					<strong>Example use cases:</strong> Homepage content, About page, Contact info, Site settings
				</p>
			</div>

			<!-- Single-file Array -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-3 text-xl font-semibold text-gray-900">2. Single-file Array</h3>
				<p class="mb-3 text-gray-700">
					An array stored in one JSON file. Great for lists that need to be ordered or grouped
					together.
				</p>
				<p class="mb-2 text-sm font-medium text-gray-700">Detected when config has:</p>
				<ul class="mb-3 ml-6 list-disc text-sm text-gray-600">
					<li><code class="rounded bg-gray-100 px-1 py-0.5">contentFile</code> property</li>
					<li>
						<code class="rounded bg-gray-100 px-1 py-0.5">collectionPath</code> (JSONPath to the array)
					</li>
					<li><code class="rounded bg-gray-100 px-1 py-0.5">idField</code> (required)</li>
					<li>No <code class="rounded bg-gray-100 px-1 py-0.5">template</code></li>
				</ul>
				<p class="text-sm text-gray-600">
					<strong>Example use cases:</strong> Tour dates, Product releases, Team members, FAQ items
				</p>
			</div>

			<!-- Multi-file Collection -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-3 text-xl font-semibold text-gray-900">3. Multi-file Collection</h3>
				<p class="mb-3 text-gray-700">
					Multiple files (markdown or JSON) in a directory, one file per item. Ideal for content that
					benefits from individual files.
				</p>
				<p class="mb-2 text-sm font-medium text-gray-700">Detected when config has:</p>
				<ul class="mb-3 ml-6 list-disc text-sm text-gray-600">
					<li><code class="rounded bg-gray-100 px-1 py-0.5">template</code> property</li>
					<li><code class="rounded bg-gray-100 px-1 py-0.5">idField</code> (required)</li>
					<li>No <code class="rounded bg-gray-100 px-1 py-0.5">contentFile</code></li>
				</ul>
				<p class="text-sm text-gray-600">
					<strong>Example use cases:</strong> Blog posts, Documentation pages, Case studies, Recipes
				</p>
			</div>
		</div>
	</section>

	<!-- Config Reference -->
	<section id="config-reference" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Configuration Reference</h2>
		<p class="mb-6">
			Configuration files must be named <code class="rounded bg-gray-100 px-1.5 py-0.5"
				>*.tentman.json</code
			>
			and placed anywhere in your repository (typically alongside the content they describe).
		</p>

		<div class="overflow-x-auto">
			<table class="min-w-full border border-gray-200 bg-white text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Property</th
						>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Type</th
						>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Required</th
						>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Description</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					<tr>
						<td class="px-4 py-3 font-mono text-xs">label</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3">✓</td>
						<td class="px-4 py-3">Display name shown in the CMS (e.g., "Blog Posts")</td>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">fields</td>
						<td class="px-4 py-3">object | array</td>
						<td class="px-4 py-3">✓</td>
						<td class="px-4 py-3">Field definitions (see Field Types section)</td>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">contentFile</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3">*</td>
						<td class="px-4 py-3"
							>Path to content file (for singletons and arrays). Relative to config file.</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">template</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3">*</td>
						<td class="px-4 py-3"
							>Path to template file (for collections). Relative to config file.</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">collectionPath</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3"></td>
						<td class="px-4 py-3"
							>JSONPath to array within content file (e.g., "$.posts"). Makes it a single-file
							array.</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">idField</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3">**</td>
						<td class="px-4 py-3"
							>Field name to use as unique identifier (required for arrays and collections)</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">imagePath</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3"></td>
						<td class="px-4 py-3">Custom path for image uploads (defaults to "static/images/")</td>
					</tr>
				</tbody>
			</table>
		</div>

		<p class="mt-4 text-sm text-gray-600">
			* Either <code class="rounded bg-gray-100 px-1 py-0.5">contentFile</code> or
			<code class="rounded bg-gray-100 px-1 py-0.5">template</code> is required<br />
			** <code class="rounded bg-gray-100 px-1 py-0.5">idField</code> is required for arrays and collections
		</p>
	</section>

	<!-- Field Types -->
	<section id="field-types" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Field Types</h2>
		<p class="mb-6">
			Fields can be defined in two formats: simple (just the type as a string) or detailed (an object
			with additional options).
		</p>

		<h3 class="mb-3 text-lg font-semibold text-gray-900">Simple Format</h3>
		<pre
			class="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`"fields": {
  "title": "text",
  "published": "boolean",
  "content": "markdown"
}`}</code></pre>

		<h3 class="mb-3 text-lg font-semibold text-gray-900">Detailed Format</h3>
		<pre
			class="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`"fields": {
  "title": {
    "type": "text",
    "required": true,
    "show": "primary"
  },
  "slug": {
    "type": "text",
    "generated": true
  },
  "publishDate": {
    "type": "date",
    "show": "secondary"
  }
}`}</code></pre>

		<h3 class="mb-4 mt-8 text-lg font-semibold text-gray-900">Available Field Types</h3>
		<div class="space-y-4">
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">text</h4>
				<p class="text-sm text-gray-700">Single-line text input</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">textarea</h4>
				<p class="text-sm text-gray-700">Multi-line text input</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">markdown</h4>
				<p class="text-sm text-gray-700">
					Markdown editor with preview (for rich text content)
				</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">email</h4>
				<p class="text-sm text-gray-700">Email address input with validation</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">url</h4>
				<p class="text-sm text-gray-700">URL input with validation</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">number</h4>
				<p class="text-sm text-gray-700">Numeric input</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">date</h4>
				<p class="text-sm text-gray-700">Date picker</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">boolean</h4>
				<p class="text-sm text-gray-700">Checkbox for true/false values</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">image</h4>
				<p class="text-sm text-gray-700">Image upload and preview</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<h4 class="mb-2 font-mono text-sm font-semibold text-gray-900">array</h4>
				<p class="mb-2 text-sm text-gray-700">
					Repeatable nested fields (must include <code
						class="rounded bg-gray-100 px-1 py-0.5 text-xs">fields</code
					> property)
				</p>
				<pre
					class="overflow-x-auto rounded bg-gray-50 p-2 text-xs"><code>{`"features": {
  "type": "array",
  "fields": {
    "title": "text",
    "description": "textarea"
  }
}`}</code></pre>
			</div>
		</div>

		<h3 class="mb-4 mt-8 text-lg font-semibold text-gray-900">Field Options</h3>
		<div class="overflow-x-auto">
			<table class="min-w-full border border-gray-200 bg-white text-sm">
				<thead class="bg-gray-50">
					<tr>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Option</th
						>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Type</th
						>
						<th class="border-b border-gray-200 px-4 py-3 text-left font-semibold text-gray-900"
							>Description</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					<tr>
						<td class="px-4 py-3 font-mono text-xs">type</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3">The field type (required)</td>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">label</td>
						<td class="px-4 py-3">string</td>
						<td class="px-4 py-3"
							>Custom display label (defaults to field name converted to Title Case)</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">required</td>
						<td class="px-4 py-3">boolean</td>
						<td class="px-4 py-3">Whether the field is required</td>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">generated</td>
						<td class="px-4 py-3">boolean</td>
						<td class="px-4 py-3"
							>Mark field as auto-generated (e.g., slug from title). Hidden by default.</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">show</td>
						<td class="px-4 py-3">"primary" | "secondary"</td>
						<td class="px-4 py-3"
							>Display on index cards. "primary" = large title, "secondary" = metadata</td
						>
					</tr>
					<tr>
						<td class="px-4 py-3 font-mono text-xs">fields</td>
						<td class="px-4 py-3">object</td>
						<td class="px-4 py-3">Nested field definitions (for array type only)</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<!-- Examples -->
	<section id="examples" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Example Configurations</h2>

		<div class="space-y-8">
			<!-- Singleton Example -->
			<div>
				<h3 class="mb-3 text-xl font-semibold text-gray-900">Singleton: About Page</h3>
				<p class="mb-3 text-sm text-gray-700">
					A single JSON file containing your about page content.
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`// about.tentman.json
{
  "label": "About Page",
  "contentFile": "./about.json",
  "fields": {
    "title": {
      "type": "text",
      "required": true,
      "show": "primary"
    },
    "tagline": {
      "type": "text",
      "show": "secondary"
    },
    "content": "markdown",
    "teamImage": "image"
  }
}`}</code></pre>
			</div>

			<!-- Single-file Array Example -->
			<div>
				<h3 class="mb-3 text-xl font-semibold text-gray-900">Single-file Array: Tour Dates</h3>
				<p class="mb-3 text-sm text-gray-700">
					An array of tour dates stored in one JSON file.
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`// tours.tentman.json
{
  "label": "Tour Dates",
  "contentFile": "./tours.json",
  "collectionPath": "$.dates",
  "idField": "id",
  "fields": {
    "id": {
      "type": "text",
      "generated": true
    },
    "date": {
      "type": "date",
      "required": true,
      "show": "primary"
    },
    "venue": {
      "type": "text",
      "required": true,
      "show": "secondary"
    },
    "city": {
      "type": "text",
      "show": "secondary"
    },
    "ticketUrl": "url",
    "soldOut": "boolean"
  }
}`}</code></pre>
				<p class="mt-3 text-sm text-gray-700">
					The <code class="rounded bg-gray-100 px-1 py-0.5">tours.json</code> file would look like:
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`{
  "dates": [
    {
      "id": "tour-1",
      "date": "2025-06-15",
      "venue": "Madison Square Garden",
      "city": "New York",
      "ticketUrl": "https://...",
      "soldOut": false
    }
  ]
}`}</code></pre>
			</div>

			<!-- Multi-file Collection Example -->
			<div>
				<h3 class="mb-3 text-xl font-semibold text-gray-900">Multi-file Collection: Blog Posts</h3>
				<p class="mb-3 text-sm text-gray-700">
					Individual markdown files for each blog post, using a template.
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`// posts.tentman.json
{
  "label": "Blog Posts",
  "template": "./post.template.md",
  "idField": "slug",
  "fields": {
    "title": {
      "type": "text",
      "required": true,
      "show": "primary"
    },
    "slug": {
      "type": "text",
      "generated": true
    },
    "date": {
      "type": "date",
      "required": true,
      "show": "secondary"
    },
    "author": {
      "type": "text",
      "show": "secondary"
    },
    "coverImage": "image",
    "excerpt": "textarea",
    "content": "markdown",
    "published": "boolean"
  }
}`}</code></pre>
				<p class="mt-3 text-sm text-gray-700">
					The <code class="rounded bg-gray-100 px-1 py-0.5">post.template.md</code> file:
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`---
title: ""
slug: ""
date: ""
author: ""
coverImage: ""
excerpt: ""
published: false
---

Write your post content here...`}</code></pre>
			</div>

			<!-- Array Field Example -->
			<div>
				<h3 class="mb-3 text-xl font-semibold text-gray-900">
					Using Array Fields: Product with Features
				</h3>
				<p class="mb-3 text-sm text-gray-700">
					Array fields allow repeatable nested structures within a single item.
				</p>
				<pre
					class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"><code class="text-sm">{`// products.tentman.json
{
  "label": "Products",
  "contentFile": "./products.json",
  "collectionPath": "$.products",
  "idField": "id",
  "fields": {
    "id": {
      "type": "text",
      "generated": true
    },
    "name": {
      "type": "text",
      "required": true,
      "show": "primary"
    },
    "price": {
      "type": "number",
      "show": "secondary"
    },
    "description": "textarea",
    "features": {
      "type": "array",
      "fields": {
        "icon": "text",
        "title": "text",
        "description": "textarea"
      }
    },
    "inStock": "boolean"
  }
}`}</code></pre>
			</div>
		</div>
	</section>

	<!-- Getting Started -->
	<section id="getting-started" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Getting Started</h2>

		<div class="space-y-6">
			<div>
				<h3 class="mb-3 text-lg font-semibold text-gray-900">1. Create Your First Config File</h3>
				<p class="mb-3 text-gray-700">
					In your repository, create a file named <code class="rounded bg-gray-100 px-1.5 py-0.5"
						>*.tentman.json</code
					>
					(e.g., <code class="rounded bg-gray-100 px-1.5 py-0.5">posts.tentman.json</code>). Place it
					near your content files.
				</p>
			</div>

			<div>
				<h3 class="mb-3 text-lg font-semibold text-gray-900">2. Choose Your Content Pattern</h3>
				<p class="mb-3 text-gray-700">
					Decide which pattern fits your content needs:
				</p>
				<ul class="ml-6 list-disc space-y-2 text-gray-700">
					<li>
						<strong>Singleton:</strong> Single pages or settings
						<code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs">contentFile</code> only
					</li>
					<li>
						<strong>Single-file Array:</strong> Lists in one file
						<code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs">contentFile</code> +
						<code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs">collectionPath</code>
					</li>
					<li>
						<strong>Multi-file Collection:</strong> Individual files per item
						<code class="rounded bg-gray-100 px-1.5 py-0.5 text-xs">template</code>
					</li>
				</ul>
			</div>

			<div>
				<h3 class="mb-3 text-lg font-semibold text-gray-900">3. Define Your Fields</h3>
				<p class="mb-3 text-gray-700">
					List all the fields your content needs. Use simple types for basic fields, and the detailed
					format when you need validation or display options.
				</p>
			</div>

			<div>
				<h3 class="mb-3 text-lg font-semibold text-gray-900">4. Login to Tentman</h3>
				<p class="mb-3 text-gray-700">
					Visit the Tentman CMS, login with GitHub, select your repository, and your configs will be
					automatically discovered.
				</p>
			</div>

			<div>
				<h3 class="mb-3 text-lg font-semibold text-gray-900">5. Start Editing</h3>
				<p class="mb-3 text-gray-700">
					Use the auto-generated forms to create and edit your content. All changes are saved to a
					draft branch until you're ready to publish.
				</p>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="mt-16 border-t border-gray-200 pt-8 text-center text-sm text-gray-600">
		<p>
			Need help? Have questions? Check out the
			<a href="https://github.com/anthropics/tentman" class="text-blue-600 hover:underline"
				>GitHub repository</a
			>
		</p>
	</footer>
</div>
