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

	const tableOfContents = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'quick-start', label: 'Quick Start' },
		{ id: 'root-config', label: 'Root Config' },
		{ id: 'content-configs', label: 'Content Configs' },
		{ id: 'content-modes', label: 'Content Modes' },
		{ id: 'block-configs', label: 'Block Configs' },
		{ id: 'package-blocks', label: 'Package Blocks' },
		{ id: 'manual-navigation', label: 'Manual Navigation' },
		{ id: 'custom-adapters', label: 'Custom Adapters' },
		{ id: 'discovery', label: 'Discovery and Paths' },
		{ id: 'examples', label: 'Examples' }
	];

	const rootRows = [
		{
			field: 'siteName',
			required: 'No',
			type: 'string',
			purpose: 'Set the site name shown in the Tentman header.',
			notes: 'Useful when the repository name differs from the site name.'
		},
		{
			field: 'blocksDir',
			required: 'No',
			type: 'string',
			purpose: 'Limit reusable block discovery to one directory.',
			notes: 'Files in this directory are excluded from top-level content discovery.'
		},
		{
			field: 'configsDir',
			required: 'No',
			type: 'string',
			purpose: 'Limit top-level content discovery to one directory.',
			notes: 'Useful when a repo contains unrelated `*.tentman.json` files.'
		},
		{
			field: 'assetsDir',
			required: 'No',
			type: 'string',
			purpose: 'Provide a default image upload path.',
			notes: 'A block can still override this locally with its own `assetsDir`.'
		},
		{
			field: 'blockPackages',
			required: 'No',
			type: 'string[]',
			purpose: 'Load reusable blocks from installed packages.',
			notes:
				'Supported in GitHub-backed/server mode. Local browser-backed mode does not load them yet.'
		},
		{
			field: 'netlify.siteName',
			required: 'No',
			type: 'string',
			purpose: 'Generate Netlify preview URLs for draft branches.',
			notes: 'Tentman combines the branch name with the site name.'
		},
		{
			field: 'local.previewUrl',
			required: 'No',
			type: 'string',
			purpose: 'Show a direct preview link in local mode.',
			notes: 'Used as-is.'
		}
	];

	const contentRows = [
		{
			field: 'type',
			required: 'Yes',
			type: '"content"',
			purpose: 'Marks the file as a content config.',
			notes: ''
		},
		{
			field: 'label',
			required: 'Yes',
			type: 'string',
			purpose: 'Human-friendly label used in the UI.',
			notes: 'Also used to derive slugs in some flows.'
		},
		{
			field: 'id',
			required: 'No',
			type: 'string',
			purpose: 'Stable config identifier used by manual navigation.',
			notes:
				'Required in practice for top-level manual ordering via `tentman/navigation-manifest.json`.'
		},
		{
			field: 'content',
			required: 'Yes',
			type: 'object',
			purpose: 'Defines how the content is stored.',
			notes: 'Pick `file` or `directory`.'
		},
		{
			field: 'blocks',
			required: 'Yes',
			type: 'BlockUsage[]',
			purpose: 'Ordered form schema for the editor.',
			notes: 'Keep the main authoring fields first.'
		},
		{
			field: 'collection',
			required: 'No',
			type: 'boolean',
			purpose: 'Marks the config as multi-item content.',
			notes: 'Directory mode defaults to collection behavior.'
		},
		{
			field: 'itemLabel',
			required: 'Sometimes',
			type: 'string',
			purpose: 'Singular label for one item in a collection.',
			notes: 'Required when `collection: true` is explicitly set.'
		},
		{
			field: 'idField',
			required: 'No',
			type: 'string',
			purpose: 'Stable field used to identify items.',
			notes: 'Recommended for collections and required in practice for manual collection ordering.'
		}
	];

	const contentModeRows = [
		{
			mode: 'file',
			use: 'One JSON file, optionally containing a list under a nested path.',
			requiredFields: '`path`',
			optionalFields: '`itemsPath`',
			notes: 'Use `itemsPath` when the array is nested inside a larger JSON object.'
		},
		{
			mode: 'directory',
			use: 'One file per content item.',
			requiredFields: '`path`, `template`',
			optionalFields: '`filename`',
			notes: 'Good for posts, docs, or any file-backed collection.'
		},
		{
			mode: 'embedded',
			use: 'Nested/internal modeling only.',
			requiredFields: 'n/a',
			optionalFields: 'n/a',
			notes: 'Not supported for top-level `type: "content"` configs by the current parser.'
		}
	];

	const blockUsageRows = [
		{
			field: 'id',
			required: 'Yes',
			type: 'string',
			purpose: 'Stable key for the field value.',
			notes: ''
		},
		{
			field: 'type',
			required: 'Yes',
			type: 'string',
			purpose: 'Primitive type, inline `block`, or reusable block id.',
			notes: ''
		},
		{
			field: 'label',
			required: 'No',
			type: 'string',
			purpose: 'Field label shown in the UI.',
			notes: ''
		},
		{
			field: 'required',
			required: 'No',
			type: 'boolean',
			purpose: 'Marks the field as required.',
			notes: ''
		},
		{
			field: 'collection',
			required: 'No',
			type: 'boolean',
			purpose: 'Makes the block repeatable.',
			notes: 'Useful for galleries, links, callouts, and similar grouped data.'
		},
		{
			field: 'itemLabel',
			required: 'No',
			type: 'string',
			purpose: 'Singular label for repeated block items.',
			notes: 'Helpful when `collection: true`.'
		},
		{
			field: 'show',
			required: 'No',
			type: '"primary" | "secondary"',
			purpose: 'Helps the UI group fields by importance.',
			notes: 'A good way to keep forms easier to scan.'
		},
		{
			field: 'minLength / maxLength',
			required: 'No',
			type: 'number',
			purpose: 'Length constraints for supported text-style inputs.',
			notes: ''
		},
		{
			field: 'assetsDir',
			required: 'No',
			type: 'string',
			purpose: 'Overrides the default asset directory for this block.',
			notes: 'Most relevant for image-oriented blocks.'
		},
		{
			field: 'generated',
			required: 'No',
			type: 'boolean',
			purpose: 'Allows some flows to generate the field automatically.',
			notes: 'Relevant when used with collection ids in file-backed content.'
		}
	];

	const blockConfigRows = [
		{
			field: 'type',
			required: 'Yes',
			type: '"block"',
			purpose: 'Marks the file as a reusable block config.',
			notes: ''
		},
		{
			field: 'id',
			required: 'Yes',
			type: 'string',
			purpose: 'Registry id used to reference the block elsewhere.',
			notes: ''
		},
		{
			field: 'label',
			required: 'Yes',
			type: 'string',
			purpose: 'Human-friendly label for the block.',
			notes: ''
		},
		{
			field: 'blocks',
			required: 'Yes',
			type: 'BlockUsage[]',
			purpose: 'Nested fields that make up the structured block.',
			notes: ''
		},
		{
			field: 'collection',
			required: 'No',
			type: 'boolean',
			purpose: 'Makes the reusable block repeatable.',
			notes: ''
		},
		{
			field: 'itemLabel',
			required: 'Sometimes',
			type: 'string',
			purpose: 'Singular label for repeated block items.',
			notes: 'Required when `collection: true` is explicitly set.'
		},
		{
			field: 'adapter',
			required: 'No',
			type: 'string',
			purpose: 'Path to a custom adapter module.',
			notes: 'Only use this when the generated structured adapter is not enough.'
		}
	];

	const adapterRows = [
		{
			exportName: 'adapter.type',
			required: 'Yes',
			type: 'string',
			purpose: 'Must match the block config `id` exactly.'
		},
		{
			exportName: 'adapter.getDefaultValue',
			required: 'Yes',
			type: 'function',
			purpose: 'Returns the initial value for the block.'
		},
		{
			exportName: 'adapter.validate',
			required: 'No',
			type: 'function',
			purpose: 'Returns validation errors when custom validation is needed.'
		}
	];

	const pathRules = [
		'Root config paths resolve relative to `.tentman.json`.',
		'Content storage paths resolve relative to the config file that declares them.',
		'Custom adapter paths resolve relative to the reusable block config file that declares them.',
		'If `configsDir` is set, Tentman only discovers top-level content configs inside that directory.',
		'If `blocksDir` is set, Tentman discovers reusable block configs there and excludes them from top-level content discovery.',
		'Files whose names start with an underscore are skipped during top-level content discovery.',
		'Manual navigation uses the fixed manifest path `tentman/navigation-manifest.json`.',
		'JSON is the only supported manual navigation manifest format in v1.',
		'Package blocks come from installed packages listed in `root.blockPackages`.',
		'Package blocks are not available in local browser-backed mode yet.',
		'In local mode, custom adapter files must be self-contained ESM JavaScript modules with a `.js` or `.mjs` extension.'
	];

	const rootConfigExample = `{
  "siteName": "Field Notes",
  "blocksDir": "./tentman/blocks",
  "configsDir": "./tentman/configs",
  "assetsDir": "./static/images",
  "blockPackages": ["@tentman/blocks-media"],
  "netlify": {
    "siteName": "my-site"
  }
}`;

	const contentConfigExample = `{
  "type": "content",
  "label": "Blog Posts",
  "id": "blog",
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
    { "id": "date", "type": "date", "label": "Publish Date", "show": "secondary" },
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}`;

	const fileCollectionExample = `{
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
}`;

	const fileSingletonExample = `{
  "type": "content",
  "label": "About Page",
  "id": "about",
  "content": {
    "mode": "file",
    "path": "./src/content/pages/about.json"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
    { "id": "intro", "type": "textarea", "label": "Intro", "required": true, "maxLength": 220 },
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}`;

	const blockConfigExample = `{
  "type": "block",
  "id": "seo",
  "label": "SEO",
  "blocks": [
    { "id": "metaTitle", "type": "text", "label": "Meta Title" },
    { "id": "metaDescription", "type": "textarea", "label": "Meta Description" }
  ]
}`;

	const packageBlockExample = `export const blockPackage = {
  blocks: [
    {
      config: {
        type: "block",
        id: "callout",
        label: "Callout",
        blocks: [
          { "id": "title", "type": "text", "label": "Title" },
          { "id": "body", "type": "markdown", "label": "Body" }
        ]
      }
    }
  ]
};`;

	const navigationManifestExample = `{
  "version": 1,
  "content": {
    "items": ["about", "contact", "blog"]
  },
  "collections": {
    "blog": {
      "items": ["testing-content-workflows", "designing-a-realistic-fixture", "blooop"],
      "groups": [
        {
          "id": "featured",
          "label": "Featured posts",
          "items": ["testing-content-workflows", "designing-a-realistic-fixture"]
        }
      ]
    }
  }
}`;

	const customAdapterExample = `export const adapter = {
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
};`;
</script>

