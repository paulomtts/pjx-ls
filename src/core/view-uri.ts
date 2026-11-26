export const VIEW_SCHEME = "pjx-embedded";

/** The path of the view of the document at `sourceUri`. */
export const viewPath = (sourceUri: string) => `/${encodeURIComponent(sourceUri)}.html`;

export const sourceUriOf = (path: string) => decodeURIComponent(path.slice(1, -".html".length));
