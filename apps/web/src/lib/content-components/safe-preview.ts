import {
	sanitizeContentComponentPreviewCss,
	sanitizeContentComponentPreviewHtml
} from '@tentman/core/content-components';

const SAFE_PREVIEW_HOST_ATTRIBUTE = 'data-tentman-safe-preview-host';
const SAFE_PREVIEW_HTML_ATTRIBUTE = 'data-tentman-safe-preview-html';
const SAFE_PREVIEW_CSS_ATTRIBUTE = 'data-tentman-safe-preview-css';
const SAFE_PREVIEW_MOUNTED_ATTRIBUTE = 'data-tentman-safe-preview-mounted';

function escapeHtmlAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function encodePreviewHtml(value: string): string {
	return encodeURIComponent(value);
}

function decodePreviewHtml(value: string): string {
	return decodeURIComponent(value);
}

function encodePreviewCss(value: string): string {
	return encodeURIComponent(value);
}

function decodePreviewCss(value: string): string {
	return decodeURIComponent(value);
}

function getBasePreviewStyles(kind: 'inline' | 'block'): string {
	return `
		:host {
			display: ${kind === 'block' ? 'block' : 'inline-block'};
			max-width: 100%;
			color: inherit;
			font: inherit;
		}

		.tm-safe-preview-root,
		.tm-safe-preview-root * {
			box-sizing: border-box;
		}

		.tm-safe-preview-root {
			position: relative;
			display: ${kind === 'block' ? 'block' : 'inline-block'};
			max-width: 100%;
			overflow: hidden;
			color: inherit;
			font: inherit;
			line-height: inherit;
			vertical-align: middle;
		}

		.tm-safe-preview-root img {
			display: block;
			max-width: 100%;
			height: auto;
		}
	`;
}

export function createSafePreviewHostMarkup(options: {
	html: string;
	css?: string;
	kind: 'inline' | 'block';
}): string {
	const tagName = options.kind === 'block' ? 'div' : 'span';
	const cssAttribute =
		options.css && options.css.trim().length > 0
			? ` ${SAFE_PREVIEW_CSS_ATTRIBUTE}="${escapeHtmlAttribute(encodePreviewCss(options.css))}"`
			: '';
	return `<${tagName} ${SAFE_PREVIEW_HOST_ATTRIBUTE}="${options.kind}" ${SAFE_PREVIEW_HTML_ATTRIBUTE}="${escapeHtmlAttribute(encodePreviewHtml(options.html))}"${cssAttribute}></${tagName}>`;
}

export function sanitizeRenderedPreviewHtml(
	html: string
): ReturnType<typeof sanitizeContentComponentPreviewHtml> {
	return sanitizeContentComponentPreviewHtml(html);
}

export function sanitizeRenderedPreviewCss(
	css: string
): ReturnType<typeof sanitizeContentComponentPreviewCss> {
	return sanitizeContentComponentPreviewCss(css);
}

function renderSafePreviewShadowRoot(
	shadowRoot: ShadowRoot,
	options: {
		html: string;
		css?: string;
		kind: 'inline' | 'block';
	}
): void {
	shadowRoot.replaceChildren();

	const baseStyle = document.createElement('style');
	baseStyle.textContent = getBasePreviewStyles(options.kind);
	shadowRoot.append(baseStyle);

	if (options.css && options.css.trim().length > 0) {
		const customStyle = document.createElement('style');
		customStyle.textContent = options.css;
		shadowRoot.append(customStyle);
	}

	const previewRoot = document.createElement('div');
	previewRoot.className = 'tm-safe-preview-root';
	previewRoot.innerHTML = options.html;
	shadowRoot.append(previewRoot);
}

export function mountSafePreviewHost(
	container: HTMLElement,
	options: {
		html: string;
		css?: string;
		kind: 'inline' | 'block';
	}
): HTMLElement {
	container.textContent = '';

	const host = document.createElement(options.kind === 'block' ? 'div' : 'span');
	host.setAttribute(SAFE_PREVIEW_HOST_ATTRIBUTE, options.kind);
	container.append(host);

	const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
	renderSafePreviewShadowRoot(shadowRoot, options);
	host.setAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE, 'true');
	host.setAttribute(SAFE_PREVIEW_HTML_ATTRIBUTE, encodePreviewHtml(options.html));
	if (options.css && options.css.trim().length > 0) {
		host.setAttribute(SAFE_PREVIEW_CSS_ATTRIBUTE, encodePreviewCss(options.css));
	} else {
		host.removeAttribute(SAFE_PREVIEW_CSS_ATTRIBUTE);
	}
	return host;
}

export function enhanceSafePreviewHosts(root: ParentNode): void {
	for (const element of root.querySelectorAll<HTMLElement>(`[${SAFE_PREVIEW_HOST_ATTRIBUTE}]`)) {
		if (element.getAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE) === 'true') {
			continue;
		}

		const kind = element.getAttribute(SAFE_PREVIEW_HOST_ATTRIBUTE) === 'block' ? 'block' : 'inline';
		const encodedHtml = element.getAttribute(SAFE_PREVIEW_HTML_ATTRIBUTE) ?? '';
		const encodedCss = element.getAttribute(SAFE_PREVIEW_CSS_ATTRIBUTE) ?? '';
		const html = decodePreviewHtml(encodedHtml);
		const css = encodedCss.length > 0 ? decodePreviewCss(encodedCss) : '';
		const shadowRoot = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
		renderSafePreviewShadowRoot(shadowRoot, { html, css, kind });
		element.setAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE, 'true');
	}
}

export function getSafePreviewHostAttributeName(): string {
	return SAFE_PREVIEW_HOST_ATTRIBUTE;
}
