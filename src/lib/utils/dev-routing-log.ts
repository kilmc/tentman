import { dev } from '$app/environment';

export function logDevRouting(event: string, detail: Record<string, unknown> = {}): void {
	if (!dev) {
		return;
	}

	console.info('[tentman:routing:dev]', {
		event,
		timestamp: new Date().toISOString(),
		...detail
	});
}
