import type { Octokit } from 'octokit';
import { fetchContentDocument } from '$lib/content/service';
import type { DiscoveredConfig } from '$lib/config/discovery';
import { orderDiscoveredConfigs } from '$lib/features/content-management/navigation';
import { loadNavigationManifestState } from '$lib/features/content-management/navigation-manifest';
import { listChangedFilesBetweenRefs } from '$lib/github/branch';
import { createGitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	classifyReviewDraftChangedFiles,
	toReviewDraftChangedFiles
} from './candidate-changes';
import { buildConfigReviewSection } from './config-review';
import { buildTopLevelOrderChangeReview } from './structural-changes';
import type {
	OtherSiteChangesFile,
	OtherSiteChangesReview,
	PublishReviewModel,
	ReviewSection
} from './types';

function uniqueConfigsBySlug(configs: DiscoveredConfig[]): DiscoveredConfig[] {
	const seenSlugs = new Set<string>();
	const uniqueConfigs: DiscoveredConfig[] = [];

	for (const config of configs) {
		if (seenSlugs.has(config.slug)) {
			continue;
		}

		seenSlugs.add(config.slug);
		uniqueConfigs.push(config);
	}

	return uniqueConfigs;
}

function buildOtherSiteChanges(
	files: OtherSiteChangesFile[],
	isOnlyVisibleSection: boolean
): OtherSiteChangesReview | null {
	if (!files.length) {
		return null;
	}

	return {
		title: 'Other site changes',
		href: '/pages',
		files,
		defaultExpanded: isOnlyVisibleSection
	};
}

async function discoverConfigsForRef(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
		full_name: string;
		default_branch: string;
	},
	ref: string
): Promise<DiscoveredConfig[]> {
	const backend = createGitHubRepositoryBackend(octokit, repository, { defaultRef: ref });
	return backend.discoverConfigs();
}

