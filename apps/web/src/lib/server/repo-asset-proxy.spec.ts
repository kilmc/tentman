import { describe, expect, it } from 'vitest';
import { getAssetContentType } from './repo-asset-proxy';

describe('repo-asset-proxy', () => {
	it('returns playable content types for common media and file assets', () => {
		expect(getAssetContentType('static/media/trailer.mp4')).toBe('video/mp4');
		expect(getAssetContentType('static/media/trailer.webm')).toBe('video/webm');
		expect(getAssetContentType('static/media/interview.mp3')).toBe('audio/mpeg');
		expect(getAssetContentType('static/media/interview.m4a')).toBe('audio/mp4');
		expect(getAssetContentType('static/media/interview.wav')).toBe('audio/wav');
		expect(getAssetContentType('static/media/brief.pdf')).toBe('application/pdf');
	});
});
