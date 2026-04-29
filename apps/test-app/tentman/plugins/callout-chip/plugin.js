// @ts-nocheck

const VALID_TONES = new Set(['info', 'success', 'warning']);

function normalizeValue(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeTone(value) {
	return VALID_TONES.has(value) ? value : 'info';
}

function renderCalloutChip(attributes) {
	const label = normalizeValue(attributes.label) || 'Note';
	const tone = normalizeTone(attributes.tone);

	return {
		tag: 'span',
		attributes: {
			'data-tentman-plugin': 'callout-chip',
			'data-tone': tone,
			'data-label': label
		},
		text: label
	};
}

function escapeAttribute(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function readAttribute(attributes, name) {
	const match = attributes.match(new RegExp(`(?:^|\\s)${name}=(["'])(.*?)\\1`, 'i'));
	return match ? match[2] : '';
}

export default {
	id: 'callout-chip',
	version: '0.1.0',
	capabilities: ['markdown', 'preview'],
	markdown: {
		htmlInlineNodes: [
			{
				id: 'callout-chip',
				nodeName: 'calloutChip',
				selector: 'span[data-tentman-plugin="callout-chip"]',
				attributes: [
					{
						name: 'label',
						default: 'Note',
						parse(element) {
							return (
								normalizeValue(element.getAttribute('data-label')) ||
								normalizeValue(element.textContent) ||
								'Note'
							);
						}
					},
					{
						name: 'tone',
						default: 'info',
						parse(element) {
							return normalizeTone(element.getAttribute('data-tone'));
						}
					}
				],
				renderHTML: renderCalloutChip,
				editorView: {
					label(attributes) {
						const label = normalizeValue(attributes.label) || 'Note';
						return `Callout: ${label}`;
					},
					className(attributes) {
						const tone = normalizeTone(attributes.tone);

						if (tone === 'success') {
							return 'border-emerald-500 bg-emerald-50 text-emerald-900';
						}

						if (tone === 'warning') {
							return 'border-amber-500 bg-amber-50 text-amber-950';
						}

						return 'border-sky-500 bg-sky-50 text-sky-950';
					}
				},
				toolbarItems: [
					{
						id: 'callout-chip',
						label: 'Callout Chip',
						buttonLabel: 'Callout Chip',
						isActive(editor) {
							return editor.isActive('calloutChip');
						},
						dialog: {
							title: 'Callout chip',
							submitLabel: 'Save chip',
							fields: [
								{
									id: 'label',
									label: 'Label',
									type: 'text',
									defaultValue: 'Note',
									required: true
								},
								{
									id: 'tone',
									label: 'Tone',
									type: 'select',
									defaultValue: 'info',
									options: [
										{ label: 'Info', value: 'info' },
										{ label: 'Success', value: 'success' },
										{ label: 'Warning', value: 'warning' }
									]
								}
							],
							getInitialValues(editor) {
								const currentAttributes = editor.isActive('calloutChip')
									? editor.getAttributes('calloutChip')
									: {};

								return {
									label: normalizeValue(currentAttributes.label) || 'Note',
									tone: normalizeTone(currentAttributes.tone)
								};
							},
							validate(values) {
								if (!normalizeValue(values.label)) {
									return 'A callout chip needs a label.';
								}

								return null;
							},
							submit(editor, values) {
								const nextAttributes = {
									label: normalizeValue(values.label) || 'Note',
									tone: normalizeTone(values.tone)
								};

								if (editor.isActive('calloutChip')) {
									editor.chain().focus().updateAttributes('calloutChip', nextAttributes).run();
									return;
								}

								editor
									.chain()
									.focus()
									.insertContent({
										type: 'calloutChip',
										attrs: nextAttributes
									})
									.run();
							}
						}
					}
				]
			}
		]
	},
	preview: {
		transformMarkdown(markdown) {
			return markdown.replace(
				/<span\s+([^>]*?)data-tentman-plugin=(["'])callout-chip\2([^>]*)>(.*?)<\/span>/gis,
				(match, before, _quote, after, text) => {
					const combinedAttributes = `${before} ${after}`;
					const tone = normalizeTone(readAttribute(combinedAttributes, 'data-tone'));
					const existingClassName = readAttribute(combinedAttributes, 'class').trim();
					const chipClassName = `tentman-preview-callout-chip tentman-preview-callout-chip-${tone}`;
					const mergedClassName = [existingClassName, chipClassName].filter(Boolean).join(' ');
					const sanitizedAttributes = combinedAttributes
						.replace(/(?:^|\s)class=(["']).*?\1/i, '')
						.replace(/\s+/g, ' ')
						.trim();
					const serializedAttributes = sanitizedAttributes ? `${sanitizedAttributes} ` : '';

					return `<span ${serializedAttributes}class="${escapeAttribute(mergedClassName)}">${text}</span>`;
				}
			);
		}
	}
};
