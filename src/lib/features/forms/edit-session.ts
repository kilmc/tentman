import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

export type ContentPath = Array<string | number>;
export type RepeatablePanelMode = 'create' | 'edit';

export interface OpenRepeatablePanelInput {
	id: string;
	mode: RepeatablePanelMode;
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	selectedIndex: number;
	selectedItem: ContentRecord;
	arrayPath: ContentPath;
	fieldPath?: string;
	imagePath?: string;
	blockRegistry: BlockRegistry;
}

export interface RepeatablePanelView extends OpenRepeatablePanelInput {
	selectedItem: ContentRecord;
	isDirty: boolean;
	submitError?: string;
}

export interface FormDirtyState {
	isDirty: boolean;
	hasPanelDraft: boolean;
	hasCreatePanelDraft: boolean;
}

export type PrepareSubmitResult =
	| { ok: true; data: ContentRecord }
	| { ok: false; data: ContentRecord; message: string };

interface PanelEntry extends OpenRepeatablePanelInput {
	draftItem: ContentRecord;
	initialItem: ContentRecord;
	submitError?: string;
}

interface FormEditSessionOptions {
	onChange?: (state: FormDirtyState) => void;
	onPanelChange?: (panel: RepeatablePanelView | null) => void;
}

export interface FormEditSession {
	getData: () => ContentRecord;
	setData: (data: ContentRecord) => void;
	updateData: (data: ContentRecord) => void;
	getDirtyState: () => FormDirtyState;
	getActivePanel: () => RepeatablePanelView | null;
	openPanel: (panel: OpenRepeatablePanelInput) => void;
	updatePanelField: (blockId: string, value: ContentValue | undefined) => void;
	commitPanel: () => void;
	closePanel: () => void;
	discardPanel: () => void;
	removePanelItem: () => void;
	prepareSubmit: () => PrepareSubmitResult;
	markSaved: (data?: ContentRecord) => void;
	destroy: () => void;
}

