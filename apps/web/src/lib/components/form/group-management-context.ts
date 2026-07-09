export const FORM_GROUP_MANAGEMENT_COLLECTIONS = Symbol('FORM_GROUP_MANAGEMENT_COLLECTIONS');

export interface FormGroupManagementCollections {
	getCollections(): string[];
}
