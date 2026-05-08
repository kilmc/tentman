import { getFaqPage } from '$lib/server/content';
import { renderMarkdown } from '$lib/content/markdown';

export async function load() {
	const faq = await getFaqPage();

	return {
		faq,
		faqHtml: await renderMarkdown(faq.body),
		renderedSections: await Promise.all(
			faq.sections.map(async (section) => ({
				...section,
				questions: await Promise.all(
					section.questions.map(async (question) => ({
						...question,
						answerHtml: await renderMarkdown(question.answer)
					}))
				)
			}))
		)
	};
}
