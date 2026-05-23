export type DocsSectionId = 'getting-started' | 'guides' | 'reference' | 'examples';

export interface DocsLink {
	label: string;
	href: string;
	description?: string;
}

export interface DocsTable {
	columns: string[];
	rows: string[][];
}

export interface DocsCodeExample {
	title?: string;
	description?: string;
	code: string;
	language?: string;
}

export type DocsContentBlock =
	| {
			kind: 'rich-text';
			html: string;
	  }
	| {
			kind: 'table';
			table: DocsTable;
	  }
	| {
			kind: 'code';
			code: string;
			language?: string;
			title?: string;
			description?: string;
	  }
	| {
			kind: 'code-grid';
			items: DocsCodeExample[];
	  }
	| {
			kind: 'link-list';
			title?: string;
			links: DocsLink[];
	  };

export interface DocsContentSection {
	id: string;
	title: string;
	description?: string;
	blocks: DocsContentBlock[];
}

export interface DocsPage {
	id: string;
	section: DocsSectionId;
	slug: string;
	href: string;
	title: string;
	sidebarTitle?: string;
	description: string;
	intro?: string;
	related?: DocsLink[];
	sections: DocsContentSection[];
}

export interface DocsNavItem {
	title: string;
	href?: string;
	pageId?: string;
	children?: DocsNavItem[];
}

export interface DocsNavGroup {
	id: DocsSectionId;
	title: string;
	children: DocsNavItem[];
}

type TableRow = {
	field?: string;
	required?: string;
	type?: string;
	purpose?: string;
	notes?: string;
	mode?: string;
	use?: string;
	requiredFields?: string;
	optionalFields?: string;
	exportName?: string;
};

function docsHref(slug: string): string {
	return `/docs/${slug}`;
}

function ref(slug: string, label: string): string {
	return `<a class="font-medium text-stone-900 underline decoration-stone-300 underline-offset-3 transition hover:decoration-stone-900" href="${docsHref(
		slug
	)}">${label}</a>`;
}

function inlineCode(value: string): string {
	return `<code class="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] text-stone-900">${value}</code>`;
}

function table(columns: string[], rows: string[][]): DocsContentBlock {
	return {
		kind: 'table',
		table: {
			columns,
			rows
		}
	};
}

function fiveColumnRows(
	rows: Required<Pick<TableRow, 'field' | 'required' | 'type' | 'purpose' | 'notes'>>[]
) {
	return rows.map((row) => [row.field, row.required, row.type, row.purpose, row.notes]);
}

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

const rootRows = fiveColumnRows([
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
		notes: 'Useful when a repo contains unrelated *.tentman.json files.'
	},
	{
		field: 'assetsDir',
		required: 'No',
		type: 'string',
		purpose: 'Provide a default image upload path.',
		notes: 'A block can still override this locally with its own assetsDir.'
	},
	{
		field: 'componentsDir',
		required: 'No',
		type: 'string',
		purpose: 'Directory containing repo-local content components.',
		notes: 'Defaults to src/lib/content-components.'
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
		field: 'validation.contentComponents',
		required: 'No',
		type: '"permissive" | "strict"',
		purpose: 'Choose how aggressively markdown component references are validated.',
		notes: 'Use strict mode when you want unresolved component markers to fail fast.'
	},
	{
		field: 'debug.cacheConfigs',
		required: 'No',
		type: 'boolean',
		purpose: 'Enable or disable the local browser-backed config cache.',
		notes: 'Defaults to true.'
	},
	{
		field: 'content.sorting',
		required: 'No',
		type: '"manual"',
		purpose: 'Opt in to top-level manual ordering.',
		notes:
			'Tentman writes stable _tentmanId values as needed and uses them in the navigation manifest.'
	},
	{
		field: 'statePresets',
		required: 'No',
		type: 'Record<string, StatePreset>',
		purpose: 'Define reusable state cases that content configs can reference by name.',
		notes: 'Useful when multiple configs share the same labels and variants.'
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
]);

const contentRows = fiveColumnRows([
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
		notes: 'No longer Tentman’s internal stable identity for manual ordering.'
	},
	{
		field: '_tentmanId',
		required: 'No',
		type: 'string',
		purpose: 'Tentman-managed stable config identifier.',
		notes: 'Added automatically when you opt into top-level manual ordering.'
	},
	{
		field: 'content',
		required: 'Yes',
		type: 'object',
		purpose: 'Defines how the content is stored.',
		notes: 'Pick file or directory.'
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
		notes: 'Use ordered block ids in aside.'
	},
	{
		field: 'collection',
		required: 'No',
		type: 'boolean | { sorting?: "manual"; groups?: CollectionGroupConfig[]; state?: StateConfig }',
		purpose: 'Marks the config as multi-item content.',
		notes:
			'Use true for the simple form, or the object form to opt into manual ordering and groups.'
	},
	{
		field: 'state',
		required: 'No',
		type: 'StateConfig',
		purpose: 'Defines state badges for this config itself.',
		notes: 'Best for singleton pages or single-document content.'
	},
	{
		field: 'itemLabel',
		required: 'Sometimes',
		type: 'string',
		purpose: 'Singular label for one item in a collection.',
		notes: 'Required when collection: true is explicitly set.'
	},
	{
		field: 'idField',
		required: 'No',
		type: 'string',
		purpose: 'Author-facing route or slug field for collection items.',
		notes: 'Still recommended for collections even though Tentman uses _tentmanId internally.'
	}
]);

const blockUsageRows = fiveColumnRows([
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
		purpose: 'Primitive type, inline block, or reusable block id.',
		notes: 'Use toggle for on/off settings like Published.'
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
		notes: 'Helpful when collection: true.'
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
		type: 'string[] | { value: string; label: string }[]',
		purpose: 'Configures choices for select fields.',
		notes: 'Static options stay local to the field.'
	},
	{
		field: 'collection',
		required: 'tentmanGroup only',
		type: 'string',
		purpose: 'Targets the collection whose groups Tentman should manage.',
		notes: 'Used by type "tentmanGroup".'
	},
	{
		field: 'addOption',
		required: 'tentmanGroup only',
		type: 'boolean',
		purpose: 'Lets authors create a new Tentman group inline.',
		notes: 'Tentman adds the new definition to collection.groups.'
	},
	{
		field: 'generated',
		required: 'No',
		type: 'boolean',
		purpose: 'Allows some flows to generate the field automatically.',
		notes: 'Relevant when used with collection ids in file-backed content.'
	},
	{
		field: 'referenceFor',
		required: 'No',
		type: 'string | string[]',
		purpose: 'Lets a block act as a source for markdown component references.',
		notes: 'Useful for marker-only component insertion into markdown.'
	},
	{
		field: 'referenceLabel',
		required: 'No',
		type: 'boolean',
		purpose: 'Uses the field value as the human-facing label for a reference.',
		notes: 'Supported on a subset of text-style block types.'
	}
]);

const blockConfigRows = fiveColumnRows([
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
		notes: 'Required when collection: true is explicitly set.'
	},
	{
		field: 'adapter',
		required: 'No',
		type: 'string',
		purpose: 'Path to a custom adapter module.',
		notes: 'Only use this when the generated structured adapter is not enough.'
	}
]);

