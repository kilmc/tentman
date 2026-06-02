type TimingDetail = Record<string, unknown>;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readEnvFlag(name: string): boolean {
	const processValue = typeof process !== 'undefined' ? process.env?.[name] : undefined;
	const value = processValue ?? import.meta.env?.[name];
	return typeof value === 'string' && ENABLED_VALUES.has(value.toLowerCase());
}

export function isPerformanceLoggingEnabled(): boolean {
	return (
		Boolean(import.meta.env?.DEV) ||
		readEnvFlag('TENTMAN_TIMING_LOGS') ||
		readEnvFlag('VITE_TENTMAN_TIMING_LOGS')
	);
}

function normalizeTimingDetail(detail: TimingDetail): TimingDetail {
	return Object.fromEntries(
		Object.entries(detail).map(([key, value]) => {
			if (typeof value === 'number') {
				return [key, Number(value.toFixed(1))];
			}

			return [key, value];
		})
	);
}

export function logTiming(event: string, detail: TimingDetail = {}): void {
	if (!isPerformanceLoggingEnabled()) {
		return;
	}

	console.info('[tentman:timing]', {
		event,
		timestamp: new Date().toISOString(),
		...normalizeTimingDetail(detail)
	});
}

export async function timeAsync<T>(
	event: string,
	detail: TimingDetail,
	action: () => Promise<T>
): Promise<T> {
	const start = performance.now();

	try {
		const result = await action();
		logTiming(event, {
			...detail,
			status: 'ok',
			durationMs: performance.now() - start
		});
		return result;
	} catch (error) {
		logTiming(event, {
			...detail,
			status: 'error',
			errorStatus: error && typeof error === 'object' && 'status' in error ? error.status : null,
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			durationMs: performance.now() - start
		});
		throw error;
	}
}
