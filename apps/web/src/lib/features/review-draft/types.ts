export type ReviewChangeKind = 'edited' | 'new' | 'deleted' | 'moved';

export interface ReviewBadge {
	label: string;
	tone: 'neutral' | 'accent' | 'danger';
}

export interface ReviewDiffSegment {
	value: string;
	status: 'unchanged' | 'added' | 'removed';
}

export interface ReviewDiffLine {
	value: string;
	status: 'unchanged' | 'added' | 'removed';
}

export interface ReviewMediaValue {
	value: string;
	previewUrl: string | null;
}

export interface ReviewObjectRow {
	label: string;
	value: string;
}

export interface ReviewStructuredEntry {
	title: string;
	changeKinds: ReviewChangeKind[];
	beforePosition?: number;
	afterPosition?: number;
	fields?: ReviewFieldChange[];
	beforeSummary?: string | null;
	afterSummary?: string | null;
}

export type ReviewFieldPresentation =
	| {
			kind: 'text';
			before: string | null;
			after: string | null;
			diffMode: 'inline' | 'lines' | 'none';
			beforeSegments?: ReviewDiffSegment[];
			afterSegments?: ReviewDiffSegment[];
			beforeLines?: ReviewDiffLine[];
			afterLines?: ReviewDiffLine[];
			isLong: boolean;
	  }
	| {
			kind: 'markdown';
			before: string | null;
			after: string | null;
			diffMode: 'inline' | 'lines' | 'none';
			beforeSegments?: ReviewDiffSegment[];
			afterSegments?: ReviewDiffSegment[];
			beforeLines?: ReviewDiffLine[];
			afterLines?: ReviewDiffLine[];
			isLong: boolean;
	  }
	| {
			kind: 'value';
			before: string | null;
			after: string | null;
	  }
	| {
			kind: 'media';
			before: ReviewMediaValue | null;
			after: ReviewMediaValue | null;
	  }
	| {
			kind: 'object';
			before: ReviewObjectRow[];
			after: ReviewObjectRow[];
	  }
	| {
			kind: 'structured';
			mode: 'nested' | 'context';
			entries?: ReviewStructuredEntry[];
			beforeSummary?: string[];
			afterSummary?: string[];
	  };

export interface ReviewFieldChange {
	fieldId: string;
	label: string;
	presentation: ReviewFieldPresentation;
	defaultExpanded: boolean;
}

export interface ReviewItemCard {
	itemId: string;
	title: string;
	href: string;
	changeKinds: ReviewChangeKind[];
	defaultExpanded: boolean;
	beforePosition?: number;
	afterPosition?: number;
	fields: ReviewFieldChange[];
}

export interface ReviewOrderEntry {
	id: string;
	label: string;
	position: number;
}

export interface OrderChangeReview {
	title: string;
	href: string;
	before: ReviewOrderEntry[];
	after: ReviewOrderEntry[];
}

export interface ReviewSection {
	configSlug: string;
	configLabel: string;
	isCollection: boolean;
	badges: ReviewBadge[];
	defaultExpanded: boolean;
	navigationHref: string;
	collectionOrderChange: OrderChangeReview | null;
	items: ReviewItemCard[];
}

export interface OtherSiteChangesFile {
	path: string;
	status: 'added' | 'modified' | 'removed' | 'renamed' | 'unknown';
}

export interface OtherSiteChangesReview {
	title: string;
	href: string;
	files: OtherSiteChangesFile[];
	defaultExpanded: boolean;
}

export interface PublishReviewModel {
	topLevelOrderChange: OrderChangeReview | null;
	sections: ReviewSection[];
	otherSiteChanges: OtherSiteChangesReview | null;
	hasHiddenUnreviewedChanges: boolean;
}
