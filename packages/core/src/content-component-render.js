import * as nunjucksModule from 'nunjucks';
import { createContentComponentRenderContext } from './content-components.js';

const nunjucksRuntime = nunjucksModule.Environment
	? nunjucksModule
	: nunjucksModule.default
		? nunjucksModule.default
		: globalThis.nunjucks;
const { Environment } = nunjucksRuntime;
const renderEnvironment = new Environment(undefined, {
	autoescape: true,
	throwOnUndefined: false
});

export function renderContentComponent(component, instance, options = {}) {
	const renderState = createContentComponentRenderContext(component, instance, options);

	try {
		return renderEnvironment.renderString(renderState.source, renderState.context, {
			path: renderState.path
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to render render.njk for ${component.definition.name}: ${message}`
		);
	}
}
