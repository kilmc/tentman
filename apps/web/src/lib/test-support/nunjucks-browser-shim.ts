import '../../../../../node_modules/.pnpm/nunjucks@3.2.4/node_modules/nunjucks/browser/nunjucks.js';

type NunjucksEnvironmentConstructor = new (
	loaders?: unknown,
	opts?: {
		autoescape?: boolean;
		throwOnUndefined?: boolean;
	}
) => {
	renderString(source: string, context?: Record<string, unknown>): string;
};

type NunjucksRuntime = {
	Environment: NunjucksEnvironmentConstructor;
};

const runtime = (globalThis as typeof globalThis & { nunjucks?: NunjucksRuntime }).nunjucks;

if (!runtime?.Environment) {
	throw new Error('Browser nunjucks runtime did not initialize');
}

export const Environment = runtime.Environment;
export default runtime;