<svelte:head>
	<title>Documentation | Tentman</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
	<header class="border-b border-stone-200 pb-8">
		<p class="text-sm font-medium text-stone-500">Tentman documentation</p>
		<h1 class="mt-2 text-4xl font-semibold tracking-tight text-stone-950">Config reference</h1>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			Tentman is easiest to understand if you read it in this order: optional root config, content
			configs, content storage modes, then reusable blocks. This page keeps the examples simple and
			the API surface compact so you can scan it quickly.
		</p>
	</header>

	<nav class="border-b border-stone-200 py-4">
		<ul class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-600">
			{#each tableOfContents as section}
				<li>
					<a href={`#${section.id}`} class="hover:text-stone-950 hover:underline">{section.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	<section id="overview" class="scroll-mt-24 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Overview</h2>
		<div class="mt-4 space-y-4 text-base leading-7 text-stone-700">
			<p>
				Tentman reads <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">*.tentman.json</code>
				files, builds forms from
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">blocks</code>, and stores data
				according to the <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">content</code>
				object.
			</p>
			<p>The main rule of thumb is:</p>
			<ul class="list-disc space-y-2 pl-6">
				<li>Use one `type: "content"` config per editable domain.</li>
				<li>Keep the first version inline and simple.</li>
				<li>Extract a `type: "block"` only when a grouped structure repeats.</li>
				<li>
					Add a custom adapter only when the generated structured block behavior is not enough.
				</li>
			</ul>
		</div>
	</section>

	<section id="quick-start" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Quick Start</h2>
		<div class="mt-4 space-y-4 text-base leading-7 text-stone-700">
			<p>For a new site repo, the smallest useful setup is usually:</p>
			<ol class="list-decimal space-y-2 pl-6">
				<li>
					Add an optional <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
						>.tentman.json</code
					>
					file.
				</li>
				<li>
					Add one or more content configs, often under <code
						class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">tentman/configs</code
					>.
				</li>
				<li>
					Add reusable block configs under <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
						>tentman/blocks</code
					> only when a grouped structure repeats.
				</li>
				<li>
					Use <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
						>content.mode: "directory"</code
					>
					for one-file-per-item content like posts.
				</li>
				<li>
					Use <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">content.mode: "file"</code>
					for singleton pages or JSON collections.
				</li>
			</ol>
		</div>
	</section>

	<section id="root-config" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Root Config</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			The root <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">.tentman.json</code> file is
			optional. Keep it for project-wide defaults like discovery paths, preview links, and package blocks.
		</p>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Field</th>
						<th class="px-4 py-3 font-medium">Required</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Purpose</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each rootRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.field}</td>
							<td class="px-4 py-3">{row.required}</td>
							<td class="px-4 py-3 font-mono text-[13px]">{row.type}</td>
							<td class="px-4 py-3">{row.purpose}</td>
							<td class="px-4 py-3">{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{rootConfigExample}</code></pre>
		</div>
	</section>

	<section id="content-configs" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Content Configs</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			A content config describes one editable thing: what it is called, how it is stored, and which
			fields make up the editor.
		</p>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Field</th>
						<th class="px-4 py-3 font-medium">Required</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Purpose</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each contentRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.field}</td>
							<td class="px-4 py-3">{row.required}</td>
							<td class="px-4 py-3 font-mono text-[13px]">{row.type}</td>
							<td class="px-4 py-3">{row.purpose}</td>
							<td class="px-4 py-3">{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentConfigExample}</code></pre>
		</div>
	</section>

	<section id="content-modes" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Content Modes</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			Pick the storage model first. That usually drives the rest of the config.
		</p>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Mode</th>
						<th class="px-4 py-3 font-medium">Use for</th>
						<th class="px-4 py-3 font-medium">Required fields</th>
						<th class="px-4 py-3 font-medium">Optional fields</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each contentModeRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.mode}</td>
							<td class="px-4 py-3">{row.use}</td>
							<td class="px-4 py-3">{row.requiredFields}</td>
							<td class="px-4 py-3">{row.optionalFields}</td>
							<td class="px-4 py-3">{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentConfigExample}</code></pre>
			</div>
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code>{fileCollectionExample}</code></pre>
			</div>
		</div>
	</section>

	<section id="block-configs" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Block Configs</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			Use built-in primitives for normal fields. Use `type: "block"` when a structured shape needs
			to be reused.
		</p>

		<p class="mt-4 text-sm text-stone-600">
			Built-in block types:
			{#each builtInBlocks as blockType, index}
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-[13px]">{blockType}</code
				>{#if index < builtInBlocks.length - 1}
					<span class="text-stone-400"> </span>
				{/if}
			{/each}
		</p>

		<h3 class="mt-6 text-lg font-semibold text-stone-950">Reusable block config fields</h3>
		<div class="mt-3 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Field</th>
						<th class="px-4 py-3 font-medium">Required</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Purpose</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each blockConfigRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.field}</td>
							<td class="px-4 py-3">{row.required}</td>
							<td class="px-4 py-3 font-mono text-[13px]">{row.type}</td>
							<td class="px-4 py-3">{row.purpose}</td>
							<td class="px-4 py-3">{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<h3 class="mt-6 text-lg font-semibold text-stone-950">Common block usage fields</h3>
		<div class="mt-3 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Field</th>
						<th class="px-4 py-3 font-medium">Required</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Purpose</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each blockUsageRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.field}</td>
							<td class="px-4 py-3">{row.required}</td>
							<td class="px-4 py-3 font-mono text-[13px]">{row.type}</td>
							<td class="px-4 py-3">{row.purpose}</td>
							<td class="px-4 py-3">{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{blockConfigExample}</code></pre>
		</div>
	</section>

	<section id="package-blocks" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Package Blocks</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			Package blocks let you ship reusable block configs from an installed package. The package must
			export a named <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">blockPackage</code>
			object.
		</p>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{packageBlockExample}</code></pre>
		</div>

		<ul class="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-stone-700">
			<li>Each entry in `blockPackage.blocks` is a definition object, not a raw block config.</li>
			<li>The definition must include `config`, and that config must parse as `type: "block"`.</li>
			<li>Package configs must not declare `config.adapter` directly.</li>
			<li>
				An optional `adapter` export may sit next to `config`, and its `type` must match the block
				id.
			</li>
		</ul>
	</section>

	<section id="manual-navigation" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Manual Navigation</h2>
		<div class="mt-4 space-y-4 text-base leading-7 text-stone-700">
			<p>
				Tentman can optionally read and write a conventional JSON manifest at
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
					>tentman/navigation-manifest.json</code
				>. JSON is the only supported manifest format in v1.
			</p>
			<p>
				Top-level manual ordering requires stable top-level content config
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">id</code> values. Manual collection
				ordering also requires
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">idField</code>.
			</p>
			<ul class="list-disc space-y-2 pl-6">
				<li>If a manifest section exists, Tentman uses it first.</li>
				<li>Unlisted existing configs or items are appended in discovered/default order.</li>
				<li>Missing manifest references are ignored.</li>
				<li>Grouped collection navigation is supported in the manifest loader.</li>
				<li>If no manifest exists, Tentman keeps its discovery-based ordering behavior.</li>
			</ul>
			<p>
				In the Tentman UI, enable this from Site settings in the top bar settings menu. Guided setup
				can add missing config ids, explain when collection ordering is blocked by a missing
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">idField</code>, and generate the
				initial manifest from the current discovered order.
			</p>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{navigationManifestExample}</code
				></pre>
		</div>
	</section>

	<section id="custom-adapters" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Custom Adapters</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			Most reusable block configs should use the generated structured adapter. Add a custom adapter
			only when you need custom defaults or validation.
		</p>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200">
			<table class="min-w-full divide-y divide-stone-200 text-sm">
				<thead class="bg-stone-50 text-left text-stone-700">
					<tr>
						<th class="px-4 py-3 font-medium">Export</th>
						<th class="px-4 py-3 font-medium">Required</th>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Purpose</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-200 bg-white text-stone-700">
					{#each adapterRows as row}
						<tr class="align-top">
							<td class="px-4 py-3 font-mono text-[13px] text-stone-900">{row.exportName}</td>
							<td class="px-4 py-3">{row.required}</td>
							<td class="px-4 py-3 font-mono text-[13px]">{row.type}</td>
							<td class="px-4 py-3">{row.purpose}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{customAdapterExample}</code></pre>
		</div>
	</section>

	<section id="discovery" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Discovery and Paths</h2>
		<ul class="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-stone-700">
			{#each pathRules as rule}
				<li>{rule}</li>
			{/each}
		</ul>
	</section>

	<section id="examples" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Examples</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			If you are starting from scratch, most projects only need one or two of these shapes.
		</p>

		<div class="mt-6 space-y-6">
			<div>
				<h3 class="text-lg font-semibold text-stone-950">Directory-backed collection</h3>
				<div class="mt-3 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentConfigExample}</code
						></pre>
				</div>
			</div>

			<div>
				<h3 class="text-lg font-semibold text-stone-950">File-backed collection</h3>
				<div class="mt-3 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code>{fileCollectionExample}</code
						></pre>
				</div>
			</div>

			<div>
				<h3 class="text-lg font-semibold text-stone-950">File-backed singleton</h3>
				<div class="mt-3 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code>{fileSingletonExample}</code
						></pre>
				</div>
			</div>
		</div>
	</section>
</div>
