/**
 * @param {unknown} value
 * @param {string} message
 * @returns {asserts value is Record<string, unknown>}
 */
export function assertPlainObject(value, message) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}
}

/**
 * @param {string} source
 * @param {string} context
 * @returns {Record<string, unknown>}
 */
export function parseJsonObject(source, context) {
	const parsed = JSON.parse(source);
	assertPlainObject(parsed, `${context} must be an object`);
	return parsed;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function serializeJson(value) {
	return `${JSON.stringify(value, null, '\t')}\n`;
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} key
 * @param {string} context
 * @returns {string | undefined}
 */
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

/**
 * @param {Record<string, unknown>} value
 * @param {string} key
 * @param {string} context
 * @returns {string}
 */
export function readRequiredString(value, key, context) {
	const candidate = readOptionalString(value, key, context);

	if (!candidate) {
		throw new Error(`${context}.${key} is required`);
	}

	return candidate;
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} key
 * @param {string} context
 * @returns {string[] | undefined}
 */
export function readOptionalStringArray(value, key, context) {
	const candidate = value[key];

	if (candidate === undefined) {
		return undefined;
	}

	if (!Array.isArray(candidate)) {
		throw new Error(`${context}.${key} must be an array of non-empty strings`);
	}

	return candidate.map((item, index) => {
		if (typeof item !== 'string' || item.length === 0) {
			throw new Error(`${context}.${key}[${index}] must be a non-empty string`);
		}

		return item;
	});
}