const contentModeRows = [
	[
		'file',
		'One file, with JSON inferred from .json and markdown-frontmatter inferred from .md or .markdown.',
		'path',
		'itemsPath',
		'Use itemsPath when a JSON array is nested inside a larger object.'
	],
	[
		'directory',
		'One file per content item.',
		'path, template',
		'filename',
		'Good for posts, docs, or any file-backed collection.'
	],
	[
		'embedded',
		'Nested/internal modeling only.',
		'n/a',
		'n/a',
		'Not supported for top-level type: "content" configs by the current parser.'
	]
];

const adapterRows = [
	['adapter.type', 'Yes', 'string', 'Must match the block config id exactly.'],
	['adapter.getDefaultValue', 'Yes', 'function', 'Returns the initial value for the block.'],
	[
		'adapter.validate',
		'No',
		'function',
		'Returns validation errors when custom validation is needed.'
	]
];

const collectionGroupRows = [
	[
		'_tentmanId',
		'No',
		'string',
		'Tentman-managed stable group identifier.',
		'Added when grouped collection ordering needs stable identities.'
	],
	[
		'label',
		'Yes',
		'string',
		'Human-facing label shown in navigation and editors.',
		'This is the visible name authors work with.'
	],
	[
		'value',
		'No',
		'string',
		'Developer-facing value stored in content.',
		'Useful when the UI label should differ from the serialized value.'
	]
];

const stateConfigRows = [
	[
		'blockId',
		'Yes',
		'string',
		'Points to the field whose value determines the current state.',
		'The referenced block usually stores a toggle, select, or enum-like value.'
	],
	[
		'preset',
		'No',
		'string',
		'References a reusable StatePreset from the root config.',
		'Useful when several content types share the same badge cases.'
	],
	[
		'cases',
		'No',
		'StateCase[]',
		'Defines inline state badge mappings.',
		'Use this when the state rules are local to one config.'
	],
	[
		'visibility',
		'No',
		'{ navigation?: boolean; header?: boolean; card?: boolean }',
		'Turns state badges on or off in specific UI surfaces.',
		'Visibility is on by default.'
	]
];

const statePresetRows = [
	[
		'cases',
		'Yes',
		'StateCase[]',
		'Defines the reusable set of values, labels, variants, and icons.',
		'Referenced from StateConfig.preset.'
	]
];

const editorLayoutRows = [
	[
		'aside',
		'No',
		'string[]',
		'Lists block ids that should render in the side panel.',
		'Order matters. Unknown ids are invalid.'
	],
	[
		'asideLabel',
		'No',
		'string',
		'Custom label for the editor aside.',
		'Useful when the aside groups metadata or settings.'
	]
];

