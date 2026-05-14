import { getFaqPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';
import { getMarkdownRenderContext } from '$lib/server/tentman-render-context';

export async function load() {
	const faq = await getFaqPage();
	const renderContext = await getMarkdownRenderContext('faq', faq);

	return {
		faq,
		faqHtml: await renderMarkdown(faq.body, renderContext),
		renderedSections: await Promise.all(
			faq.sections.map(async (section) => ({
				...section,
				questions: await Promise.all(
					section.questions.map(async (question) => ({
						...question,
						answerHtml: await renderMarkdown(question.answer, renderContext)
					}))
				)
			}))
		)
	};
}
