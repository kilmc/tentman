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

export interface FaqQuestion {
	question: string;
	answer: string;
}

export interface FaqSection {
	title: string;
	intro?: string;
	questions: FaqQuestion[];
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
	location?: string;
	responseTime?: string;
	body: string;
	hours: ContactHour[];
}

export interface FaqPageContent {
	title: string;
	intro: string;
	body: string;
	sections: FaqSection[];
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
