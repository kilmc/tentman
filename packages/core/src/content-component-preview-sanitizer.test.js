import assert from 'node:assert/strict';
import test from 'node:test';
import {
	inspectContentComponentPreviewCssSource,
	inspectContentComponentPreviewTemplateSource,
	sanitizeContentComponentPreviewCss,
	sanitizeContentComponentPreviewHtml
} from './index.js';

test('sanitizeContentComponentPreviewHtml preserves the safe preview subset', () => {
	const result = sanitizeContentComponentPreviewHtml(
		'<div class="preview-shell"><span class="label">Hello</span><img src="/images/hero.jpg" alt="Hero"></div>'
	);

	assert.equal(
		result.html,
		'<div class="preview-shell"><span class="label">Hello</span><img src="/images/hero.jpg" alt="Hero"></div>'
	);
	assert.deepEqual(result.diagnostics, []);
});

test('sanitizeContentComponentPreviewHtml strips hostile tags and attributes', () => {
	const result = sanitizeContentComponentPreviewHtml(
		'<a href="https://example.com" onclick="alert(1)"><span class="cta">Click me</span></a><script>alert(1)</script><img src="javascript:alert(1)" alt="Bad" style="width: 200px">'
	);

	assert.equal(result.html, '<span class="cta">Click me</span><img alt="Bad">');
	assert.deepEqual(
		result.diagnostics.map((diagnostic) => diagnostic.message),
		[
			'Stripped unsupported <a> preview markup',
			'Stripped unsupported <script> preview markup',
			'Blocked unsafe image src on <img>',
			'Stripped unsupported style attribute from <img>'
		]
	);
});

test('inspectContentComponentPreviewTemplateSource ignores Nunjucks syntax while reporting unsafe markup', () => {
	const result = inspectContentComponentPreviewTemplateSource(
		'{% if href %}<a href="{{ href | escape }}">Link</a>{% endif %}<span class="ok">{{ label }}</span>'
	);

	assert.equal(result.html, 'Link<span class="ok"></span>');
	assert.deepEqual(
		result.diagnostics.map((diagnostic) => diagnostic.message),
		['Stripped unsupported <a> preview markup']
	);
});

test('sanitizeContentComponentPreviewHtml preserves Theresa-style simple span previews', () => {
	const result = sanitizeContentComponentPreviewHtml(
		'<span class="tm-component-preview tm-component-preview--buy-button">Buy tickets</span>'
	);

	assert.equal(
		result.html,
		'<span class="tm-component-preview tm-component-preview--buy-button">Buy tickets</span>'
	);
	assert.deepEqual(result.diagnostics, []);
});

test('sanitizeContentComponentPreviewCss preserves safe preview styles', () => {
	const result = sanitizeContentComponentPreviewCss(
		'.tm-component-preview { color: red; display: grid; position: absolute; inset: 0; }'
	);

	assert.equal(
		result.css,
		'.tm-component-preview { color: red; display: grid; position: absolute; inset: 0; }'
	);
	assert.deepEqual(result.diagnostics, []);
});

test('sanitizeContentComponentPreviewCss strips unsafe selectors, at-rules, and declarations', () => {
	const result = sanitizeContentComponentPreviewCss(
		'@import url("/evil.css"); :host { color: red; } .card, .safe { position: fixed; z-index: 99; background-image: url("/evil.png"); color: red; }'
	);

	assert.equal(result.css, '.card, .safe { color: red; }');
	assert.deepEqual(
		result.diagnostics.map((diagnostic) => diagnostic.message),
		[
			'Stripped unsupported @import preview CSS rule',
			'Stripped unsupported preview CSS selector ":host"',
			'Stripped unsupported position declaration from preview CSS',
			'Stripped unsupported z-index declaration from preview CSS',
			'Blocked unsafe preview CSS value for background-image'
		]
	);
});

test('inspectContentComponentPreviewCssSource reports filtered preview css diagnostics', () => {
	const result = inspectContentComponentPreviewCssSource(
		'.card { transition: opacity 120ms ease; color: red; }'
	);

	assert.equal(result.css, '.card { color: red; }');
	assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.message), [
		'Stripped unsupported transition declaration from preview CSS'
	]);
});
