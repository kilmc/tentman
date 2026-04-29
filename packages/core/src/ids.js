import { randomBytes } from 'node:crypto';

export const TENTMAN_ID_PREFIX = 'tent_';
export const TENTMAN_ID_PATTERN = /^tent_[0-9A-HJKMNP-TV-Z]{26}$/;

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTimestamp(timestamp) {
	let value = BigInt(timestamp);
	let output = '';

	for (let index = 0; index < 10; index += 1) {
		output = CROCKFORD_ALPHABET[Number(value % 32n)] + output;
		value /= 32n;
	}

	return output;
}

function encodeRandomBytes(bytes) {
	let value = BigInt(`0x${bytes.toString('hex')}`);
	let output = '';

	for (let index = 0; index < 16; index += 1) {
		output = CROCKFORD_ALPHABET[Number(value % 32n)] + output;
		value /= 32n;
	}

	return output;
}

export function createTentmanId() {
	return `${TENTMAN_ID_PREFIX}${encodeTimestamp(Date.now())}${encodeRandomBytes(randomBytes(10))}`;
}

export function isTentmanId(value) {
	return typeof value === 'string' && TENTMAN_ID_PATTERN.test(value);
}

export function describeTentmanId(value) {
	if (typeof value !== 'string' || value.length === 0) {
		return 'missing';
	}

	return isTentmanId(value) ? 'valid' : 'legacy-or-malformed';
}