const pathRules = [
	'Root config paths resolve relative to tentman.json.',
	'Content storage paths resolve relative to the config file that declares them.',
	'Custom adapter paths resolve relative to the reusable block config file that declares them.',
	'If configsDir is set, Tentman only discovers top-level content configs inside that directory.',
	'If blocksDir is set, Tentman discovers reusable block configs there and excludes them from top-level content discovery.',
	'If componentsDir is set, Tentman only discovers content components inside that directory.',
	'Files whose names start with an underscore are skipped during top-level content discovery.',
	'Manual navigation uses the fixed manifest path tentman/navigation-manifest.json.',
	'Opting into manual ordering lets Tentman write stable _tentmanId values into configs, collection items, and collection groups when needed.',
	'JSON is the only supported manual navigation manifest format in v1.',
	'Package blocks come from installed packages listed in root.blockPackages.',
	'Package blocks are not available in local browser-backed mode yet.',
	'In local mode, custom adapter files must be self-contained ESM JavaScript modules with a .js or .mjs extension.'
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
      "id": "tentmanGroup",
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

const faqExample = `{
  "type": "content",
  "label": "FAQ",
  "itemLabel": "Question",
  "collection": {
    "sorting": "manual"
  },
  "content": {
    "mode": "file",
    "path": "./src/content/faq.json",
    "itemsPath": "$.items"
  },
  "blocks": [
    { "id": "question", "type": "text", "label": "Question", "required": true },
    { "id": "answer", "type": "markdown", "label": "Answer", "required": true },
    { "id": "section", "type": "select", "label": "Section", "options": ["General", "Billing", "Support"] }
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
        { "id": "tent_01KQD7Q12ZH61M4XHDTEQ5MV98", "label": "Designing a realistic fixture", "slug": "designing-a-realistic-fixture" }
      ],
      "groups": [
        {
          "id": "tent_01KQD7Q131PWFNF90HG24K63ZD",
          "label": "Featured posts",
          "value": "featured",
          "items": [
            { "id": "tent_01KQD7Q12ZHBTXG669982DV00K", "label": "Testing content workflows" }
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

const docsPages: DocsPage[] = [
	{
		id: 'getting-started-blog-posts',
		section: 'getting-started',
		slug: 'getting-started/blog-posts',
		href: docsHref('getting-started/blog-posts'),
		title: 'Blog posts',
		description: 'Set up a simple blog-post collection with the smallest useful Tentman shape.',
		intro:
			'This page is the shortest path to a working Tentman setup. It uses a blog-post collection because it exercises the main moving parts without introducing too many edge cases.',
		related: [
			{ label: 'ContentConfig reference', href: docsHref('reference/content-config') },
			{ label: 'content reference', href: docsHref('reference/content') },
			{ label: 'blocks reference', href: docsHref('reference/block-usage') },
			{ label: 'Reusability guide', href: docsHref('guides/reusability') }
		],
		sections: [
			{
				id: 'overview',
				title: 'What you are building',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>You are creating one ${inlineCode('type: "content"')} config for a collection of blog posts, stored in a directory with one file per post. Tentman reads the config, builds the editor from ${inlineCode(
							'blocks'
						)}, and stores each post according to the nested ${inlineCode('content')} object.</p>
<p>The first version should stay intentionally simple. Keep things inline, skip extra reuse for now, and only extract a reusable block or preset when you start repeating yourself. If you want the conceptual model first, see ${ref(
							'guides/how-tentman-works',
							'How Tentman works'
						)}.</p>`
					}
				]
			},
			{
				id: 'steps',
				title: 'Step by step',
				blocks: [
					{
						kind: 'rich-text',
						html: `<ol class="list-decimal space-y-3 pl-5">
<li>Add an optional ${inlineCode('tentman.json')} file if you want shared defaults like discovery paths or state presets.</li>
<li>Create a content config, often under ${inlineCode('tentman/configs/posts.tentman.json')}.</li>
<li>Use ${inlineCode('content.mode: "directory"')} so each post lives in its own file.</li>
<li>Define a few blocks such as title, slug, publish date, published, and body.</li>
<li>Only add reusable blocks, state presets, or package blocks once you notice repetition.</li>
</ol>`
					}
				]
			},
			{
				id: 'example',
				title: 'Minimal working example',
				description: 'A practical first config with a metadata aside and a markdown body.',
				blocks: [
					{
						kind: 'code',
						code: contentConfigExample,
						language: 'json'
					}
				]
			},
			{
				id: 'next-steps',
				title: 'Where to go next',
				blocks: [
					{
						kind: 'link-list',
						title: 'Next reads',
						links: [
							{
								label: 'Guides / Content configs',
								href: docsHref('guides/content-configs'),
								description: 'Understand how to split content into one or more configs.'
							},
							{
								label: 'Reference / ContentConfig',
								href: docsHref('reference/content-config'),
								description: 'See every field on the top-level content config object.'
							},
							{
								label: 'Examples / Directory collection',
								href: docsHref('examples/directory-collection'),
								description: 'See the same overall pattern without the step-by-step framing.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'guides-how-tentman-works',
		section: 'guides',
		slug: 'guides/how-tentman-works',
		href: docsHref('guides/how-tentman-works'),
		title: 'How Tentman works',
		description: 'A conceptual map of the main Tentman pieces and how they fit together.',
		intro:
			'Tentman is easiest to understand when you separate structure from storage: configs define the editor shape, and the nested content object defines where the data lives.',
		related: [
			{ label: 'Blog posts getting started', href: docsHref('getting-started/blog-posts') },
			{ label: 'ContentConfig reference', href: docsHref('reference/content-config') }
		],
		sections: [
			{
				id: 'model',
				title: 'The core model',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Tentman reads ${inlineCode('*.tentman.json')} files, builds forms from ${inlineCode(
							'blocks'
						)}, and stores data according to the nested ${inlineCode('content')} object.</p>
<ul class="list-disc space-y-2 pl-5">
<li>Use one ${inlineCode('type: "content"')} config per editable domain.</li>
<li>Keep the first version inline and simple.</li>
<li>Extract a ${inlineCode('type: "block"')} only when a grouped structure repeats.</li>
<li>Add a custom adapter only when the generated structured adapter is not enough.</li>
</ul>`
					}
				]
			},
			{
				id: 'parts',
				title: 'The main parts',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${ref('reference/root-config', 'RootConfig')} is optional and gives you project-wide defaults. ${ref(
							'reference/content-config',
							'ContentConfig'
						)} describes one editable thing. ${ref('reference/block-usage', 'BlockUsage')} defines individual fields inside a form. ${ref(
							'reference/block-config',
							'BlockConfig'
						)} is the extraction mechanism when a structured set of fields needs to be reused.</p>
<p>For storage, start with ${ref('reference/content-modes', 'Content modes')}. That choice usually drives the rest of the config. For many sites the initial decision is just ${inlineCode(
							'file'
						)} versus ${inlineCode('directory')}.</p>`
					}
				]
			}
		]
	},
	{
		id: 'guides-content-configs',
		section: 'guides',
		slug: 'guides/content-configs',
		href: docsHref('guides/content-configs'),
		title: 'Content configs',
		description:
			'How to think about a content config before you dive into the field-by-field reference.',
		related: [
			{ label: 'Reference / ContentConfig', href: docsHref('reference/content-config') },
			{ label: 'Reference / content', href: docsHref('reference/content') },
			{ label: 'Reference / collection', href: docsHref('reference/collection') },
			{ label: 'Examples / Single page', href: docsHref('examples/single-page') }
		],
		sections: [
			{
				id: 'scope',
				title: 'Choose the editable domain',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>A content config describes one editable thing: what it is called, how it is stored, and which fields make up the editor. The main design choice is not syntax, it is scope.</p>
<p>Ask: does this deserve its own editing surface and storage model? Blog posts, team members, an about page, or FAQs often become separate content configs because they have different storage needs and different authoring fields.</p>`
					}
				]
			},
			{
				id: 'singleton-vs-collection',
				title: 'Singleton or collection',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Use a singleton-style config when you are editing one thing, such as an About page. Use ${inlineCode(
							'collection'
						)} when you are editing many similar items, such as posts, FAQs, or team members. Directory mode often pairs naturally with collections, while file mode works well for single pages and JSON-backed arrays.</p>
<p>The exact fields are documented in ${ref('reference/content-config', 'ContentConfig')}, but the mental model matters more: a content config is the editor contract for one domain.</p>`
					},
					{
						kind: 'link-list',
						title: 'Useful follow-ups',
						links: [
							{
								label: 'content',
								href: docsHref('reference/content'),
								description:
									'Choose where the data actually lives once you know the domain deserves its own config.'
							},
							{
								label: 'collection',
								href: docsHref('reference/collection'),
								description:
									'Add repeated-item behavior, grouping, and item-level state when the domain becomes many items.'
							},
							{
								label: 'Examples / Blog posts',
								href: docsHref('examples/blog-posts'),
								description:
									'See a fuller content config where storage, collection behavior, and editor structure all come together.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'guides-blocks',
		section: 'guides',
		slug: 'guides/blocks',
		href: docsHref('guides/blocks'),
		title: 'Blocks',
		description:
			'How to decide between primitive fields, inline structured blocks, and reusable blocks.',
		related: [
			{ label: 'Reference / BlockUsage', href: docsHref('reference/block-usage') },
			{ label: 'Reference / BlockConfig', href: docsHref('reference/block-config') },
			{ label: 'Guide / Reusability', href: docsHref('guides/reusability') }
		],
		sections: [
			{
				id: 'decision',
				title: 'Start simple',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Use built-in primitives for normal fields. Use ${inlineCode(
							'type: "block"'
						)} when a structured shape needs to be reused. If the grouped structure only exists in one content config, keeping it inline is usually easier to read and maintain.</p>
<p>Built-in block types currently include ${builtInBlocks
							.map((blockType) => inlineCode(blockType))
							.join(', ')}.</p>`
					}
				]
			},
			{
				id: 'when-to-extract',
				title: 'When to extract a reusable block',
				blocks: [
					{
						kind: 'rich-text',
						html: `<ul class="list-disc space-y-2 pl-5">
<li>Extract when the same grouped structure appears in more than one config.</li>
<li>Keep it inline when the shape is local and easier to understand in context.</li>
<li>Reach for a custom adapter only when defaults or validation need behavior the generated adapter cannot express.</li>
</ul>`
					},
					{
						kind: 'link-list',
						title: 'Reference handoff',
						links: [
							{
								label: 'BlockUsage',
								href: docsHref('reference/block-usage'),
								description:
									'Use this for primitive fields and the common properties every block entry can take.'
							},
							{
								label: 'BlockConfig',
								href: docsHref('reference/block-config'),
								description:
									'Use this once the grouped shape needs to become a reusable local block.'
							},
							{
								label: 'Package blocks',
								href: docsHref('reference/package-blocks'),
								description:
									'Only jump here when the block system needs to move between repositories.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'guides-collections',
		section: 'guides',
		slug: 'guides/collections',
		href: docsHref('guides/collections'),
		title: 'Collections',
		description:
			'How collections, item labels, sorting, groups, and item-level state fit together.',
		related: [
			{ label: 'Reference / collection', href: docsHref('reference/collection') },
			{
				label: 'Reference / CollectionGroupConfig',
				href: docsHref('reference/collection-group-config')
			},
			{ label: 'Examples / FAQ', href: docsHref('examples/faq') },
			{ label: 'Examples / Blog posts', href: docsHref('examples/blog-posts') }
		],
		sections: [
			{
				id: 'shapes',
				title: 'The two collection shapes',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Use ${inlineCode('collection: true')} when you just need repeated items. Switch to the object form when you need manual sorting, config-backed groups, or item-level state badges.</p>
<p>Grouped collection navigation is Tentman-owned. When you use ${inlineCode(
							'type: "tentmanGroup"'
						)} blocks and ${inlineCode('collection.groups')}, Tentman can manage those definitions and wire them into manual navigation.</p>`
					},
					{
						kind: 'link-list',
						title: 'Choose the next page by complexity',
						links: [
							{
								label: 'FAQ example',
								href: docsHref('examples/faq'),
								description:
									'Start here when the collection is small and mostly just repeats question-and-answer items.'
							},
							{
								label: 'Blog posts example',
								href: docsHref('examples/blog-posts'),
								description:
									'Use this when the collection needs manual ordering, grouping, or richer per-item metadata.'
							},
							{
								label: 'CollectionGroupConfig',
								href: docsHref('reference/collection-group-config'),
								description:
									'Open the exact type page only when you are defining reusable group options.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'guides-state',
		section: 'guides',
		slug: 'guides/state',
		href: docsHref('guides/state'),
		title: 'State',
		description: 'How config-level state, item-level state, and reusable presets relate.',
		related: [
			{ label: 'Reference / state', href: docsHref('reference/state') },
			{ label: 'Reference / StateConfig', href: docsHref('reference/state-config') },
			{ label: 'Reference / StatePreset', href: docsHref('reference/state-preset') },
			{ label: 'Examples / Blog posts', href: docsHref('examples/blog-posts') }
		],
		sections: [
			{
				id: 'placement',
				title: 'Where state lives',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Use top-level ${inlineCode('state')} when the content document itself has a status field such as Published. Use ${inlineCode(
							'collection.state'
						)} when each item in a collection can carry its own badge, such as Draft posts.</p>
<p>If several configs should share the same labels, variants, or icons, move the cases into ${inlineCode(
							'root.statePresets'
						)} and reference the preset by name.</p>`
					}
				]
			},
			{
				id: 'choose-the-shape',
				title: 'How to choose the shape',
				blocks: [
					{
						kind: 'link-list',
						title: 'Reach for the smallest thing that fits',
						links: [
							{
								label: 'Inline state',
								href: docsHref('reference/state'),
								description:
									'Use the nested state property when only one config or collection needs the badge mapping.'
							},
							{
								label: 'Shared preset',
								href: docsHref('reference/state-preset'),
								description:
									'Extract repeated cases into root.statePresets once multiple configs should share the same labels or variants.'
							},
							{
								label: 'Exact type shape',
								href: docsHref('reference/state-config'),
								description:
									'Use StateConfig when you need the precise object contract rather than the placement guidance.'
							}
						]
					}
				]
			},
			{
				id: 'examples',
				title: 'Examples',
				blocks: [
					{
						kind: 'code-grid',
						items: [
							{
								title: 'Singleton state',
								description: 'Use top-level state when the whole document has one status.',
								code: singletonStateExample,
								language: 'json'
							},
							{
								title: 'Collection item state',
								description: 'Use collection.state when each item can have its own badge.',
								code: collectionStateExample,
								language: 'json'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'guides-reusability',
		section: 'guides',
		slug: 'guides/reusability',
		href: docsHref('guides/reusability'),
		title: 'Reusability',
		description:
			'What can be extracted or reused in Tentman, and when that extra abstraction is worth it.',
		related: [
			{ label: 'Reference / BlockConfig', href: docsHref('reference/block-config') },
			{ label: 'Reference / StatePreset', href: docsHref('reference/state-preset') },
			{ label: 'Reference / Package blocks', href: docsHref('reference/package-blocks') },
			{ label: 'Reference / Content components', href: docsHref('reference/content-components') }
		],
		sections: [
			{
				id: 'what-can-be-reused',
				title: 'What can be reused',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>The main reusable building blocks are:</p>
<ul class="list-disc space-y-2 pl-5">
<li>${inlineCode('type: "block"')} reusable blocks for structured field groups.</li>
<li>${inlineCode('statePresets')} for shared badge cases.</li>
<li>${inlineCode('blockPackages')} for shipping reusable blocks from packages.</li>
<li>Content components and markdown components for reusable semantic authoring primitives.</li>
</ul>`
					}
				]
			},
			{
				id: 'when-to-extract',
				title: 'When to leave things inline',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>If a block group, state case map, or markdown component contract only appears once, keep it local until repetition becomes real. Tentman is easier to learn when the first version of a config is visible in one place.</p>
<p>A good rule of thumb is: keep page-local structure inside one config, extract shared editorial patterns one level up, and only package something once it must travel between repos.</p>`
					},
					{
						kind: 'link-list',
						title: 'Typical extraction path',
						links: [
							{
								label: 'Start inline with BlockUsage',
								href: docsHref('reference/block-usage'),
								description:
									'Model the first version directly in one config so the editorial flow stays visible.'
							},
							{
								label: 'Extract a BlockConfig',
								href: docsHref('reference/block-config'),
								description: 'Move repeated structured field groups into reusable local blocks.'
							},
							{
								label: 'Promote to package blocks',
								href: docsHref('reference/package-blocks'),
								description:
									'Package the pattern only once multiple repos need the same reusable block system.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'reference-root-config',
		section: 'reference',
		slug: 'reference/root-config',
		href: docsHref('reference/root-config'),
		title: 'RootConfig',
		description: 'Project-wide defaults for discovery, previews, validation, and shared presets.',
		related: [
			{ label: 'StatePreset', href: docsHref('reference/state-preset') },
			{ label: 'Package blocks', href: docsHref('reference/package-blocks') },
			{ label: 'Discovery and paths', href: docsHref('reference/discovery-and-paths') }
		],
		sections: [
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], rootRows)]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: rootConfigExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-content-config',
		section: 'reference',
		slug: 'reference/content-config',
		href: docsHref('reference/content-config'),
		title: 'ContentConfig',
		description: 'The top-level config object for an editable domain.',
		related: [
			{ label: 'Guide / Content configs', href: docsHref('guides/content-configs') },
			{ label: 'content', href: docsHref('reference/content') },
			{ label: 'collection', href: docsHref('reference/collection') },
			{ label: 'state', href: docsHref('reference/state') },
			{ label: 'BlockUsage', href: docsHref('reference/block-usage') },
			{ label: 'EditorLayoutConfig', href: docsHref('reference/editor-layout-config') }
		],
		sections: [
			{
				id: 'fields',
				title: 'Fields',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>For manual ordering features, Tentman now owns the stable identity layer. Keep ${inlineCode(
							'idField'
						)} for author-facing routes or slugs, and let Tentman add ${inlineCode(
							'_tentmanId'
						)} where it needs stable internal references.</p>`
					},
					table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], contentRows)
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: contentConfigExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-content',
		section: 'reference',
		slug: 'reference/content',
		href: docsHref('reference/content'),
		title: 'content',
		sidebarTitle: 'content',
		description: 'The nested storage object inside a ContentConfig.',
		related: [
			{ label: 'Content modes', href: docsHref('reference/content-modes') },
			{ label: 'ContentConfig', href: docsHref('reference/content-config') },
			{ label: 'Examples / Directory collection', href: docsHref('examples/directory-collection') },
			{
				label: 'Examples / File-backed collection',
				href: docsHref('examples/file-backed-collection')
			}
		],
		sections: [
			{
				id: 'overview',
				title: 'What it does',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>The nested ${inlineCode('content')} object decides how Tentman reads and writes the underlying content. Pick the storage model first. That usually drives the rest of the config.</p>
<p>Use this page for the <em>shape of the nested object</em>. Use ${ref(
							'reference/content-modes',
							'Content modes'
						)} when you want the side-by-side comparison of ${inlineCode('file')} versus ${inlineCode(
							'directory'
						)}.</p>`
					},
					{
						kind: 'link-list',
						title: 'Common next hops',
						links: [
							{
								label: 'Content modes',
								href: docsHref('reference/content-modes'),
								description:
									'Compare the available storage strategies before choosing the exact fields.'
							},
							{
								label: 'Directory collection example',
								href: docsHref('examples/directory-collection'),
								description: 'See the nested content object in a file-per-item collection.'
							},
							{
								label: 'File-backed collection example',
								href: docsHref('examples/file-backed-collection'),
								description:
									'See the nested content object when everything lives inside one JSON source file.'
							}
						]
					}
				]
			},
			{
				id: 'modes',
				title: 'Mode fields',
				blocks: [
					table(['Mode', 'Use for', 'Required fields', 'Optional fields', 'Notes'], contentModeRows)
				]
			}
		]
	},
	{
		id: 'reference-collection',
		section: 'reference',
		slug: 'reference/collection',
		href: docsHref('reference/collection'),
		title: 'collection',
		description:
			'The nested collection configuration for repeated items, sorting, groups, and item-level state.',
		related: [
			{ label: 'CollectionGroupConfig', href: docsHref('reference/collection-group-config') },
			{ label: 'state', href: docsHref('reference/state') },
			{ label: 'Collections guide', href: docsHref('guides/collections') },
			{ label: 'Examples / FAQ', href: docsHref('examples/faq') }
		],
		sections: [
			{
				id: 'shorthand',
				title: 'Shorthand and object form',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Use ${inlineCode('collection: true')} for the simple case. Use the object form when you need any of these:</p>
<ul class="list-disc space-y-2 pl-5">
<li>${inlineCode('sorting: "manual"')}</li>
<li>${inlineCode('groups')}</li>
<li>${inlineCode('state')}</li>
</ul>`
					}
				]
			},
			{
				id: 'manual-ordering',
				title: 'Manual ordering and groups',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Tentman can optionally read and write a conventional JSON manifest at ${inlineCode(
							'tentman/navigation-manifest.json'
						)}. Top-level manual ordering is enabled with root ${inlineCode(
							'content.sorting: "manual"'
						)}. Collection item ordering is enabled with ${inlineCode(
							'collection: { "sorting": "manual" }'
						)}.</p>
<p>If a manifest section exists, Tentman uses it first. Unlisted existing configs or items are appended in discovered/default order, and missing manifest references are ignored.</p>`
					},
					{
						kind: 'code',
						code: navigationManifestExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-state',
		section: 'reference',
		slug: 'reference/state',
		href: docsHref('reference/state'),
		title: 'state',
		description:
			'The nested state property used inside content configs and collections to define editorial badges.',
		related: [
			{ label: 'StateConfig', href: docsHref('reference/state-config') },
			{ label: 'StatePreset', href: docsHref('reference/state-preset') },
			{ label: 'State guide', href: docsHref('guides/state') },
			{ label: 'collection', href: docsHref('reference/collection') }
		],
		sections: [
			{
				id: 'overview',
				title: 'What this property controls',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('state')} is the property you place on a content config or inside ${inlineCode(
							'collection'
						)} when you want Tentman to derive a badge from one field value.</p>
<p>Use this page when you are deciding <em>where</em> state belongs. Use ${ref(
							'reference/state-config',
							'StateConfig'
						)} when you need the exact object shape.</p>`
					},
					{
						kind: 'link-list',
						title: 'Where it appears',
						links: [
							{
								label: 'ContentConfig',
								href: docsHref('reference/content-config'),
								description: 'Use top-level state when the whole document has one editorial status.'
							},
							{
								label: 'collection',
								href: docsHref('reference/collection'),
								description:
									'Use collection.state when each repeated item should carry its own badge.'
							},
							{
								label: 'State guide',
								href: docsHref('guides/state'),
								description:
									'Read the higher-level decision guide before locking in the exact reference shape.'
							}
						]
					}
				]
			},
			{
				id: 'fields',
				title: 'Shape summary',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], stateConfigRows)]
			},
			{
				id: 'examples',
				title: 'Examples',
				blocks: [
					{
						kind: 'code-grid',
						items: [
							{
								title: 'Shared preset',
								code: statePresetExample,
								language: 'json'
							},
							{
								title: 'Inline state on a singleton',
								code: singletonStateExample,
								language: 'json'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'reference-blocks',
		section: 'reference',
		slug: 'reference/blocks',
		href: docsHref('reference/blocks'),
		title: 'blocks',
		description: 'The blocks array is the ordered schema for the editor surface.',
		related: [
			{ label: 'BlockUsage', href: docsHref('reference/block-usage') },
			{ label: 'BlockConfig', href: docsHref('reference/block-config') }
		],
		sections: [
			{
				id: 'overview',
				title: 'How blocks works',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('blocks')} is an ordered array of ${ref(
							'reference/block-usage',
							'BlockUsage'
						)} entries. Each entry either describes a primitive field, an inline structured block, a Tentman-owned group field, or a reusable block reference. The first items in the array usually become the main authoring flow.</p>`
					}
				]
			}
		]
	},
	{
		id: 'reference-block-usage',
		section: 'reference',
		slug: 'reference/block-usage',
		href: docsHref('reference/block-usage'),
		title: 'BlockUsage',
		description: 'Every field entry that can appear in a blocks array.',
		related: [
			{ label: 'blocks', href: docsHref('reference/blocks') },
			{ label: 'Markdown components', href: docsHref('reference/markdown-components') }
		],
		sections: [
			{
				id: 'built-in-types',
				title: 'Built-in block types',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${builtInBlocks.map((blockType) => inlineCode(blockType)).join(' ')}.</p>
<p>${inlineCode('toggle')} stores a boolean value and renders as an accessible switch. It is a good fit for on/off states such as published flags, feature switches, or visibility settings.</p>`
					}
				]
			},
			{
				id: 'fields',
				title: 'Common fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], blockUsageRows)]
			}
		]
	},
	{
		id: 'reference-block-config',
		section: 'reference',
		slug: 'reference/block-config',
		href: docsHref('reference/block-config'),
		title: 'BlockConfig',
		description: 'The reusable structured block config format.',
		related: [
			{ label: 'BlockUsage', href: docsHref('reference/block-usage') },
			{ label: 'Custom adapters', href: docsHref('reference/custom-adapters') },
			{ label: 'Guide / Blocks', href: docsHref('guides/blocks') }
		],
		sections: [
			{
				id: 'when-to-use',
				title: 'Use this when a grouped shape repeats',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('BlockConfig')} is the promotion path from an inline structured field group to a reusable local block. Reach for it when the same grouped fields appear in more than one content config and you want one definition to own that structure.</p>`
					}
				]
			},
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], blockConfigRows)]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: blockConfigExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-editor-layout-config',
		section: 'reference',
		slug: 'reference/editor-layout-config',
		href: docsHref('reference/editor-layout-config'),
		title: 'EditorLayoutConfig',
		description: 'A small layout object that moves chosen fields into an editor aside.',
		related: [
			{ label: 'ContentConfig', href: docsHref('reference/content-config') },
			{ label: 'Examples / Blog posts', href: docsHref('examples/blog-posts') }
		],
		sections: [
			{
				id: 'when-to-use',
				title: 'Use this to pull supporting fields out of the main flow',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('editorLayout')} is a presentation aid, not a data model feature. Use it when a few supporting fields such as slug, publish date, or status should stay visible without interrupting the main writing flow.</p>`
					}
				]
			},
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], editorLayoutRows)]
			}
		]
	},
	{
		id: 'reference-collection-group-config',
		section: 'reference',
		slug: 'reference/collection-group-config',
		href: docsHref('reference/collection-group-config'),
		title: 'CollectionGroupConfig',
		description: 'The config-backed definition for a reusable collection group.',
		related: [
			{ label: 'collection', href: docsHref('reference/collection') },
			{ label: 'Guide / Collections', href: docsHref('guides/collections') }
		],
		sections: [
			{
				id: 'when-to-use',
				title: 'Use this only for the object-form collection case',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('CollectionGroupConfig')} only matters once a collection has moved beyond the shorthand ${inlineCode(
							'collection: true'
						)} form. It defines reusable group options that Tentman can manage during grouped manual ordering flows.</p>`
					}
				]
			},
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], collectionGroupRows)]
			}
		]
	},
	{
		id: 'reference-state-config',
		section: 'reference',
		slug: 'reference/state-config',
		href: docsHref('reference/state-config'),
		title: 'StateConfig',
		description: 'The exact object shape used for a state badge configuration.',
		related: [
			{ label: 'state', href: docsHref('reference/state') },
			{ label: 'StatePreset', href: docsHref('reference/state-preset') },
			{ label: 'State guide', href: docsHref('guides/state') }
		],
		sections: [
			{
				id: 'use-it-for',
				title: 'Use this page for the exact contract',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>${inlineCode('StateConfig')} is the precise object shape shared by top-level ${inlineCode(
							'state'
						)} and ${inlineCode('collection.state')}.</p>
<p>If you are still deciding whether the badge belongs on the whole document or on collection items, start with ${ref(
							'reference/state',
							'state'
						)} instead.</p>`
					}
				]
			},
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], stateConfigRows)]
			}
		]
	},
	{
		id: 'reference-state-preset',
		section: 'reference',
		slug: 'reference/state-preset',
		href: docsHref('reference/state-preset'),
		title: 'StatePreset',
		description: 'A reusable named set of state cases defined on the root config.',
		related: [
			{ label: 'RootConfig', href: docsHref('reference/root-config') },
			{ label: 'state', href: docsHref('reference/state') },
			{ label: 'Reusability guide', href: docsHref('guides/reusability') }
		],
		sections: [
			{
				id: 'fields',
				title: 'Fields',
				blocks: [table(['Field', 'Required', 'Type', 'Purpose', 'Notes'], statePresetRows)]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: statePresetExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-content-modes',
		section: 'reference',
		slug: 'reference/content-modes',
		href: docsHref('reference/content-modes'),
		title: 'Content modes',
		description: 'The available storage modes for a content config.',
		related: [
			{ label: 'content', href: docsHref('reference/content') },
			{ label: 'Examples / Single page', href: docsHref('examples/single-page') },
			{
				label: 'Examples / Directory collection',
				href: docsHref('examples/directory-collection')
			},
			{
				label: 'Examples / File-backed collection',
				href: docsHref('examples/file-backed-collection')
			}
		],
		sections: [
			{
				id: 'how-to-read-it',
				title: 'Use this page to compare storage strategies',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>If ${ref(
							'reference/content',
							'content'
						)} tells you which nested object owns storage settings, this page tells you which storage mode to choose in the first place.</p>
<p>In practice the first decision is usually simple: ${inlineCode('directory')} when each item should live as its own file, ${inlineCode(
							'file'
						)} when one source file already exists or is easier to maintain.</p>`
					}
				]
			},
			{
				id: 'modes',
				title: 'Modes',
				blocks: [
					table(['Mode', 'Use for', 'Required fields', 'Optional fields', 'Notes'], contentModeRows)
				]
			},
			{
				id: 'examples',
				title: 'Examples',
				blocks: [
					{
						kind: 'code-grid',
						items: [
							{
								title: 'Directory-backed collection',
								code: contentConfigExample,
								language: 'json'
							},
							{
								title: 'File-backed collection',
								code: fileCollectionExample,
								language: 'json'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'reference-content-components',
		section: 'reference',
		slug: 'reference/content-components',
		href: docsHref('reference/content-components'),
		title: 'Content components',
		description: 'Reusable semantic authoring components for markdown-backed content.',
		related: [
			{ label: 'Markdown components', href: docsHref('reference/markdown-components') },
			{ label: 'Reusability guide', href: docsHref('guides/reusability') },
			{ label: 'BlockUsage', href: docsHref('reference/block-usage') }
		],
		sections: [
			{
				id: 'overview',
				title: 'Overview',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Content components are the preferred source-authoring model for reusable markdown content when you want to store semantic markers instead of final HTML.</p>
<p>By default, Tentman discovers components in ${inlineCode(
							'src/lib/content-components'
						)}. Set ${inlineCode('componentsDir')} in the root config when a repo uses a different location.</p>`
					},
					{
						kind: 'code-grid',
						items: [
							{
								title: 'Directory layout',
								code: `src/lib/content-components/
  buy-button/
    component.json
    render.njk
    preview.njk
    preview.css  # optional`,
								language: 'text'
							},
							{
								title: 'component.json',
								code: contentComponentConfigExample,
								language: 'json'
							}
						]
					}
				]
			},
			{
				id: 'templates',
				title: 'Templates',
				blocks: [
					{
						kind: 'code-grid',
						items: [
							{
								title: 'render.njk',
								description: 'Produces the final site output during the markdown build.',
								code: contentComponentRenderExample,
								language: 'html'
							},
							{
								title: 'preview.njk',
								description:
									'Produces the safe authoring preview shown inside Tentman. Preview HTML is sanitized to a presentational subset before Tentman mounts it in an isolated preview host.',
								code: contentComponentPreviewExample,
								language: 'html'
							},
							{
								title: 'preview.css',
								description:
									'Optional shadow-root-only preview styling. Tentman filters unsafe CSS before applying it, and the styles never ship to final site output.',
								code: `.tm-component-preview {
  border: 1px solid currentColor;
  padding: 0.35rem 0.5rem;
}`,
								language: 'css'
							}
						]
					}
				]
			},
			{
				id: 'workflow',
				title: 'Workflow',
				blocks: [
					{
						kind: 'code',
						title: 'mdsvex setup',
						code: contentComponentMdsvexExample,
						language: 'ts'
					},
					{
						kind: 'rich-text',
						html: `<p>Inline content components use semantic directive markers such as ${inlineCode(
							contentComponentMarkerExample
						)}. Tentman writes all active non-label attributes explicitly, sorts attributes alphabetically, and canonicalizes quoting and escaping on serialization.</p>`
					},
					{
						kind: 'code',
						title: 'CLI workflow',
						code: contentComponentCliExample,
						language: 'bash'
					}
				]
			}
		]
	},
	{
		id: 'reference-markdown-components',
		section: 'reference',
		slug: 'reference/markdown-components',
		href: docsHref('reference/markdown-components'),
		title: 'Markdown components',
		description: 'How content components plug into markdown fields and the rich editor.',
		related: [
			{ label: 'Content components', href: docsHref('reference/content-components') },
			{ label: 'BlockUsage', href: docsHref('reference/block-usage') },
			{ label: 'Guide / Reusability', href: docsHref('guides/reusability') }
		],
		sections: [
			{
				id: 'overview',
				title: 'How they are enabled',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Content components extend individual markdown fields with rich editor atoms, toolbar actions, dialogs, markdown serialization, and Tentman preview rendering.</p>
<p>Discover components from ${inlineCode('componentsDir')}, then opt in per markdown block with ${inlineCode(
							'components'
						)}.</p>`
					},
					{
						kind: 'code-grid',
						items: [
							{
								title: 'Root config',
								code: rootConfigExample,
								language: 'json'
							},
							{
								title: 'Content config',
								code: contentConfigExample,
								language: 'json'
							}
						]
					},
					{
						kind: 'code',
						title: 'Editor metadata in component.json',
						code: markdownComponentEditorExample,
						language: 'json'
					}
				]
			}
		]
	},
	{
		id: 'reference-package-blocks',
		section: 'reference',
		slug: 'reference/package-blocks',
		href: docsHref('reference/package-blocks'),
		title: 'Package blocks',
		description: 'Reusable blocks shipped from installed packages.',
		related: [
			{ label: 'BlockConfig', href: docsHref('reference/block-config') },
			{ label: 'Reusability guide', href: docsHref('guides/reusability') },
			{ label: 'Custom adapters', href: docsHref('reference/custom-adapters') }
		],
		sections: [
			{
				id: 'overview',
				title: 'Overview',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Package blocks let you ship reusable block configs from an installed package. The package must export a named ${inlineCode(
							'blockPackage'
						)} object.</p>`
					},
					{
						kind: 'rich-text',
						html: `<p>This is the last step in the reuse ladder: inline fields first, then local ${ref(
							'reference/block-config',
							'BlockConfig'
						)}, then package blocks once the same editor primitive needs to travel across repositories.</p>`
					},
					{
						kind: 'code',
						code: packageBlockExample,
						language: 'ts'
					},
					{
						kind: 'rich-text',
						html: `<ul class="list-disc space-y-2 pl-5">
<li>Each entry in ${inlineCode('blockPackage.blocks')} is a definition object, not a raw block config.</li>
<li>The definition must include ${inlineCode('config')}, and that config must parse as ${inlineCode(
							'type: "block"'
						)}.</li>
<li>Package configs must not declare ${inlineCode('config.adapter')} directly.</li>
<li>An optional ${inlineCode('adapter')} export may sit next to ${inlineCode(
							'config'
						)}, and its ${inlineCode('type')} must match the block id.</li>
</ul>`
					}
				]
			}
		]
	},
	{
		id: 'reference-custom-adapters',
		section: 'reference',
		slug: 'reference/custom-adapters',
		href: docsHref('reference/custom-adapters'),
		title: 'Custom adapters',
		description: 'The escape hatch for reusable blocks that need custom defaults or validation.',
		related: [
			{ label: 'BlockConfig', href: docsHref('reference/block-config') },
			{ label: 'Package blocks', href: docsHref('reference/package-blocks') },
			{ label: 'Guide / Blocks', href: docsHref('guides/blocks') }
		],
		sections: [
			{
				id: 'fields',
				title: 'Required exports',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Most reusable block configs should use the generated structured adapter. Add a custom adapter only when you need custom defaults or validation.</p>`
					},
					table(['Export', 'Required', 'Type', 'Purpose'], adapterRows)
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: customAdapterExample,
						language: 'ts'
					}
				]
			}
		]
	},
	{
		id: 'reference-discovery-and-paths',
		section: 'reference',
		slug: 'reference/discovery-and-paths',
		href: docsHref('reference/discovery-and-paths'),
		title: 'Discovery and paths',
		description: 'How Tentman resolves paths and discovers configs, blocks, and components.',
		related: [
			{ label: 'RootConfig', href: docsHref('reference/root-config') },
			{ label: 'Content components', href: docsHref('reference/content-components') }
		],
		sections: [
			{
				id: 'rules',
				title: 'Rules',
				blocks: [
					{
						kind: 'rich-text',
						html: `<ul class="list-disc space-y-2 pl-5">${pathRules
							.map((rule) => `<li>${rule}</li>`)
							.join('')}</ul>`
					}
				]
			}
		]
	},
	{
		id: 'examples-blog-posts',
		section: 'examples',
		slug: 'examples/blog-posts',
		href: docsHref('examples/blog-posts'),
		title: 'Blog posts',
		description: 'A practical directory-backed content collection for posts.',
		related: [
			{ label: 'Getting started / Blog posts', href: docsHref('getting-started/blog-posts') },
			{ label: 'Guide / Content configs', href: docsHref('guides/content-configs') },
			{ label: 'Reference / collection', href: docsHref('reference/collection') }
		],
		sections: [
			{
				id: 'why-this-pattern',
				title: 'Why this pattern works',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>This is the strongest first example because it shows the main Tentman decisions in one place: a collection, one file per item, an author-facing slug, manual ordering, optional groups, and a little editor chrome in the aside.</p>`
					}
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: contentConfigExample,
						language: 'json'
					}
				]
			},
			{
				id: 'go-deeper',
				title: 'Go deeper',
				blocks: [
					{
						kind: 'link-list',
						links: [
							{
								label: 'State guide',
								href: docsHref('guides/state'),
								description:
									'Add editorial badges when posts need Draft, Published, or similar statuses.'
							},
							{
								label: 'content',
								href: docsHref('reference/content'),
								description:
									'Change the storage mode once you understand how the directory-backed shape behaves.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'examples-faq',
		section: 'examples',
		slug: 'examples/faq',
		href: docsHref('examples/faq'),
		title: 'FAQ',
		description: 'A compact repeatable content shape for question-and-answer items.',
		related: [
			{ label: 'Guide / Collections', href: docsHref('guides/collections') },
			{ label: 'Reference / collection', href: docsHref('reference/collection') },
			{ label: 'Reference / Content modes', href: docsHref('reference/content-modes') }
		],
		sections: [
			{
				id: 'notes',
				title: 'Pattern',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>A FAQ is usually a lightweight collection with a ${inlineCode(
							'question'
						)} field, an ${inlineCode('answer')} markdown or textarea field, and optional grouping if the site has multiple FAQ sections.</p>
<p>Keep this pattern intentionally small. It is a good fit when editors mostly need to add, reorder, and lightly structure answers without a lot of extra metadata.</p>`
					},
					{
						kind: 'code',
						code: faqExample,
						language: 'json'
					},
					{
						kind: 'link-list',
						title: 'Useful next links',
						links: [
							{
								label: 'collection',
								href: docsHref('reference/collection'),
								description:
									'Add manual ordering or grouping once the plain repeatable shape is working.'
							},
							{
								label: 'Single page',
								href: docsHref('examples/single-page'),
								description:
									'Switch to a singleton when the content is really one document, not many entries.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'examples-single-page',
		section: 'examples',
		slug: 'examples/single-page',
		href: docsHref('examples/single-page'),
		title: 'Single page',
		description: 'A singleton-style content config for a one-off page such as About.',
		related: [
			{ label: 'Guide / Content configs', href: docsHref('guides/content-configs') },
			{ label: 'Reference / Content modes', href: docsHref('reference/content-modes') },
			{ label: 'Reference / state', href: docsHref('reference/state') }
		],
		sections: [
			{
				id: 'when-to-use',
				title: 'Use this when the page is one document',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>This pattern is a better fit than a collection when editors are maintaining one durable page such as About, Contact, or Terms. The config stays smaller, and you can still add state or editor aside fields when the page has workflow needs.</p>`
					}
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: fileSingletonExample,
						language: 'json'
					}
				]
			},
			{
				id: 'go-deeper',
				title: 'Go deeper',
				blocks: [
					{
						kind: 'link-list',
						links: [
							{
								label: 'Content modes',
								href: docsHref('reference/content-modes'),
								description:
									'Compare this singleton file-backed pattern with other storage strategies.'
							},
							{
								label: 'state',
								href: docsHref('reference/state'),
								description: 'Add editorial status when the page needs draft or publish workflow.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'examples-directory-collection',
		section: 'examples',
		slug: 'examples/directory-collection',
		href: docsHref('examples/directory-collection'),
		title: 'Directory collection',
		description: 'One file per item, ideal for posts, docs, or other file-backed entries.',
		related: [
			{ label: 'Examples / Blog posts', href: docsHref('examples/blog-posts') },
			{ label: 'Reference / content', href: docsHref('reference/content') },
			{ label: 'Reference / collection', href: docsHref('reference/collection') }
		],
		sections: [
			{
				id: 'why-use-it',
				title: 'Why teams choose it',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Choose directory mode when each item should live as its own file in git. It plays well with markdown-heavy content, diff review, and static site generators that already expect one file per document.</p>`
					}
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: contentConfigExample,
						language: 'json'
					}
				]
			},
			{
				id: 'go-deeper',
				title: 'Go deeper',
				blocks: [
					{
						kind: 'link-list',
						links: [
							{
								label: 'Content modes',
								href: docsHref('reference/content-modes'),
								description:
									'Compare directory mode with file-backed storage before standardizing on it.'
							},
							{
								label: 'collection',
								href: docsHref('reference/collection'),
								description:
									'Layer in grouping, manual ordering, and item-level state once the core pattern is working.'
							}
						]
					}
				]
			}
		]
	},
	{
		id: 'examples-file-backed-collection',
		section: 'examples',
		slug: 'examples/file-backed-collection',
		href: docsHref('examples/file-backed-collection'),
		title: 'File-backed collection',
		description: 'A JSON-backed collection stored inside one file.',
		related: [
			{ label: 'Reference / content', href: docsHref('reference/content') },
			{ label: 'Reference / Content modes', href: docsHref('reference/content-modes') },
			{ label: 'Examples / FAQ', href: docsHref('examples/faq') }
		],
		sections: [
			{
				id: 'why-use-it',
				title: 'Why teams choose it',
				blocks: [
					{
						kind: 'rich-text',
						html: `<p>Choose file mode when the site already expects one JSON source of truth, or when the content set is small enough that keeping everything in one file is simpler than creating one file per item.</p>`
					}
				]
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						kind: 'code',
						code: fileCollectionExample,
						language: 'json'
					}
				]
			},
			{
				id: 'go-deeper',
				title: 'Go deeper',
				blocks: [
					{
						kind: 'link-list',
						links: [
							{
								label: 'FAQ example',
								href: docsHref('examples/faq'),
								description:
									'Use this as the lighter-weight pattern when the items are simple and editorial metadata is minimal.'
							},
							{
								label: 'content',
								href: docsHref('reference/content'),
								description:
									'Review the nested storage object fields once you know file-backed arrays are the right fit.'
							}
						]
					}
				]
			}
		]
	}
];

export const docsBySlug = new Map(docsPages.map((page) => [page.slug, page]));

export const docsNavigation: DocsNavGroup[] = [
	{
		id: 'getting-started',
		title: 'Getting started',
		children: [
			{
				title: 'Blog posts',
				href: docsHref('getting-started/blog-posts'),
				pageId: 'getting-started-blog-posts'
			}
		]
	},
	{
		id: 'guides',
		title: 'Guides',
		children: [
			{
				title: 'How Tentman works',
				href: docsHref('guides/how-tentman-works'),
				pageId: 'guides-how-tentman-works'
			},
			{
				title: 'Content configs',
				href: docsHref('guides/content-configs'),
				pageId: 'guides-content-configs'
			},
			{ title: 'Blocks', href: docsHref('guides/blocks'), pageId: 'guides-blocks' },
			{ title: 'Collections', href: docsHref('guides/collections'), pageId: 'guides-collections' },
			{ title: 'State', href: docsHref('guides/state'), pageId: 'guides-state' },
			{ title: 'Reusability', href: docsHref('guides/reusability'), pageId: 'guides-reusability' }
		]
	},
	{
		id: 'reference',
		title: 'Reference',
		children: [
			{
				title: 'RootConfig',
				href: docsHref('reference/root-config'),
				pageId: 'reference-root-config',
				children: [
					{
						title: 'StatePreset',
						href: docsHref('reference/state-preset'),
						pageId: 'reference-state-preset'
					}
				]
			},
			{
				title: 'ContentConfig',
				href: docsHref('reference/content-config'),
				pageId: 'reference-content-config',
				children: [
					{ title: 'content', href: docsHref('reference/content'), pageId: 'reference-content' },
					{
						title: 'collection',
						href: docsHref('reference/collection'),
						pageId: 'reference-collection',
						children: [
							{
								title: 'CollectionGroupConfig',
								href: docsHref('reference/collection-group-config'),
								pageId: 'reference-collection-group-config'
							}
						]
					},
					{
						title: 'state',
						href: docsHref('reference/state'),
						pageId: 'reference-state',
						children: [
							{
								title: 'StateConfig',
								href: docsHref('reference/state-config'),
								pageId: 'reference-state-config'
							}
						]
					},
					{ title: 'blocks', href: docsHref('reference/blocks'), pageId: 'reference-blocks' },
					{
						title: 'EditorLayoutConfig',
						href: docsHref('reference/editor-layout-config'),
						pageId: 'reference-editor-layout-config'
					}
				]
			},
			{
				title: 'BlockUsage',
				href: docsHref('reference/block-usage'),
				pageId: 'reference-block-usage'
			},
			{
				title: 'BlockConfig',
				href: docsHref('reference/block-config'),
				pageId: 'reference-block-config'
			},
			{
				title: 'Content modes',
				href: docsHref('reference/content-modes'),
				pageId: 'reference-content-modes'
			},
			{
				title: 'Content components',
				href: docsHref('reference/content-components'),
				pageId: 'reference-content-components'
			},
			{
				title: 'Markdown components',
				href: docsHref('reference/markdown-components'),
				pageId: 'reference-markdown-components'
			},
			{
				title: 'Package blocks',
				href: docsHref('reference/package-blocks'),
				pageId: 'reference-package-blocks'
			},
			{
				title: 'Custom adapters',
				href: docsHref('reference/custom-adapters'),
				pageId: 'reference-custom-adapters'
			},
			{
				title: 'Discovery and paths',
				href: docsHref('reference/discovery-and-paths'),
				pageId: 'reference-discovery-and-paths'
			}
		]
	},
	{
		id: 'examples',
		title: 'Examples',
		children: [
			{ title: 'Blog posts', href: docsHref('examples/blog-posts'), pageId: 'examples-blog-posts' },
			{ title: 'FAQ', href: docsHref('examples/faq'), pageId: 'examples-faq' },
			{
				title: 'Single page',
				href: docsHref('examples/single-page'),
				pageId: 'examples-single-page'
			},
			{
				title: 'Directory collection',
				href: docsHref('examples/directory-collection'),
				pageId: 'examples-directory-collection'
			},
			{
				title: 'File-backed collection',
				href: docsHref('examples/file-backed-collection'),
				pageId: 'examples-file-backed-collection'
			}
		]
	}
];

export const defaultDocsPage = docsPages[0];

export function getDocsPageBySlug(slug: string): DocsPage | undefined {
	return docsBySlug.get(slug);
}

export function getDocsPageByPath(pathname: string): DocsPage | undefined {
	if (!pathname.startsWith('/docs/')) {
		return undefined;
	}

	return getDocsPageBySlug(pathname.slice('/docs/'.length));
}

export function docsNavItemContainsHref(item: DocsNavItem, href: string): boolean {
	if (item.href === href) {
		return true;
	}

	return item.children?.some((child) => docsNavItemContainsHref(child, href)) ?? false;
}

export { docsPages };
