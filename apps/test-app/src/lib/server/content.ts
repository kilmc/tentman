import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getConfigReferences, getItemReferences, orderByReferences } from './tentman-core';
import type {
	AboutPageContent,
	BlogPost,
	BlogPostPreview,
	ContactPageContent
} from '$lib/content/types';

type FrontmatterValue = boolean | string;
type NavigationItem = {
	href: string;
	label: string;
};
type DefaultNavigationItem = NavigationItem & {
	configId: string;
	configPath: string;
};
type NavigationManifest = {
	version: 1;
	content?: {
		items: string[];
	};
	collections?: Record<
		string,
		{
			items: string[];
		}
	>;
};

const projectRoot = process.cwd();
const defaultNavigation = [
	{
		href: '/about',
		label: 'About',
		configId: 'about',
		configPath: 'tentman/configs/about.tentman.json'
	},
	{
		href: '/contact',
		label: 'Contact',
		configId: 'contact',
		configPath: 'tentman/configs/contact.tentman.json'
	},
	{
		href: '/blog',
		label: 'Blog',
		configId: 'blog',
		configPath: 'tentman/configs/blog.tentman.json'
	}
] as DefaultNavigationItem[];

function getAbsolutePath(relativePath: string): string {
	return resolve(projectRoot, relativePath);
}

async function readJsonFile<T>(relativePath: string): Promise<T> {
	const file = await readFile(getAbsolutePath(relativePath), 'utf8');
	return JSON.parse(file) as T;
}

async function readNavigationManifest(): Promise<NavigationManifest | null> {
	try {
		return await readJsonFile<NavigationManifest>('tentman/navigation-manifest.json');
	} catch {
		return null;
	}
}

async function readConfigReferences(relativePath: string, fallbackId: string): Promise<string[]> {
	try {
		const config = await readJsonFile<{
			_tentmanId?: string;
			id?: string;
			slug?: string;
		}>(relativePath);

		return getConfigReferences(config);
	} catch {
		return [fallbackId];
	}
}

function parseFrontmatterValue(value: string): FrontmatterValue {
	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

function collectIndentedBlock(
	lines: string[],
	startIndex: number
): { value: string; nextIndex: number } {
	const blockLines: string[] = [];
	let index = startIndex;

	while (index < lines.length) {
		const line = lines[index];

		if (!/^[ \t]+/.test(line)) {
			break;
		}

		blockLines.push(line.replace(/^[ \t]/, ''));
		index += 1;
	}

	return {
		value: blockLines.join('\n'),
		nextIndex: index
	};
}

function parseFrontmatterBlockValue(marker: string, rawValue: string): FrontmatterValue {
	if (marker.startsWith('>')) {
		return rawValue
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.join(' ');
	}

	if (marker.startsWith('|')) {
		return rawValue;
	}

	return parseFrontmatterValue(rawValue);
}

function parseMarkdownDocument(document: string): {
	body: string;
	data: Record<string, FrontmatterValue>;
} {
	const match = document.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

	if (!match) {
		throw new Error('Expected a markdown document with frontmatter');
	}

	const data: Record<string, FrontmatterValue> = {};

	const frontmatterLines = match[1].split('\n');

	for (let index = 0; index < frontmatterLines.length; ) {
		const line = frontmatterLines[index];
		const trimmed = line.trim();

		if (!trimmed) {
			index += 1;
			continue;
		}

		const separatorIndex = trimmed.indexOf(':');

		if (separatorIndex === -1) {
			throw new Error(`Invalid frontmatter line: ${trimmed}`);
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();

		if (/^[>|][+-]?$/.test(value)) {
			const block = collectIndentedBlock(frontmatterLines, index + 1);
			data[key] = parseFrontmatterBlockValue(value, block.value);
			index = block.nextIndex;
			continue;
		}

		data[key] = parseFrontmatterValue(value);
		index += 1;
	}

	return {
		data,
		body: match[2].trim()
	};
}

function getReadingTimeMinutes(body: string): number {
	const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(wordCount / 180));
}

function isBlogPost(value: Partial<BlogPost>): value is BlogPost {
	return (
		typeof value.title === 'string' &&
		typeof value.slug === 'string' &&
		typeof value.body === 'string'
	);
}

async function readBlogPost(relativePath: string): Promise<BlogPost> {
	const raw = await readFile(getAbsolutePath(relativePath), 'utf8');
	const { body, data } = parseMarkdownDocument(raw);

	const post: Partial<BlogPost> = {
		title: typeof data.title === 'string' ? data.title : undefined,
		slug: typeof data.slug === 'string' ? data.slug : undefined,
		date: typeof data.date === 'string' ? data.date : undefined,
		author: typeof data.author === 'string' ? data.author : undefined,
		coverImage: typeof data.coverImage === 'string' ? data.coverImage : undefined,
		excerpt: typeof data.excerpt === 'string' ? data.excerpt : undefined,
		published: data.published === true,
		body,
		readingTimeMinutes: getReadingTimeMinutes(body)
	};

	if (
		!isBlogPost(post) ||
		typeof post.date !== 'string' ||
		typeof post.author !== 'string' ||
		typeof post.excerpt !== 'string'
	) {
		throw new Error(`Invalid blog post frontmatter in ${relativePath}`);
	}

	return post;
}

function comparePostDates(left: BlogPostPreview, right: BlogPostPreview): number {
	return right.date.localeCompare(left.date);
}

export async function getPrimaryNavigation(): Promise<NavigationItem[]> {
	const manifest = await readNavigationManifest();
	const manifestIds = manifest?.content?.items;
	const navigationEntries = await Promise.all(
		defaultNavigation.map(async (item) => ({
			...item,
			references: await readConfigReferences(item.configPath, item.configId)
		}))
	);

	if (!manifestIds?.length) {
		return navigationEntries.map(({ href, label }) => ({ href, label }));
	}

	return orderByReferences(navigationEntries, manifestIds, (item) => item.references).map(
		({ href, label }) => ({ href, label })
	);
}

export async function getAboutPage(): Promise<AboutPageContent> {
	return readJsonFile<AboutPageContent>('src/content/pages/about.json');
}

export async function getContactPage(): Promise<ContactPageContent> {
	return readJsonFile<ContactPageContent>('src/content/pages/contact.json');
}

export async function getAllPosts(): Promise<BlogPost[]> {
	const directoryEntries = await readdir(getAbsolutePath('src/content/posts'), {
		withFileTypes: true
	});

	const posts = await Promise.all(
		directoryEntries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => readBlogPost(`src/content/posts/${entry.name}`))
	);

	const manifest = await readNavigationManifest();
	const sortedPosts = posts.sort(comparePostDates);

	return orderByReferences(sortedPosts, manifest?.collections?.blog?.items, getItemReferences);
}

export async function getPublishedPosts(): Promise<BlogPostPreview[]> {
	const posts = await getAllPosts();
	return posts.filter((post) => post.published).sort(comparePostDates);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
	const posts = await getAllPosts();
	return posts.find((post) => post.slug === slug);
}
