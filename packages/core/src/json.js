export function assertPlainObject(value, message) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

export function parseJsonObject(source, context) {
	const parsed = JSON.parse(source);
	assertPlainObject(parsed, `${context} must be an object`);
	return parsed;
}

export function readOptionalString(value, key, context) {
	const candidate = value[key];

	if (candidate === undefined) {
		return undefined;
	}

	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new Error(`${context}.${key} must be a non-empty string`);
	}

	return candidate;
}

export function readRequiredString(value, key, context) {
	const candidate = readOptionalString(value, key, context);

	if (!candidate) {
		throw new Error(`${context}.${key} is required`);
	}

	return candidate;
}
