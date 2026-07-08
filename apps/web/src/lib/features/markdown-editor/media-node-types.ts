export type MarkdownMediaKind = 'audio' | 'video';

export interface MarkdownMediaSource {
	src: string;
	type?: string | null;
}

export interface MarkdownMediaTrack {
	src: string;
	kind?: string | null;
	label?: string | null;
	srclang?: string | null;
	default?: boolean;
}

export interface MarkdownMediaAttrs {
	src?: string | null;
	title?: string | null;
	ariaLabel?: string | null;
	controls?: boolean;
	sources?: MarkdownMediaSource[];
	tracks?: MarkdownMediaTrack[];
}
