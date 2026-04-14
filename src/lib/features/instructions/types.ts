import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';

export type InstructionInputType = 'text' | 'slug' | 'boolean' | 'select';

export interface InstructionInputOption {
	value: string;
	label: string;
}

export interface InstructionInputDefinition {
	id: string;
	type: InstructionInputType;
	label: string;
	description?: string;
	required?: boolean;
	defaultValue?: string | boolean;
	options?: InstructionInputOption[];
}

export interface InstructionConditionalLine {
	text: string;
	if?: string;
}

export interface InstructionConfirmation {
	title?: string;
	summary: InstructionConditionalLine[];
}

export interface InstructionNote {
	text: string;
	if?: string;
}

export interface InstructionNavigationConfig {
	enabled?: string | boolean;
	addItem: string;
}

export interface InstructionDefinition {
	id: string;
	label: string;
	description: string;
	inputs: InstructionInputDefinition[];
	navigation?: InstructionNavigationConfig;
	confirmation?: InstructionConfirmation;
	notes?: InstructionNote[];
}

export interface InstructionTemplateFile {
	sourcePath: string;
	destinationPathTemplate: string;
	condition?: string;
	skipIfExists: boolean;
	body: string;
}

export interface DiscoveredInstruction {
	path: string;
	definition: InstructionDefinition;
	templates: InstructionTemplateFile[];
}

export interface InstructionDiscoveryIssue {
	path: string;
	message: string;
}

export interface InstructionDiscoveryResult {
	instructions: DiscoveredInstruction[];
	issues: InstructionDiscoveryIssue[];
}

export type InstructionInputValue = string | boolean;

export type InstructionInputValues = Record<string, InstructionInputValue>;

export interface InstructionInputError {
	inputId: string;
	message: string;
}

export interface InstructionInputSummaryItem {
	label: string;
	value: string;
}

export interface PlannedFileCreate {
	path: string;
	content: string;
	sourceTemplatePath: string;
	status: 'create' | 'skip-existing' | 'conflict';
	reason: string | null;
}

export interface PlannedNavigationChange {
	path: string;
	status: 'create-manifest' | 'append-item' | 'noop-existing-item' | 'error';
	configId: string;
	summary: string;
	nextManifest?: NavigationManifest;
}

export interface InstructionExecutionPlan {
	instructionId: string;
	instructionLabel: string;
	inputValues: InstructionInputValues;
	inputSummary: InstructionInputSummaryItem[];
	confirmationTitle: string;
	confirmationSummary: string[];
	notes: string[];
	files: PlannedFileCreate[];
	navigationChange: PlannedNavigationChange | null;
	inputErrors: InstructionInputError[];
	planErrors: string[];
}

export interface InstructionApplyResult {
	createdFiles: string[];
	skippedFiles: string[];
	navigationUpdated: boolean;
	navigationStatus: PlannedNavigationChange['status'] | null;
}
