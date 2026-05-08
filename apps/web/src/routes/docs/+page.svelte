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
		'toggle',
		'image',
		'select'
	];

	const tableOfContents = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'quick-start', label: 'Quick Start' },
		{ id: 'root-config', label: 'Root Config' },
		{ id: 'content-configs', label: 'Content Configs' },
		{ id: 'content-modes', label: 'Content Modes' },
		{ id: 'block-configs', label: 'Block Configs' },
		{ id: 'package-blocks', label: 'Package Blocks' },
		{ id: 'content-components', label: 'Content Components' },
		{ id: 'markdown-components', label: 'Markdown Components' },
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
			field: 'componentsDir',
			required: 'No',
			type: 'string',
			purpose: 'Directory containing repo-local content components.',
			notes:
				'Defaults to `src/lib/content-components`; markdown authoring and preview discovery resolve from here.'
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
			field: 'debug.cacheConfigs',
			required: 'No',
			type: 'boolean',
			purpose: 'Enable or disable the local browser-backed config cache.',
			notes:
				'Defaults to `true`. Set it to `false` while developing when config files change frequently and you want every load to rescan disk.'
		},
		{
			field: 'content.sorting',
			required: 'No',
			type: '"manual"',
			purpose: 'Opt in to top-level manual ordering.',
			notes:
				'When enabled, Tentman writes stable `_tentmanId` values into top-level content configs as needed and uses them in the navigation manifest.'
		},
		{
			field: 'statePresets',
			required: 'No',
			type: 'Record<string, StatePreset>',
			purpose: 'Define reusable state cases that content configs can reference by name.',
			notes:
				'Useful when multiple configs share the same labels and variants, such as Draft or Archived.'
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
			purpose: 'Optional author-defined config identifier.',
			notes:
				'This is no longer Tentman’s internal stable identity for manual ordering. Existing values may be used during migration.'
		},
		{
			field: '_tentmanId',
			required: 'No',
			type: 'string',
			purpose: 'Tentman-managed stable config identifier.',
			notes:
				'Added automatically when you opt into top-level manual ordering with `content.sorting: "manual"`.'
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
			field: 'editorLayout',
			required: 'No',
			type: '{ aside?: string[]; asideLabel?: string }',
			purpose: 'Places selected fields into an editor aside section.',
			notes: 'Use ordered block ids in `aside`. This only affects Tentman editor layout.'
		},
		{
			field: 'collection',
			required: 'No',
			type: 'boolean | { sorting?: "manual"; groups?: CollectionGroupConfig[]; state?: StateConfig }',
			purpose: 'Marks the config as multi-item content.',
			notes:
				'Use `true` for the simple form, or the object form to opt into manual ordering and config-backed groups. Directory mode defaults to collection behavior.'
		},
		{
			field: 'state',
			required: 'No',
			type: 'StateConfig',
			purpose: 'Defines state badges for this config itself.',
			notes:
				'Best for singleton pages or single-document content where the state comes from the top-level content record.'
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
			purpose: 'Author-facing route or slug field for collection items.',
			notes:
				'Recommended for collections and still required for manual collection ordering, but Tentman’s internal stable item identity is `_tentmanId`.'
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
			notes: 'Use `toggle` for on/off settings like Published. `boolean` remains supported.'
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
			field: 'components',
			required: 'No',
			type: 'string[]',
			purpose: 'Enables named content components for this markdown block.',
			notes: 'Only supported on markdown fields.'
		},
		{
			field: 'options',
			required: 'Select only',
			type: 'string[] | { value: string, label: string }[]',
			purpose: 'Configures choices for select fields.',
			notes:
				'Static options stay local to the field. Generic JSON-backed sources are not implemented yet.'
		},
		{
			field: 'collection',
			required: 'tentmanGroup only',
			type: 'string',
			purpose: 'Targets the collection whose groups Tentman should manage.',
			notes:
				'Used by type "tentmanGroup". Tentman stores the selected stable id in _tentmanGroupId.'
		},
		{
			field: 'addOption',
			required: 'tentmanGroup only',
			type: 'boolean',
			purpose: 'Lets authors create a new Tentman group inline.',
			notes:
				'When enabled, Tentman adds the new definition to collection.groups and selects it via _tentmanGroupId.'
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
			field: 'editorLayout',
			required: 'No',
			type: '{ aside?: string[]; asideLabel?: string }',
			purpose: 'Places selected block fields into an editor aside section.',
			notes: 'Useful for reusable meta or settings blocks.'
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
		'If `componentsDir` is set, Tentman only discovers content components inside that directory.',
		'Files whose names start with an underscore are skipped during top-level content discovery.',
		'Manual navigation uses the fixed manifest path `tentman/navigation-manifest.json`.',
		'Opting into manual ordering lets Tentman write stable `_tentmanId` values into configs, collection items, and collection groups when needed.',
		'JSON is the only supported manual navigation manifest format in v1.',
		'Package blocks come from installed packages listed in `root.blockPackages`.',
		'Package blocks are not available in local browser-backed mode yet.',
		'In local mode, custom adapter files must be self-contained ESM JavaScript modules with a `.js` or `.mjs` extension.'
	];

	const rootConfigExample = `{
  "siteName": "Field Notes",
  "blocksDir": "./tentman/blocks",
  "configsDir": "./tentman/configs",
  "componentsDir": "./src/lib/content-components",
  "content": {
    "sorting": "manual"
  },
  "assetsDir": "./static/images",
  "statePresets": {
    "publication": {
      "cases": [
        { "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }
      ]
    }
  },
  "blockPackages": ["@tentman/blocks-media"],
  "netlify": {
    "siteName": "my-site"
  }
}`;

	const contentComponentConfigExample = `{
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
}`;

	const contentComponentRenderExample = `<a class="buy-button buy-button--{{ variant }}" href="{{ href }}">
  {{ label }}
</a>`;

	const contentComponentPreviewExample = `<span class="tm-component-preview tm-component-preview--buy-button">
  Buy button: {{ label }}
</span>`;

	const contentComponentMdsvexExample = `import adapter from '@sveltejs/adapter-auto';
import { mdsvex } from 'mdsvex';
import remarkDirective from 'remark-directive';
import { tentmanComponents } from '@tentman/mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter()
  },
  preprocess: [
    mdsvex({
      extensions: ['.svx', '.md'],
      remarkPlugins: [remarkDirective, tentmanComponents()]
    })
  ],
  extensions: ['.svelte', '.svx', '.md']
};

export default config;`;

	const contentComponentCliExample = `tentman component create buy-button
tentman component create callout-box --kind block
tentman component list
tentman component inspect buy-button
tentman component validate`;

	const contentComponentMarkerExample = `:buy-button[Buy tickets]{href="/tickets" variant="secondary"}`;

	const contentConfigExample = `{
  "type": "content",
  "_tentmanId": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07",
  "label": "Blog Posts",
  "itemLabel": "Blog Post",
  "collection": {
    "sorting": "manual",
    "state": {
      "blockId": "published",
      "preset": "publication",
      "visibility": {
        "header": false
      }
    },
    "groups": [
      {
        "_tentmanId": "tent_01KQD7Q131PWFNF90HG24K63ZD",
        "label": "Featured posts",
        "value": "featured"
      }
    ]
  },
  "idField": "slug",
  "content": {
    "mode": "directory",
    "path": "./src/content/posts",
    "template": "./templates/post.md",
    "filename": "{{slug}}"
  },
  "editorLayout": {
    "aside": ["slug", "date", "published"],
    "asideLabel": "Metadata"
  },
 "blocks": [
    { "id": "title", "type": "text", "label": "Title", "required": true },
    { "id": "slug", "type": "text", "label": "Slug", "required": true },
    { "id": "date", "type": "date", "label": "Publish Date" },
    { "id": "layout", "type": "select", "label": "Layout", "options": ["stack", "inline"] },
    { "id": "published", "type": "toggle", "label": "Published" },
    {
      "type": "tentmanGroup",
      "label": "Group",
      "collection": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07",
      "addOption": true
    },
    { "id": "body", "type": "markdown", "label": "Body", "required": true, "components": ["buy-button", "callout-box"] }
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
  "editorLayout": {
    "aside": ["slug", "role"]
  },
  "blocks": [
    { "id": "name", "type": "text", "label": "Name", "required": true },
    { "id": "slug", "type": "text", "label": "Slug", "required": true },
    { "id": "role", "type": "text", "label": "Role" }
  ]
}`;

	const fileSingletonExample = `{
  "type": "content",
  "label": "About Page",
  "id": "about",
  "state": {
    "blockId": "published",
    "cases": [
      { "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }
    ]
  },
  "content": {
    "mode": "file",
    "path": "./src/content/pages/about.json"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title", "required": true },
    { "id": "intro", "type": "textarea", "label": "Intro", "required": true, "maxLength": 220 },
    { "id": "body", "type": "markdown", "label": "Body", "required": true }
  ]
}`;

	const statePresetExample = `{
  "statePresets": {
    "publication": {
      "cases": [
        { "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }
      ]
    },
    "releaseType": {
      "cases": [
        { "value": "single", "label": "Single", "variant": "accent", "icon": "disc-3" },
        { "value": "ep", "label": "EP", "variant": "muted", "icon": "album" },
        { "value": "album", "label": "Album", "variant": "success", "icon": "vinyl" }
      ]
    }
  }
}`;

	const singletonStateExample = `{
  "type": "content",
  "label": "About Page",
  "state": {
    "blockId": "published",
    "preset": "publication",
    "visibility": {
      "card": false
    }
  },
  "content": {
    "mode": "file",
    "path": "./src/content/pages/about.json"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title" },
    { "id": "published", "type": "toggle", "label": "Published" }
  ]
}`;

	const collectionStateExample = `{
  "type": "content",
  "label": "Blog Posts",
  "itemLabel": "Blog Post",
  "collection": {
    "state": {
      "blockId": "published",
      "preset": "publication"
    }
  },
  "content": {
    "mode": "directory",
    "path": "./src/content/posts",
    "template": "./templates/post.md"
  },
  "blocks": [
    { "id": "title", "type": "text", "label": "Title" },
    { "id": "published", "type": "toggle", "label": "Published" }
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

	const markdownComponentEditorExample = `{
  "id": "buy-button",
  "name": "buy-button",
  "kind": "inline",
  "editor": {
    "toolbarLabel": "Buy Button",
    "dialogTitle": "Buy button",
    "submitLabel": "Save buy button"
  },
  "attributes": {
    "href": {
      "type": "string",
      "required": true,
      "editor": {
        "label": "URL",
        "control": "url"
      }
    },
    "label": {
      "type": "string",
      "default": "Buy online",
      "editor": {
        "hidden": true
      }
    }
  }
}`;

	const navigationManifestExample = `{
  "version": 1,
  "content": {
    "items": [
      { "id": "tent_01KQD7Q12XGD83Y8S1TAHW40G3", "label": "About Page", "slug": "about" },
      { "id": "tent_01KQD7Q1301SNN4W42XV2XYA17", "label": "Contact Page", "slug": "contact" },
      { "id": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07", "label": "Blog Posts", "slug": "blog" }
    ]
  },
  "collections": {
    "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07": {
      "id": "tent_01KQD7Q12YAMHFJ3FWHBQ16Z07",
      "label": "Blog Posts",
      "slug": "blog",
      "items": [
        { "id": "tent_01KQD7Q12ZHBTXG669982DV00K", "label": "Testing content workflows", "slug": "testing-content-workflows" },
        { "id": "tent_01KQD7Q12ZH61M4XHDTEQ5MV98", "label": "Designing a realistic fixture", "slug": "designing-a-realistic-fixture" },
        { "id": "tent_01KQD7Q12Y6C3T8QD4JHQ1SWPD", "label": "Blooop", "slug": "blooop" }
      ],
      "groups": [
        {
          "id": "tent_01KQD7Q131PWFNF90HG24K63ZD",
          "label": "Featured posts",
          "value": "featured",
          "items": [
            { "id": "tent_01KQD7Q12ZHBTXG669982DV00K", "label": "Testing content workflows" },
            { "id": "tent_01KQD7Q12ZH61M4XHDTEQ5MV98", "label": "Designing a realistic fixture" }
          ]
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
				<li>
					Only opt into manual ordering when you need it. Tentman will add stable
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
					values during setup instead of requiring you to author them up front.
				</li>
			</ol>
		</div>
	</section>

	<section id="root-config" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Root Config</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			The root <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">.tentman.json</code> file is optional.
			Keep it for project-wide defaults like discovery paths, preview links, and package blocks.
		</p>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			If you turn on top-level manual ordering with
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">content.sorting: "manual"</code>,
			Tentman will add stable top-level
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
			values to content configs as part of setup or repair.
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

		<h3 class="mt-6 text-lg font-semibold text-stone-950">Shared State Presets</h3>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			Use <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">statePresets</code> when multiple
			configs should share the same labels, variants, or icons. A content config still chooses its
			own <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">blockId</code>, but it can reuse
			the preset’s cases through
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">preset</code>.
		</p>
		<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{statePresetExample}</code></pre>
		</div>
	</section>

	<section id="content-configs" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Content Configs</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-stone-700">
			A content config describes one editable thing: what it is called, how it is stored, and which
			fields make up the editor.
		</p>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			For manual ordering features, Tentman now owns the stable identity layer. Keep
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">idField</code>
			for author-facing routes or slugs, and let Tentman add
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
			where it needs stable internal references.
		</p>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			State badges are optional. Use top-level
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">state</code> for the config itself,
			and <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">collection.state</code> for
			individual items inside a collection. Visibility is on by default, so
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">visibility</code> is mostly for turning
			a badge off in specific places like navigation, headers, or cards.
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

		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div>
				<h3 class="text-lg font-semibold text-stone-950">Singleton State</h3>
				<p class="mt-3 text-sm leading-6 text-stone-600">
					Use top-level <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">state</code>
					when the content document itself has a status field such as Published.
				</p>
				<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code>{singletonStateExample}</code
						></pre>
				</div>
			</div>
			<div>
				<h3 class="text-lg font-semibold text-stone-950">Collection Item State</h3>
				<p class="mt-3 text-sm leading-6 text-stone-600">
					Use <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">collection.state</code>
					when each item in a collection can have its own state badge, such as Draft posts.
				</p>
				<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code>{collectionStateExample}</code
						></pre>
				</div>
			</div>
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

		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			`toggle` stores a boolean value and renders as an accessible switch. It is a good fit for
			on/off states such as published flags, feature switches, or visibility settings.
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

	<section id="content-components" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Content Components</h2>
		<div class="mt-4 space-y-4 text-base leading-7 text-stone-700">
			<p>
				Content components are the preferred source-authoring model for reusable markdown content
				when you want to store semantic markers instead of final HTML.
			</p>
			<p>
				By default, Tentman discovers components in
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">src/lib/content-components</code>.
				Set
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">componentsDir</code>
				in the root config when a repo uses a different location.
			</p>
		</div>

		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code
						>src/lib/content-components/
  buy-button/
    component.json
    render.njk
    preview.njk</code
					></pre>
			</div>
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code
						>{contentComponentConfigExample}</code
					></pre>
			</div>
		</div>

		<ul class="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-stone-700">
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">component.json</code> defines the stable
				component contract.
			</li>
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">id</code> and
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">name</code> are required strings.
			</li>
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">kind</code> may be
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">inline</code> or
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">block</code> and defaults to
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">inline</code>.
			</li>
			<li>
				Attributes support
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">type</code>,
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">required</code>,
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">default</code>,
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">options</code> for enums, and
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">valueFromMarkdownLabel</code>.
			</li>
			<li>Only one attribute may opt into markdown-label binding.</li>
			<li>
				The current schema supports
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">string</code> and
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">enum</code> attributes.
			</li>
		</ul>

		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div>
				<h3 class="text-lg font-semibold text-stone-950">render.njk</h3>
				<p class="mt-3 text-sm leading-6 text-stone-600">
					Produces the final site output during the markdown build.
				</p>
				<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code
							>{contentComponentRenderExample}</code
						></pre>
				</div>
			</div>
			<div>
				<h3 class="text-lg font-semibold text-stone-950">preview.njk</h3>
				<p class="mt-3 text-sm leading-6 text-stone-600">
					Produces the safe authoring preview shown inside Tentman.
				</p>
				<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
					<pre class="p-4 text-sm leading-6 text-stone-100"><code
							>{contentComponentPreviewExample}</code
						></pre>
				</div>
			</div>
		</div>

		<p class="mt-6 max-w-3xl text-sm leading-6 text-stone-600">
			Both templates receive the normalized attribute map. Stored markdown remains semantic, so
			changing either template updates every existing instance the next time the site or Tentman
			preview rebuilds.
		</p>

		<h3 class="mt-6 text-lg font-semibold text-stone-950">mdsvex Setup</h3>
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			For mdsvex-based sites, install
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">@tentman/mdsvex</code>
			and
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">remark-directive</code>, then add
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">tentmanComponents()</code>
			to the mdsvex remark configuration.
		</p>
		<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentComponentMdsvexExample}</code
				></pre>
		</div>

		<h3 class="mt-6 text-lg font-semibold text-stone-950">Authoring Markers</h3>
		<div class="mt-3 space-y-3 text-sm leading-6 text-stone-600">
			<p>
				Inline content components use semantic directive markers such as
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
					>{contentComponentMarkerExample}</code
				>.
			</p>
			<p>
				Tentman writes all active non-label attributes explicitly, sorts attributes alphabetically,
				avoids duplicating the markdown label into an attribute, and canonicalizes quoting and
				escaping on serialization.
			</p>
		</div>

		<h3 class="mt-6 text-lg font-semibold text-stone-950">CLI Workflow</h3>
		<div class="mt-4 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentComponentCliExample}</code
				></pre>
		</div>
		<ul class="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-stone-700">
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">create</code> scaffolds
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">component.json</code>,
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">render.njk</code>, and
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">preview.njk</code>.
			</li>
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">list</code> shows discovered components
				and attribute counts.
			</li>
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">inspect</code> shows resolved file paths
				and normalized attribute definitions.
			</li>
			<li>
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">validate</code> reports schema errors
				and duplicate registry ids or names.
			</li>
		</ul>
	</section>

	<section id="markdown-components" class="scroll-mt-24 border-t border-stone-200 py-8">
		<h2 class="text-2xl font-semibold text-stone-950">Markdown Components</h2>
		<div class="mt-4 space-y-4 text-base leading-7 text-stone-700">
			<p>
				Content components extend individual markdown fields with rich editor atoms, toolbar
				actions, dialogs, markdown serialization, and Tentman preview rendering.
			</p>
			<p>
				Discover components from
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">componentsDir</code>, then opt
				in per markdown block with
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">components</code>.
			</p>
		</div>

		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code>{rootConfigExample}</code></pre>
			</div>
			<div class="overflow-x-auto rounded border border-stone-200 bg-stone-950">
				<pre class="p-4 text-sm leading-6 text-stone-100"><code>{contentConfigExample}</code></pre>
			</div>
		</div>

		<div class="mt-6 overflow-x-auto rounded border border-stone-200 bg-stone-950">
			<pre class="p-4 text-sm leading-6 text-stone-100"><code>{markdownComponentEditorExample}</code></pre>
		</div>

		<ul class="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-stone-700">
			<li>
				Component definitions stay declarative. Editor copy and control choices come from
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">component.json</code>, not
				custom runtime hooks.
			</li>
			<li>
				Inline components use directive markers such as
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">:buy-button[Buy tickets]&#123;href="/tickets"&#125;</code>.
				If no attribute uses
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">valueFromMarkdownLabel</code>,
				Tentman serializes
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">:name&#123;...&#125;</code>
				without empty brackets.
			</li>
			<li>
				Block components use standalone block atoms such as
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">::callout-box&#123;title="Latest update"&#125;</code>.
			</li>
			<li>
				The consumer site renders directives through component templates. Use
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">@tentman/mdsvex</code> with
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">remark-directive</code> in
				mdsvex-based sites.
			</li>
			<li>
				Site styling also belongs to the consumer site. Style the rendered markup from
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">render.njk</code>
				templates in the site layer.
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
				Top-level manual ordering is enabled with root
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">content.sorting: "manual"</code>.
				Tentman uses top-level config
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
				values internally, while manual collection ordering is enabled with
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm"
					>collection: {'{'} "sorting": "manual" {'}'}</code
				>
				and still uses an author-facing
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">idField</code>
				for routes/slugs.
			</p>
			<p>
				You do not need to add these stable ids by hand first. When you opt into top-level or
				collection manual ordering, Tentman can write missing
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
				values into content configs, collection items, and config-backed groups, repair duplicates, and
				rewrite legacy manifest references during setup.
			</p>
			<ul class="list-disc space-y-2 pl-6">
				<li>If a manifest section exists, Tentman uses it first.</li>
				<li>Unlisted existing configs or items are appended in discovered/default order.</li>
				<li>Missing manifest references are ignored.</li>
				<li>Grouped collection navigation is supported in the manifest loader.</li>
				<li>
					Use <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">type: "tentmanGroup"</code>
					for Tentman-owned collection grouping. Set
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">collection</code>
					to the content config id or Tentman id.
				</li>
				<li>
					When
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">addOption: true</code> is set,
					Tentman lets authors add groups inline and stores the definition in
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">collection.groups</code>.
				</li>
				<li>Generic JSON-backed select option sources are intentionally not implemented yet.</li>
				<li>
					Saving a <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">tentmanGroup</code>
					field writes
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanGroupId</code>. Group
					definitions carry a human-facing
					<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">label</code> plus a
					developer-facing <code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">value</code>.
				</li>
				<li>If no manifest exists, Tentman keeps its discovery-based ordering behavior.</li>
			</ul>
			<p>
				In the Tentman UI, enable this from Site settings in the top bar settings menu. Guided setup
				can add or repair
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
				values, migrate legacy group definitions into
				<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">collection.groups</code>, explain
				when collection ordering is blocked by a missing
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
		<p class="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
			These examples show the steady-state config shapes. If you enable manual ordering later,
			Tentman can add or reconcile the stable
			<code class="rounded bg-stone-100 px-1.5 py-0.5 text-sm">_tentmanId</code>
			values it needs instead of requiring a manual migration first.
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
