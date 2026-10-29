export interface HttpRequest {
    url: string;
    /** form-urlencoded body. */
    body: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface HttpResponse {
    status: number;
    /** Response body already parsed when it was JSON, otherwise the raw string. */
    data: unknown;
    raw: string;
}
/**
 * Sends a form-urlencoded POST and returns the parsed body.
 *
 * Uses native HTTP on iOS/Android (no CORS, no cookie jar surprises) and falls
 * back to `fetch` on web. Both paths funnel through the same error mapping, so
 * callers never have to care which one ran.
 */
export declare function postForm(req: HttpRequest): Promise<HttpResponse>;
