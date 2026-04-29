import type { Writable } from 'svelte/store';
import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import type { ContentRecord } from '$lib/features/content-management/types';
import type {
	ContentPath,
	FormPanelKind,
	FormEditSession,
	RepeatablePanelMode
} from '$lib/features/forms/edit-session';

export const FORM_SIDE_PANEL = Symbol('form-side-panel');
export const FORM_SIDE_PANEL_OPENER_ATTR = 'data-form-side-panel-opener';

export interface FormSidePanelState {
	id: string;
	kind: FormPanelKind;
	mode: RepeatablePanelMode;
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	selectedItem: ContentRecord;
	targetPath: ContentPath;
	itemFieldPath?: string;
	selectedIndex?: number;
	arrayPath?: ContentPath;
	imagePath?: string;
	blockRegistry: BlockRegistry;
	navigationManifest?: NavigationManifest | null;
	onaddselectoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
	isDirty: boolean;
	submitError?: string;
	hasParentPanel: boolean;
	parentPanelTitle?: string;
}

export interface FormSidePanelContext {
	activePanel: Writable<FormSidePanelState | null>;
	setActivePanel: (panel: FormSidePanelState | null) => void;
	session?: FormEditSession | null;
}
