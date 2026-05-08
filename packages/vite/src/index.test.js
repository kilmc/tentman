import assert from 'node:assert/strict';
import test from 'node:test';
import { tentmanContentComponentReload } from './index.js';

function createServerDouble() {
	const messages = [];

	return {
		messages,
		ws: {
			send(message) {
				messages.push(message);
			}
		}
	};
}

test('creates a dev-only Vite plugin', () => {
	const plugin = tentmanContentComponentReload();

	assert.equal(plugin.name, 'tentman-content-component-reload');
	assert.equal(plugin.apply, 'serve');
	assert.equal(typeof plugin.handleHotUpdate, 'function');
});

test('triggers a full reload for Tentman content component template changes', () => {
	const server = createServerDouble();
	server.messages.length = 0;
	const plugin = tentmanContentComponentReload({
		componentsDir: '/tmp/site/tentman/components'
	});

	const result = plugin.handleHotUpdate({
		file: '/tmp/site/tentman/components/buy-button/render.njk',
		server
	});

	assert.deepEqual(result, []);
	assert.deepEqual(server.messages, [{ type: 'full-reload' }]);
});

test('triggers a full reload for component definition changes', () => {
	const server = createServerDouble();
	server.messages.length = 0;
	const plugin = tentmanContentComponentReload({
		componentsDir: '/tmp/site/tentman/components'
	});

	plugin.handleHotUpdate({
		file: '/tmp/site/tentman/components/buy-button/component.json',
		server
	});

	assert.deepEqual(server.messages, [{ type: 'full-reload' }]);
});

test('ignores files outside the configured components directory', () => {
	const server = createServerDouble();
	server.messages.length = 0;
	const plugin = tentmanContentComponentReload({
		componentsDir: '/tmp/site/tentman/components'
	});

	const result = plugin.handleHotUpdate({
		file: '/tmp/site/src/content/projects/berlin-maps.md',
		server
	});

	assert.equal(result, undefined);
	assert.deepEqual(server.messages, []);
});

test('ignores unrelated files inside the components directory', () => {
	const server = createServerDouble();
	server.messages.length = 0;
	const plugin = tentmanContentComponentReload({
		componentsDir: '/tmp/site/tentman/components'
	});

	const result = plugin.handleHotUpdate({
		file: '/tmp/site/tentman/components/buy-button/README.md',
		server
	});

	assert.equal(result, undefined);
	assert.deepEqual(server.messages, []);
});
