// @ts-nocheck

function normalizeValue(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeVariant(value) {
	return value === 'secondary' ? 'secondary' : 'default';
}

function renderBuyButton(attributes) {
	const href = normalizeValue(attributes.href);
	const label = normalizeValue(attributes.label) || 'Buy online';
	const variant = normalizeVariant(attributes.variant);

	return {
		tag: 'a',
		attributes: {
			'data-tentman-plugin': 'buy-button',
			href,
			'data-label': label,
			'data-variant': variant
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
	id: 'buy-button',
	version: '0.1.0',
	capabilities: ['markdown', 'preview'],
	markdown: {
		htmlInlineNodes: [
			{
				id: 'buy-button',
				nodeName: 'buyButton',
				selector: 'a[data-tentman-plugin="buy-button"]',
				attributes: [
					{
						name: 'href',
						default: '',
						parse(element) {
							return normalizeValue(element.getAttribute('href'));
						}
					},
					{
						name: 'label',
						default: 'Buy online',
						parse(element) {
							return (
								normalizeValue(element.getAttribute('data-label')) ||
								normalizeValue(element.textContent) ||
								'Buy online'
							);
						}
					},
					{
						name: 'variant',
						default: 'default',
						parse(element) {
							return normalizeVariant(element.getAttribute('data-variant'));
						}
					}
				],
				renderHTML: renderBuyButton,
				editorView: {
					label(attributes) {
						const label = normalizeValue(attributes.label) || 'Buy online';
						return `Buy button: ${label}`;
					},
					className(attributes) {
						return normalizeVariant(attributes.variant) === 'secondary'
							? 'border-stone-400 bg-white text-stone-800'
							: 'border-emerald-600 bg-emerald-600 text-white';
					}
				},
				toolbarItems: [
					{
						id: 'buy-button',
						label: 'Buy Button',
						buttonLabel: 'Buy Button',
						isActive(editor) {
							return editor.isActive('buyButton');
						},
						dialog: {
							title: 'Buy button',
							submitLabel: 'Save button',
							fields: [
								{
									id: 'href',
									label: 'URL',
									type: 'url',
									required: true
								},
								{
									id: 'label',
									label: 'Label',
									type: 'text',
									defaultValue: 'Buy online',
									required: true
								},
								{
									id: 'variant',
									label: 'Variant',
									type: 'select',
									defaultValue: 'default',
									options: [
										{ label: 'Default', value: 'default' },
										{ label: 'Secondary', value: 'secondary' }
									]
								}
							],
							getInitialValues(editor) {
								const currentAttributes = editor.isActive('buyButton')
									? editor.getAttributes('buyButton')
									: {};

								return {
									href: normalizeValue(currentAttributes.href),
									label: normalizeValue(currentAttributes.label) || 'Buy online',
									variant: normalizeVariant(currentAttributes.variant)
								};
							},
							validate(values) {
								if (!normalizeValue(values.href)) {
									return 'A buy button needs a URL.';
								}

								return null;
							},
							submit(editor, values) {
								const nextAttributes = {
									href: normalizeValue(values.href),
									label: normalizeValue(values.label) || 'Buy online',
									variant: normalizeVariant(values.variant)
								};

								if (editor.isActive('buyButton')) {
									editor.chain().focus().updateAttributes('buyButton', nextAttributes).run();
									return;
								}

								editor
									.chain()
									.focus()
									.insertContent({
										type: 'buyButton',
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
				/<a\s+([^>]*?)data-tentman-plugin=(["'])buy-button\2([^>]*)>(.*?)<\/a>/gis,
				(match, before, _quote, after, text) => {
					const combinedAttributes = `${before} ${after}`;
					const variant = normalizeVariant(readAttribute(combinedAttributes, 'data-variant'));
					const existingClassName = readAttribute(combinedAttributes, 'class').trim();
					const buttonClassName =
						variant === 'secondary'
							? 'tentman-preview-buy-button tentman-preview-buy-button-secondary'
							: 'tentman-preview-buy-button';
					const mergedClassName = [existingClassName, buttonClassName].filter(Boolean).join(' ');
					const sanitizedAttributes = combinedAttributes
						.replace(/(?:^|\s)class=(["']).*?\1/i, '')
						.replace(/\s+/g, ' ')
						.trim();
					const serializedAttributes = sanitizedAttributes ? `${sanitizedAttributes} ` : '';

					return `<a ${serializedAttributes}class="${escapeAttribute(mergedClassName)}">${text}</a>`;
				}
			);
		}
	}
};