export function createFormEditSession(
	initialData: ContentRecord,
	options: FormEditSessionOptions = {}
): FormEditSession {
	let data = cloneContentRecord(initialData);
	let baseline = cloneContentRecord(initialData);
	let panelStack: PanelEntry[] = [];

	function getDirtyState(): FormDirtyState {
		return {
			isDirty: getFingerprint(data) !== getFingerprint(baseline) || panelStack.some(isPanelDirty),
			hasPanelDraft: panelStack.some(isPanelDirty),
			hasCreatePanelDraft: panelStack.some(
				(panel) => panel.mode === 'create' && isPanelDirty(panel)
			)
		};
	}

	function getActiveEntry(): PanelEntry | null {
		return panelStack.at(-1) ?? null;
	}

	function getActivePanel(): RepeatablePanelView | null {
		const active = getActiveEntry();
		return active ? toPanelView(active) : null;
	}

	function notify() {
		options.onChange?.(getDirtyState());
		options.onPanelChange?.(getActivePanel());
	}

	function setData(nextData: ContentRecord) {
		data = cloneContentRecord(nextData);
		notify();
	}

	function updateData(nextData: ContentRecord) {
		data = nextData;
		notify();
	}

	function openPanel(panel: OpenRepeatablePanelInput) {
		const normalizedPanel = {
			...panel,
			arrayPath: [...panel.arrayPath],
			selectedItem: cloneContentRecord(panel.selectedItem),
			draftItem: cloneContentRecord(panel.selectedItem),
			initialItem: cloneContentRecord(panel.selectedItem)
		} satisfies PanelEntry;

		const active = getActiveEntry();
		if (!active) {
			panelStack = [normalizedPanel];
			notify();
			return;
		}

		const nested = isNestedPanel(active, normalizedPanel);
		if (!nested && active.mode === 'edit' && isPanelDirty(active)) {
			commitEntry(active);
		}

		panelStack = nested ? [...panelStack, normalizedPanel] : [normalizedPanel];
		notify();
	}

	function updatePanelField(blockId: string, value: ContentValue | undefined) {
		const active = getActiveEntry();
		if (!active) {
			return;
		}

		active.draftItem = {
			...active.draftItem,
			[blockId]: value
		};
		active.submitError = undefined;
		notify();
	}

	function commitPanel() {
		const active = getActiveEntry();
		if (!active || !isPanelDirty(active)) {
			return;
		}

		commitEntry(active);
		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function closePanel() {
		const active = getActiveEntry();
		if (!active) {
			return;
		}

		if (active.mode === 'edit' && isPanelDirty(active)) {
			commitEntry(active);
		}

		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function discardPanel() {
		if (panelStack.length === 0) {
			return;
		}

		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function removePanelItem() {
		const active = getActiveEntry();
		if (!active || active.mode !== 'edit') {
			return;
		}

		const nextItems = getCurrentArrayForEntry(active).filter(
			(_, index) => index !== active.selectedIndex
		);
		applyArrayForEntry(active, nextItems);
		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function prepareSubmit(): PrepareSubmitResult {
		const active = getActiveEntry();
		if (active?.mode === 'create' && isPanelDirty(active)) {
			active.submitError = `Add ${active.title} or go back before saving the page.`;
			notify();
			return {
				ok: false,
				data,
				message: active.submitError
			};
		}

		while (panelStack.length > 0) {
			const nextActive = getActiveEntry();
			if (nextActive?.mode === 'edit' && isPanelDirty(nextActive)) {
				commitEntry(nextActive);
			}
			panelStack = panelStack.slice(0, -1);
		}

		notify();
		return {
			ok: true,
			data
		};
	}

	function markSaved(nextData: ContentRecord = data) {
		data = cloneContentRecord(nextData);
		baseline = cloneContentRecord(nextData);
		panelStack = [];
		notify();
	}

	function destroy() {
		panelStack = [];
		options.onPanelChange?.(null);
	}

	function commitEntry(entry: PanelEntry) {
		const nextItem = cloneContentRecord(entry.draftItem);
		const currentItems = getCurrentArrayForEntry(entry);
		const nextItems =
			entry.mode === 'create'
				? [
						...currentItems.slice(0, entry.selectedIndex),
						nextItem,
						...currentItems.slice(entry.selectedIndex)
					]
				: currentItems.map((item, index) => (index === entry.selectedIndex ? nextItem : item));

		applyArrayForEntry(entry, nextItems);
		entry.initialItem = nextItem;
		entry.draftItem = cloneContentRecord(nextItem);
		entry.submitError = undefined;
	}

	function getCurrentArrayForEntry(entry: PanelEntry): ContentValue[] {
		const parent = getParentEntry(entry);
		const source = parent ? parent.draftItem : data;
		const path = parent ? getRelativeArrayPath(parent, entry) : entry.arrayPath;
		const value = getValueAtPath(source, path);
		return Array.isArray(value) ? value : [];
	}

	function applyArrayForEntry(entry: PanelEntry, nextItems: ContentValue[]) {
		const parent = getParentEntry(entry);

		if (parent) {
			parent.draftItem = setValueAtPath(
				parent.draftItem,
				getRelativeArrayPath(parent, entry),
				nextItems
			) as ContentRecord;
			return;
		}

		data = setValueAtPath(data, entry.arrayPath, nextItems) as ContentRecord;
	}

	function getParentEntry(entry: PanelEntry): PanelEntry | null {
		const index = panelStack.indexOf(entry);
		return index > 0 ? (panelStack[index - 1] ?? null) : null;
	}

	return {
		getData: () => data,
		setData,
		updateData,
		getDirtyState,
		getActivePanel,
		openPanel,
		updatePanelField,
		commitPanel,
		closePanel,
		discardPanel,
		removePanelItem,
		prepareSubmit,
		markSaved,
		destroy
	};
}

export function parseFieldPath(path: string): ContentPath {
	const segments: ContentPath = [];
	const pattern = /([^[.\]]+)|\[(\d+)\]/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(path)) !== null) {
		if (match[1] !== undefined) {
			segments.push(match[1]);
		} else if (match[2] !== undefined) {
			segments.push(Number(match[2]));
		}
	}

	return segments;
}

export function cloneContentRecord(item: ContentRecord): ContentRecord {
	try {
		return structuredClone(item) as ContentRecord;
	} catch {
		return JSON.parse(JSON.stringify(item)) as ContentRecord;
	}
}

function cloneContentValue<T extends ContentValue | ContentRecord | undefined>(value: T): T {
	if (value === undefined) {
		return value;
	}

	try {
		return structuredClone(value) as T;
	} catch {
		return JSON.parse(JSON.stringify(value)) as T;
	}
}

function toPanelView(entry: PanelEntry): RepeatablePanelView {
	const { draftItem, initialItem, submitError, ...panel } = entry;
	return {
		...panel,
		selectedItem: draftItem,
		isDirty: isPanelDirty(entry),
		submitError
	};
}

function isPanelDirty(panel: PanelEntry): boolean {
	return getFingerprint(panel.draftItem) !== getFingerprint(panel.initialItem);
}

function getFingerprint(value: unknown): string {
	return JSON.stringify(value);
}

function isNestedPanel(parent: PanelEntry, child: PanelEntry): boolean {
	const parentItemPath = [...parent.arrayPath, parent.selectedIndex];
	return pathStartsWith(child.arrayPath, parentItemPath);
}

function pathStartsWith(path: ContentPath, prefix: ContentPath): boolean {
	return prefix.every((segment, index) => path[index] === segment);
}

function getRelativeArrayPath(parent: PanelEntry, child: PanelEntry): ContentPath {
	return child.arrayPath.slice(parent.arrayPath.length + 1);
}

function getValueAtPath(source: ContentRecord, path: ContentPath): ContentValue | undefined {
	let current: unknown = source;

	for (const segment of path) {
		if (!current || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string | number, ContentValue | undefined>)[segment];
	}

	return current as ContentValue | undefined;
}

function setValueAtPath(
	source: ContentRecord | ContentValue[],
	path: ContentPath,
	value: ContentValue
): ContentRecord | ContentValue[] {
	if (path.length === 0) {
		return cloneContentValue(value) as ContentRecord | ContentValue[];
	}

	const [segment, ...rest] = path;
	const clone = Array.isArray(source) ? [...source] : { ...source };

	if (rest.length === 0) {
		(clone as Record<string | number, ContentValue>)[segment] = cloneContentValue(
			value
		) as ContentValue;
		return clone;
	}

	const current = (clone as Record<string | number, ContentValue | undefined>)[segment];
	const nextSource =
		current && typeof current === 'object'
			? (current as ContentRecord | ContentValue[])
			: typeof rest[0] === 'number'
				? []
				: {};

	(clone as Record<string | number, ContentValue>)[segment] = setValueAtPath(
		nextSource,
		rest,
		value
	) as ContentValue;

	return clone;
}
