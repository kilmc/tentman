import { sanitizeContentComponentPreviewHtml } from '@tentman/core/content-components';

const SAFE_PREVIEW_HOST_ATTRIBUTE = 'data-tentman-safe-preview-host';
const SAFE_PREVIEW_HTML_ATTRIBUTE = 'data-tentman-safe-preview-html';
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
	kind: 'inline' | 'block';
}): string {
	const tagName = options.kind === 'block' ? 'div' : 'span';
	return `<${tagName} ${SAFE_PREVIEW_HOST_ATTRIBUTE}="${options.kind}" ${SAFE_PREVIEW_HTML_ATTRIBUTE}="${escapeHtmlAttribute(encodePreviewHtml(options.html))}"></${tagName}>`;
}

export function sanitizeRenderedPreviewHtml(
	html: string
): ReturnType<typeof sanitizeContentComponentPreviewHtml> {
	return sanitizeContentComponentPreviewHtml(html);
}

export function mountSafePreviewHost(
	container: HTMLElement,
	options: {
		html: string;
		kind: 'inline' | 'block';
	}
): HTMLElement {
	container.textContent = '';

	const host = document.createElement(options.kind === 'block' ? 'div' : 'span');
	host.setAttribute(SAFE_PREVIEW_HOST_ATTRIBUTE, options.kind);
	container.append(host);

	const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
	shadowRoot.innerHTML = `<style>${getBasePreviewStyles(options.kind)}</style><div class="tm-safe-preview-root">${options.html}</div>`;
	host.setAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE, 'true');
	host.setAttribute(SAFE_PREVIEW_HTML_ATTRIBUTE, encodePreviewHtml(options.html));
	return host;
}

export function enhanceSafePreviewHosts(root: ParentNode): void {
	for (const element of root.querySelectorAll<HTMLElement>(`[${SAFE_PREVIEW_HOST_ATTRIBUTE}]`)) {
		if (element.getAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE) === 'true') {
			continue;
		}

		const kind = element.getAttribute(SAFE_PREVIEW_HOST_ATTRIBUTE) === 'block' ? 'block' : 'inline';
		const encodedHtml = element.getAttribute(SAFE_PREVIEW_HTML_ATTRIBUTE) ?? '';
		const html = decodePreviewHtml(encodedHtml);
		const shadowRoot = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
		shadowRoot.innerHTML = `<style>${getBasePreviewStyles(kind)}</style><div class="tm-safe-preview-root">${html}</div>`;
		element.setAttribute(SAFE_PREVIEW_MOUNTED_ATTRIBUTE, 'true');
	}
}

export function getSafePreviewHostAttributeName(): string {
	return SAFE_PREVIEW_HOST_ATTRIBUTE;
}
