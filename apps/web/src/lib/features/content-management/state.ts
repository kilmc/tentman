import type { ParsedContentConfig } from '$lib/config/parse';
import type {
	RootConfig,
	StateCase,
	StateConfig,
	StateValue,
	StateVariant,
	StateVisibility
} from '$lib/config/types';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';

export interface ResolvedContentState {
	value: StateValue;
	label: string;
	variant: StateVariant | null;
	icon: string | null;
	visibility: Required<StateVisibility>;
}

export function getStateBadgeClassName(variant: ResolvedContentState['variant']): string {
	switch (variant) {
		case 'accent':
			return 'border-sky-200 bg-sky-50 text-sky-700';
		case 'success':
			return 'border-emerald-200 bg-emerald-50 text-emerald-700';
		case 'warning':
			return 'border-amber-200 bg-amber-50 text-amber-800';
		case 'danger':
			return 'border-red-200 bg-red-50 text-red-700';
		case 'muted':
		default:
			return 'border-stone-200 bg-stone-100 text-stone-700';
	}
}

function getDefaultVisibility(): Required<StateVisibility> {
	return {
		navigation: true,
		header: true,
		card: true
	};
}

function getResolvedCases(
	stateConfig: StateConfig,
	rootConfig?: RootConfig | null
): StateCase[] {
	const presetCases =
		stateConfig.preset && rootConfig?.statePresets?.[stateConfig.preset]
			? rootConfig.statePresets[stateConfig.preset].cases
			: [];
	const localCases = stateConfig.cases ?? [];
	const mergedCases = [...presetCases];

	for (const localCase of localCases) {
		const existingIndex = mergedCases.findIndex((candidate) => candidate.value === localCase.value);

		if (existingIndex === -1) {
			mergedCases.push(localCase);
			continue;
		}

		mergedCases[existingIndex] = localCase;
	}

	return mergedCases;
}

function resolveStateFromConfig(
	stateConfig: StateConfig | undefined,
	record: ContentRecord,
	rootConfig?: RootConfig | null
): ResolvedContentState | null {
	if (!stateConfig) {
		return null;
	}

	const cases = getResolvedCases(stateConfig, rootConfig);
	if (cases.length === 0) {
		return null;
	}

	const value = (record[stateConfig.blockId] ?? null) as StateValue;
	const matchedCase = cases.find((candidate) => candidate.value === value);

	if (!matchedCase) {
		return null;
	}

	return {
		value,
		label: matchedCase.label,
		variant: matchedCase.variant ?? null,
		icon: matchedCase.icon ?? null,
		visibility: {
			...getDefaultVisibility(),
			...(stateConfig.visibility ?? {})
		}
	};
}

export function resolveContentState(
	config: ParsedContentConfig,
	record: ContentRecord,
	rootConfig?: RootConfig | null
): ResolvedContentState | null {
	return resolveStateFromConfig(config.state, record, rootConfig);
}

export function resolveContentDocumentState(
	config: ParsedContentConfig,
	content: ContentDocument | null | undefined,
	rootConfig?: RootConfig | null
): ResolvedContentState | null {
	if (!content || Array.isArray(content)) {
		return null;
	}

	return resolveContentState(config, content, rootConfig);
}

export function resolveCollectionItemState(
	config: ParsedContentConfig,
	record: ContentRecord,
	rootConfig?: RootConfig | null
): ResolvedContentState | null {
	if (!config.collection || config.collection === true) {
		return null;
	}

	return resolveStateFromConfig(config.collection.state, record, rootConfig);
}
