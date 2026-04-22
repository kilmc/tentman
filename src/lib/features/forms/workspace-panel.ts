import type { Writable } from 'svelte/store';
import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import type { ContentRecord } from '$lib/features/content-management/types';
import type {
	ContentPath,
	FormEditSession,
	RepeatablePanelMode
} from '$lib/features/forms/edit-session';

export const FORM_WORKSPACE_PANEL = Symbol('form-workspace-panel');

export interface RepeatableWorkspacePanel {
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
	navigationManifest?: NavigationManifest | null;
	onaddselectoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
	isDirty: boolean;
	submitError?: string;
}

export interface FormWorkspacePanelContext {
	activePanel: Writable<RepeatableWorkspacePanel | null>;
	setActivePanel: (panel: RepeatableWorkspacePanel | null) => void;
	session?: FormEditSession | null;
}
