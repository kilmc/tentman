import type {
	MarkdownToolbarDialogContribution,
	MarkdownToolbarDialogField,
	MarkdownToolbarDialogFieldOption
} from '$lib/features/markdown-editor/types';

export function getContentComponentDialogFieldOptions(
	field: Pick<MarkdownToolbarDialogField, 'options' | 'getOptions'>,
	values: Record<string, string>
): MarkdownToolbarDialogFieldOption[] {
	return field.getOptions?.(values) ?? field.options ?? [];
}

export function buildContentComponentDialogValues(options: {
	dialog: Pick<MarkdownToolbarDialogContribution, 'fields'>;
	initialValues?: Record<string, string>;
}): Record<string, string> {
	const nextValues = {
		...Object.fromEntries(
			options.dialog.fields.map((field) => [field.id, field.defaultValue ?? ''])
		),
		...(options.initialValues ?? {})
	};

	for (const field of options.dialog.fields) {
		if ((nextValues[field.id] ?? '').trim().length > 0) {
			continue;
		}

		const fieldOptions = getContentComponentDialogFieldOptions(field, nextValues);
		if (field.referenceBinding && fieldOptions.length === 1) {
			nextValues[field.id] = fieldOptions[0].value;
		}
	}

	return nextValues;
}

export function getContentComponentDialogValidationError(options: {
	dialog: Pick<MarkdownToolbarDialogContribution, 'fields' | 'validate'>;
	values: Record<string, string>;
}): string | null {
	const unavailableReferenceField = options.dialog.fields.find(
		(field) =>
			field.referenceBinding &&
			getContentComponentDialogFieldOptions(field, options.values).length === 0
	);
	if (unavailableReferenceField) {
		return `No valid ${unavailableReferenceField.label.toLowerCase()} references are available in this entry.`;
	}

	const missingRequiredField = options.dialog.fields.find(
		(field) => field.required && !options.values[field.id]?.trim()
	);
	if (missingRequiredField) {
		return `${missingRequiredField.label} is required.`;
	}

	return options.dialog.validate?.(options.values) ?? null;
}
