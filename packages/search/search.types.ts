export interface SearchQuery {
    text?: string | undefined;
    extension?: string | undefined;
    minSize?: number | undefined;
    maxSize?: number | undefined;
    recentDays?: number | undefined;
    dir?: string | undefined;
}


export interface SearchResult {
    path: string;
    name: string;
    size: number;
    type: string;
    modified_at: string;
}