export async function buildPublishReviewModel(input: {
	octokit: Octokit;
	owner: string;
	repo: {
		owner: string;
		name: string;
		full_name: string;
		default_branch: string;
	};
	backend: RepositoryBackend;
	configs: DiscoveredConfig[];
	baseBranch: string;
	draftBranch: string;
}): Promise<PublishReviewModel> {
	const [draftConfigs, changedFiles] = await Promise.all([
		discoverConfigsForRef(input.octokit, input.repo, input.draftBranch).catch(() => input.configs),
		listChangedFilesBetweenRefs(
			input.octokit,
			input.owner,
			input.repo.name,
			input.baseBranch,
			input.draftBranch
		).then(toReviewDraftChangedFiles)
	]);
	const baseConfigs = uniqueConfigsBySlug(input.configs);
	const mergedConfigs = uniqueConfigsBySlug([...draftConfigs, ...baseConfigs]);
	const candidateChanges = classifyReviewDraftChangedFiles(mergedConfigs, changedFiles);
	const baseBackend = createGitHubRepositoryBackend(input.octokit, input.repo, {
		defaultRef: input.baseBranch
	});
	const draftBackend = createGitHubRepositoryBackend(input.octokit, input.repo, {
		defaultRef: input.draftBranch
	});
	const [baseManifest, draftManifest, baseRootConfig, draftRootConfig] = await Promise.all([
		loadNavigationManifestState(baseBackend),
		loadNavigationManifestState(draftBackend),
		baseBackend.readRootConfig(),
		draftBackend.readRootConfig()
	]);
	const draftConfigMap = new Map(draftConfigs.map((config) => [config.slug, config]));
	const sections: ReviewSection[] = [];
	const unmappedConfigFiles: OtherSiteChangesFile[] = [];
	const candidateSlugs = new Set(candidateChanges.configFilesBySlug.keys());

	if (candidateChanges.manifestChanged) {
		for (const config of mergedConfigs) {
			if (config.config.collection) {
				candidateSlugs.add(config.slug);
			}
		}
	}

	for (const slug of candidateSlugs) {
		const draftConfig = draftConfigMap.get(slug) ?? mergedConfigs.find((config) => config.slug === slug);
		const baseConfig = baseConfigs.find((config) => config.slug === slug) ?? draftConfig;
		if (!draftConfig || !baseConfig) {
			for (const file of candidateChanges.configFilesBySlug.get(slug) ?? []) {
				unmappedConfigFiles.push({
					path: file.filename,
					status: file.status
				});
			}
			continue;
		}

		const [beforeContent, afterContent] = await Promise.all([
			fetchContentDocument(baseBackend, baseConfig.config, baseConfig.path, {
				branch: input.baseBranch
			}),
			fetchContentDocument(draftBackend, draftConfig.config, draftConfig.path, {
				branch: input.draftBranch
			})
		]);

		const section = buildConfigReviewSection({
			config: draftConfig,
			beforeContent,
			afterContent,
			baseManifest,
			draftManifest,
			baseRootConfig,
			draftRootConfig,
			fieldOptions: {
				repoAssetContext: {
					owner: input.repo.owner,
					repo: input.repo.name,
					baseBranch: input.baseBranch,
					draftBranch: input.draftBranch
				}
			},
			singleConfigVisible: false
		});

		if (section) {
			sections.push(section);
			continue;
		}

		for (const file of candidateChanges.configFilesBySlug.get(slug) ?? []) {
			unmappedConfigFiles.push({
				path: file.filename,
				status: file.status
			});
		}
	}

	const topLevelOrderChange = buildTopLevelOrderChangeReview(
		baseConfigs,
		draftConfigs,
		baseManifest,
		draftManifest,
		baseRootConfig,
		draftRootConfig
	);
	const orderedConfigs = orderDiscoveredConfigs(
		mergedConfigs,
		draftManifest.manifest,
		draftRootConfig
	);
	const orderedSections = orderedConfigs.flatMap((config) =>
		sections.find((section) => section.configSlug === config.slug) ?? []
	);
	const visibleSections = topLevelOrderChange ? orderedSections.length + 1 : orderedSections.length;
	const otherSiteChangesFiles: OtherSiteChangesFile[] = [
		...candidateChanges.otherTentmanFiles.map((file) => ({
			path: file.filename,
			status: file.status
		})),
		...unmappedConfigFiles
	];

	if (candidateChanges.rootConfigChanged && !topLevelOrderChange) {
		otherSiteChangesFiles.push({
			path: 'tentman.json',
			status: 'modified'
		});
	}

	if (candidateChanges.manifestChanged && !topLevelOrderChange) {
		otherSiteChangesFiles.push({
			path: 'tentman/navigation-manifest.json',
			status: 'modified'
		});
	}

	const uniqueOtherFiles = otherSiteChangesFiles.filter(
		(file, index, files) =>
			files.findIndex((candidate) => candidate.path === file.path && candidate.status === file.status) ===
			index
	);
	const otherSiteChanges = buildOtherSiteChanges(
		uniqueOtherFiles,
		visibleSections === 0
	);
	const sectionCount = orderedSections.length + (topLevelOrderChange ? 1 : 0) + (otherSiteChanges ? 1 : 0);
	const finalSections = orderedSections.map((section) => {
		const defaultExpanded =
			section.defaultExpanded ||
			sectionCount === 1 ||
			orderedSections.length === 1;
		const shouldExpandSingleItem = defaultExpanded && section.items.length === 1;

		return {
			...section,
			defaultExpanded,
			items: shouldExpandSingleItem
				? section.items.map((item: ReviewSection['items'][number]) => ({
						...item,
						defaultExpanded: true
					}))
				: section.items
		};
	});

	return {
		topLevelOrderChange,
		sections: finalSections,
		otherSiteChanges,
		hasHiddenUnreviewedChanges: candidateChanges.hiddenFiles.length > 0
	};
}
