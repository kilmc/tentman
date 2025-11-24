type FieldType = 'text' | 'date' | 'image' | 'boolean' | 'textarea';

type ConfigFields = { label: string; type: FieldType };
type Config = {
	label: string;
	template: string;
	filename: string;
	fields: ConfigFields[];
};

const exampleFiles: Record<string, { default: Config }> = import.meta.glob('./*.json', {
	eager: true
});

const templateFiles = import.meta.glob('./*.template.*', {
	eager: true
});
console.log('TEMPLATES', templateFiles);

export const examples = Object.values(exampleFiles).map((file) => file.default);
