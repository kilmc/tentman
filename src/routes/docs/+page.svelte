<script lang="ts">
	const builtInBlocks = [
		'text',
		'textarea',
		'markdown',
		'email',
		'url',
		'number',
		'date',
		'boolean',
		'image'
	];
</script>

<div class="prose prose-gray max-w-none">
	<div class="mb-8">
		<h1 class="mb-2 text-4xl font-bold text-gray-900">Tentman Documentation</h1>
		<p class="text-xl text-gray-600">
			The current Tentman config model is built around explicit content configs, reusable block
			definitions, and adapter-driven persistence.
		</p>
	</div>

	<nav class="mb-12 rounded-lg border border-gray-200 bg-gray-50 p-6">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Table of Contents</h2>
		<ul class="space-y-2">
			<li><a href="#overview" class="text-blue-600 hover:underline">Overview</a></li>
			<li><a href="#root-config" class="text-blue-600 hover:underline">Root Config</a></li>
			<li><a href="#content-configs" class="text-blue-600 hover:underline">Content Configs</a></li>
			<li><a href="#block-configs" class="text-blue-600 hover:underline">Block Configs</a></li>
			<li><a href="#custom-adapters" class="text-blue-600 hover:underline">Custom Block Adapters</a></li>
			<li><a href="#content-modes" class="text-blue-600 hover:underline">Content Modes</a></li>
			<li><a href="#block-types" class="text-blue-600 hover:underline">Built-in Block Types</a></li>
			<li><a href="#discovery" class="text-blue-600 hover:underline">Discovery and Paths</a></li>
			<li><a href="#examples" class="text-blue-600 hover:underline">Examples</a></li>
			<li><a href="#migration" class="text-blue-600 hover:underline">Migration Notes</a></li>
		</ul>
	</nav>

	<section id="overview" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Overview</h2>
		<p class="mb-4">
			Tentman reads <code class="rounded bg-gray-100 px-1.5 py-0.5">*.tentman.json</code> files,
			builds forms from the declared <code class="rounded bg-gray-100 px-1.5 py-0.5">blocks</code>,
			and persists content through explicit <code class="rounded bg-gray-100 px-1.5 py-0.5"
				>content.mode</code
			>
			behavior.
		</p>
		<p class="mb-4">The current model uses two top-level config types:</p>
		<ul class="mb-4 ml-6 list-disc space-y-2">
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "content"</code> for editable content
				definitions
			</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "block"</code> for reusable structured
				block definitions
			</li>
		</ul>
		<p class="mb-0">
			For repeatable content, use <code class="rounded bg-gray-100 px-1.5 py-0.5"
				>collection: true</code
			>.
			Persistence shape lives under the <code class="rounded bg-gray-100 px-1.5 py-0.5"
				>content</code
			>
			object, and schema shape lives under <code class="rounded bg-gray-100 px-1.5 py-0.5"
				>blocks</code
			>.
		</p>
	</section>

	<section id="root-config" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Root Config</h2>
		<p class="mb-4">
			The root <code class="rounded bg-gray-100 px-1.5 py-0.5">.tentman.json</code> file is optional.
			When present, it controls discovery defaults and shared asset behavior.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "blocksDir": "./tentman/blocks",
  "configsDir": "./tentman/configs",
  "assetsDir": "./static/images"
}`}</code></pre>
		<ul class="mt-4 ml-6 list-disc space-y-2">
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">blocksDir</code> limits reusable block config
				discovery.
			</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">configsDir</code> limits top-level content
				config discovery.
			</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">assetsDir</code> provides the default upload
				location for image-oriented blocks.
			</li>
		</ul>
	</section>

	<section id="content-configs" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Content Configs</h2>
		<p class="mb-4">
			Content configs declare editable content. They do not need an ID in v1.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "content",
  "label": "Blog Posts",
  "itemLabel": "Blog Post",
  "collection": true,
  "idField": "slug",
  "content": {
    "mode": "directory",
    "path": "./src/content/posts",
    "template": "./templates/post.md",
    "filename": "{{slug}}"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
    { "id": "slug", "type": "text", "label": "Slug", "required": true },
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}`}</code></pre>
		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Rules</h3>
		<ul class="ml-6 list-disc space-y-2">
			<li><code class="rounded bg-gray-100 px-1.5 py-0.5">label</code> is required.</li>
			<li><code class="rounded bg-gray-100 px-1.5 py-0.5">content</code> is required.</li>
			<li><code class="rounded bg-gray-100 px-1.5 py-0.5">blocks</code> is required.</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">itemLabel</code> is required when
				<code class="rounded bg-gray-100 px-1.5 py-0.5">collection: true</code>.
			</li>
			<li>
				Top-level content configs support <code class="rounded bg-gray-100 px-1.5 py-0.5">file</code>
				and <code class="rounded bg-gray-100 px-1.5 py-0.5">directory</code> modes in v1.
			</li>
		</ul>
	</section>

	<section id="block-configs" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Block Configs</h2>
		<p class="mb-4">
			Block configs define reusable structured blocks that can be referenced by ID through the block
			registry.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "block",
  "id": "seo",
  "label": "SEO",
  "blocks": [
    { "id": "metaTitle", "type": "text", "label": "Meta Title" },
    { "id": "metaDescription", "type": "textarea", "label": "Meta Description" }
  ]
}`}</code></pre>
		<ul class="mt-4 ml-6 list-disc space-y-2">
			<li>
				Block configs require <code class="rounded bg-gray-100 px-1.5 py-0.5">id</code>,
				<code class="rounded bg-gray-100 px-1.5 py-0.5">label</code>, and
				<code class="rounded bg-gray-100 px-1.5 py-0.5">blocks</code>.
			</li>
			<li>
				They default to embedded behavior in v1, even when reused across content configs.
			</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">collection: true</code> makes the block
				repeatable.
			</li>
			<li>
				Reusable block configs may also declare an
				<code class="rounded bg-gray-100 px-1.5 py-0.5">adapter</code> file when the generic
				structured adapter is not enough.
			</li>
		</ul>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Inline Structured Blocks</h3>
		<p class="mb-4">
			You can also define nested structured blocks inline by using
			<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "block"</code> inside a parent config's
			<code class="rounded bg-gray-100 px-1.5 py-0.5">blocks</code> array.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "id": "gallery",
  "type": "block",
  "label": "Gallery",
  "collection": true,
  "blocks": [
    { "id": "image", "type": "image", "required": true },
    { "id": "alt", "type": "text", "required": true },
    { "id": "caption", "type": "text" }
  ]
}`}</code></pre>
	</section>

	<section id="custom-adapters" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Custom Block Adapters</h2>
		<p class="mb-4">
			Most reusable block configs should rely on Tentman's generated structured adapter. Add a custom
			adapter file only when a reusable <code class="rounded bg-gray-100 px-1.5 py-0.5">type: "block"</code>
			config needs custom defaults or validation behavior.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "block",
  "id": "imageGallery",
  "label": "Image Gallery",
  "collection": true,
  "adapter": "./image-gallery.adapter.js",
  "blocks": [
    { "id": "image", "type": "image", "required": true },
    { "id": "alt", "type": "text", "required": true },
    { "id": "caption", "type": "text" }
  ]
}`}</code></pre>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Adapter Module Contract</h3>
		<p class="mb-4">
			The adapter file must export a named <code class="rounded bg-gray-100 px-1.5 py-0.5">adapter</code>
			object. Its <code class="rounded bg-gray-100 px-1.5 py-0.5">type</code> must exactly match the
			block config's <code class="rounded bg-gray-100 px-1.5 py-0.5">id</code>.
		</p>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`export const adapter = {
  type: "imageGallery",
  getDefaultValue() {
    return [];
  },
  validate(value) {
    if (value === undefined || value === null) {
      return [];
    }

    return Array.isArray(value) ? [] : ["Image Gallery must be a list."];
  }
};`}</code></pre>

		<ul class="mt-4 ml-6 list-disc space-y-2">
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">getDefaultValue</code> is required.
			</li>
			<li>
				<code class="rounded bg-gray-100 px-1.5 py-0.5">validate</code> is optional.
			</li>
			<li>
				If the adapter file is missing, malformed, or exports the wrong block
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type</code>, Tentman surfaces that as a block
				registry load error in local mode.
			</li>
		</ul>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Path and Runtime Rules</h3>
		<ul class="ml-6 list-disc space-y-2">
			<li>
				Adapter paths resolve relative to the block config file that declares them.
			</li>
			<li>
				Custom adapter files are only supported for reusable block configs, not inline nested block
				definitions.
			</li>
			<li>
				In the current local browser-backed runtime, adapter files must be self-contained ESM
				JavaScript modules with a <code class="rounded bg-gray-100 px-1.5 py-0.5">.js</code> or
				<code class="rounded bg-gray-100 px-1.5 py-0.5">.mjs</code> extension.
			</li>
			<li>
				Repo-local TypeScript adapter files and adapter files that depend on further local imports are
				not supported yet.
			</li>
		</ul>
	</section>

	<section id="content-modes" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Content Modes</h2>
		<div class="space-y-6">
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-2 text-xl font-semibold text-gray-900">File Mode</h3>
				<p class="mb-3 text-gray-700">
					Stores content in a single file. Use
					<code class="rounded bg-gray-100 px-1.5 py-0.5">itemsPath</code> when a file-backed config
					contains multiple entries.
				</p>
				<pre class="overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "mode": "file",
  "path": "./src/content/site.json"
}`}</code></pre>
				<pre class="mt-3 overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "mode": "file",
  "path": "./src/content/team.json",
  "itemsPath": "$.members"
}`}</code></pre>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-2 text-xl font-semibold text-gray-900">Directory Mode</h3>
				<p class="mb-3 text-gray-700">
					Stores one entry per file inside a directory and uses a template to create new items.
				</p>
				<pre class="overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "mode": "directory",
  "path": "./src/content/posts",
  "template": "./templates/post.md",
  "filename": "{{slug}}"
}`}</code></pre>
			</div>

			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-2 text-xl font-semibold text-gray-900">Embedded Mode</h3>
				<p class="mb-0 text-gray-700">
					Embedded mode is reserved for nested content structures. Top-level
					<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "content"</code> configs do not use
					it in v1.
				</p>
			</div>
		</div>
	</section>

	<section id="block-types" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Built-in Block Types</h2>
		<p class="mb-4">
			Tentman ships with primitive block adapters for common authoring needs.
		</p>
		<div class="flex flex-wrap gap-2">
			{#each builtInBlocks as blockType}
				<span class="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700">
					{blockType}
				</span>
			{/each}
		</div>
		<p class="mt-4">
			Block usages support shared metadata like
			<code class="rounded bg-gray-100 px-1.5 py-0.5">label</code>,
			<code class="rounded bg-gray-100 px-1.5 py-0.5">required</code>,
			<code class="rounded bg-gray-100 px-1.5 py-0.5">show</code>,
			<code class="rounded bg-gray-100 px-1.5 py-0.5">minLength</code>,
			<code class="rounded bg-gray-100 px-1.5 py-0.5">maxLength</code>, and
			<code class="rounded bg-gray-100 px-1.5 py-0.5">assetsDir</code>.
		</p>
	</section>

	<section id="discovery" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Discovery and Paths</h2>
		<ul class="ml-6 list-disc space-y-2">
			<li>
				If <code class="rounded bg-gray-100 px-1.5 py-0.5">configsDir</code> is set, Tentman only
				discovers top-level content configs inside that directory.
			</li>
			<li>
				If <code class="rounded bg-gray-100 px-1.5 py-0.5">blocksDir</code> is set, Tentman discovers
				reusable block configs from there and excludes them from top-level content discovery.
			</li>
			<li>
				Content paths resolve relative to the config file that declares them.
			</li>
			<li>
				Block adapter paths resolve relative to the block config file that declares them.
			</li>
			<li>
				In local mode, adapter files currently need to be self-contained
				<code class="rounded bg-gray-100 px-1.5 py-0.5">.js</code> or
				<code class="rounded bg-gray-100 px-1.5 py-0.5">.mjs</code> modules.
			</li>
			<li>
				Root config paths resolve relative to the root <code class="rounded bg-gray-100 px-1.5 py-0.5"
					>.tentman.json</code
				>.
			</li>
		</ul>
	</section>

	<section id="examples" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Examples</h2>
		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Single-Entry Content</h3>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "content",
  "label": "Site Settings",
  "content": {
    "mode": "file",
    "path": "./src/content/site.json"
  },
  "blocks": [
    { "id": "siteTitle", "type": "text", "label": "Site Title", "required": true },
    { "id": "tagline", "type": "textarea", "label": "Tagline" }
  ]
}`}</code></pre>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">File-Backed Collection</h3>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "content",
  "label": "Team Members",
  "itemLabel": "Team Member",
  "collection": true,
  "idField": "slug",
  "content": {
    "mode": "file",
    "path": "./src/content/team.json",
    "itemsPath": "$.members"
  },
  "blocks": [
    { "id": "name", "type": "text", "label": "Name", "required": true, "show": "primary" },
    { "id": "slug", "type": "text", "label": "Slug", "required": true },
    { "id": "role", "type": "text", "label": "Role", "show": "secondary" }
  ]
}`}</code></pre>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Directory-Backed Collection</h3>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "content",
  "label": "Blog Posts",
  "itemLabel": "Blog Post",
  "collection": true,
  "idField": "slug",
  "content": {
    "mode": "directory",
    "path": "./src/content/posts",
    "template": "./templates/post.md",
    "filename": "{{slug}}"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
    { "id": "slug", "type": "text", "label": "Slug", "required": true },
    { "id": "date", "type": "date", "label": "Date", "required": true, "show": "secondary" },
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}`}</code></pre>

		<h3 class="mb-3 mt-6 text-xl font-semibold text-gray-900">Reusable Block With Custom Adapter</h3>
		<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{`{
  "type": "block",
  "id": "imageGallery",
  "label": "Image Gallery",
  "collection": true,
  "adapter": "./image-gallery.adapter.js",
  "blocks": [
    { "id": "image", "type": "image", "required": true },
    { "id": "alt", "type": "text", "required": true },
    { "id": "caption", "type": "text" }
  ]
}`}</code></pre>
	</section>

	<section id="migration" class="mb-12">
		<h2 class="mb-4 text-2xl font-bold text-gray-900">Migration Notes</h2>
		<ul class="ml-6 list-disc space-y-2">
			<li>
				Old inferred top-level config types are replaced by explicit
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "content"</code> and
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "block"</code>.
			</li>
			<li>
				Legacy <code class="rounded bg-gray-100 px-1.5 py-0.5">fields</code> definitions are replaced
				by <code class="rounded bg-gray-100 px-1.5 py-0.5">blocks</code>.
			</li>
			<li>
				Single-file repeatable content now uses
				<code class="rounded bg-gray-100 px-1.5 py-0.5">content.mode: "file"</code> plus
				<code class="rounded bg-gray-100 px-1.5 py-0.5">itemsPath</code>.
			</li>
			<li>
				File-per-entry content now uses
				<code class="rounded bg-gray-100 px-1.5 py-0.5">content.mode: "directory"</code> with
				<code class="rounded bg-gray-100 px-1.5 py-0.5">template</code> and optional
				<code class="rounded bg-gray-100 px-1.5 py-0.5">filename</code>.
			</li>
			<li>
				Reusable nested structures belong in block configs or inline
				<code class="rounded bg-gray-100 px-1.5 py-0.5">type: "block"</code> definitions.
			</li>
			<li>
				When a reusable block needs custom adapter logic in local mode, declare
				<code class="rounded bg-gray-100 px-1.5 py-0.5">adapter</code> with a self-contained
				<code class="rounded bg-gray-100 px-1.5 py-0.5">.js</code> or
				<code class="rounded bg-gray-100 px-1.5 py-0.5">.mjs</code> module path.
			</li>
		</ul>
	</section>
</div>
