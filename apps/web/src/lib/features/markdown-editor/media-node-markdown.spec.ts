import { describe, expect, it } from 'vitest';
import {
	escapeHtmlAttribute,
	getPrimaryMediaSrc,
	parseMediaElementAttributes,
	renderAudioMarkdown,
	renderVideoMarkdown
} from './media-node-markdown';

function createElement(html: string): Element {
	const match = /^<([a-z]+)/i.exec(html);
	if (!match) {
		throw new Error(`Invalid test HTML: ${html}`);
	}

	const element = {
		source: html,
		openingTag: html.match(/^<[^>]+>/)?.[0] ?? html,
		getAttribute(name: string) {
			const attrMatch = new RegExp(`${name}=(["'])(.*?)\\1`, 'i').exec(this.openingTag);
			return attrMatch?.[2] ?? null;
		},
		hasAttribute(name: string) {
			return new RegExp(`\\s${name}(?:\\s|>|=)`, 'i').test(this.openingTag);
		},
		querySelectorAll(selector: string) {
			const tagPattern = new RegExp(`<${selector}\\b[^>]*>`, 'gi');
			return [...this.source.matchAll(tagPattern)].map((entry) => createElement(entry[0]));
		}
	};

	return element as unknown as Element;
}

describe('media-node-markdown', () => {
	it('renders direct audio and video sources as stable HTML', () => {
		expect(renderAudioMarkdown({ src: '/audio/interview.mp3', controls: true })).toBe(
			'<audio controls src="/audio/interview.mp3"></audio>'
		);
		expect(renderVideoMarkdown({ src: '/video/trailer.mp4', controls: true })).toBe(
			'<video controls src="/video/trailer.mp4"></video>'
		);
	});

	it('escapes attribute values', () => {
		expect(escapeHtmlAttribute('/media/"quoted"&<unsafe>.mp4')).toBe(
			'/media/&quot;quoted&quot;&amp;&lt;unsafe&gt;.mp4'
		);
		expect(
			renderVideoMarkdown({
				src: '/media/trailer.mp4',
				title: 'A "quoted" trailer',
				controls: true
			})
		).toContain('title="A &quot;quoted&quot; trailer"');
	});

	it('renders nested video sources and tracks in order', () => {
		expect(
			renderVideoMarkdown({
				controls: true,
				sources: [
					{ src: '/media/trailer.webm', type: 'video/webm' },
					{ src: '/media/trailer.mp4', type: 'video/mp4' }
				],
				tracks: [
					{
						src: '/media/captions.vtt',
						kind: 'captions',
						label: 'English',
						srclang: 'en',
						default: true
					}
				]
			})
		).toBe(
			'<video controls><source src="/media/trailer.webm" type="video/webm"><source src="/media/trailer.mp4" type="video/mp4"><track src="/media/captions.vtt" kind="captions" label="English" srclang="en" default></video>'
		);
	});

	it('parses direct and nested media attributes', () => {
		expect(
			parseMediaElementAttributes(
				createElement(
					'<video controls title="Trailer"><source src="/media/trailer.webm" type="video/webm"><track src="/media/captions.vtt" kind="captions" label="English" srclang="en" default></video>'
				),
				'video'
			)
		).toEqual({
			src: null,
			title: 'Trailer',
			ariaLabel: null,
			controls: true,
			sources: [{ src: '/media/trailer.webm', type: 'video/webm' }],
			tracks: [
				{
					src: '/media/captions.vtt',
					kind: 'captions',
					label: 'English',
					srclang: 'en',
					default: true
				}
			]
		});
	});

	it('uses direct src before nested sources as the primary preview value', () => {
		expect(
			getPrimaryMediaSrc({
				src: '/media/direct.mp4',
				sources: [{ src: '/media/fallback.webm' }]
			})
		).toBe('/media/direct.mp4');
		expect(getPrimaryMediaSrc({ sources: [{ src: '/media/fallback.webm' }] })).toBe(
			'/media/fallback.webm'
		);
	});
});
