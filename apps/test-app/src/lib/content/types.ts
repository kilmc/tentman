export interface GalleryItem {
	image: string;
	alt: string;
	caption?: string;
}

export interface Highlight {
	label: string;
	value: string;
	detail?: string;
}

export interface ContactHour {
	day: string;
	hours: string;
}

export interface AboutPageContent {
	title: string;
	intro: string;
	body: string;
	highlights: Highlight[];
	gallery: GalleryItem[];
}

export interface ContactPageContent {
	title: string;
	intro: string;
	email: string;
	phone?: string;
	office?: string;
	bookingUrl?: string;
	body: string;
	hours: ContactHour[];
	gallery: GalleryItem[];
}

export interface BlogPostPreview {
	title: string;
	slug: string;
	date: string;
	author: string;
	coverImage?: string;
	excerpt: string;
	published: boolean;
	readingTimeMinutes: number;
}

export interface BlogPost extends BlogPostPreview {
	body: string;
}
