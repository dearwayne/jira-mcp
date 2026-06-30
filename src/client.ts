/**
 * @file client.ts
 * @description Jira REST API client with HTTP Basic Authentication.
 * Provides typed methods for interacting with Jira Server v7.x API.
 */

import { JiraConfig, JiraCredentials, getApiBaseUrl, getAuthBaseUrl } from './config.js';

/**
 * Error thrown when Jira API requests fail.
 */
export class JiraApiError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly body?: unknown
    ) {
        super(message);
        this.name = 'JiraApiError';
    }
}

/**
 * HTTP method types supported by the client.
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Jira REST API client with basic authentication.
 * Supports dynamic credentials that can be provided per-request.
 */
export class JiraClient {
    private readonly apiBaseUrl: string;
    private readonly authBaseUrl: string;
    private readonly defaultAuthHeader: string | null;

    /**
     * Creates a new Jira client instance.
     * @param config - Validated Jira configuration
     */
    constructor(private readonly config: JiraConfig) {
        this.apiBaseUrl = getApiBaseUrl(config);
        this.authBaseUrl = getAuthBaseUrl(config);
        if (config.JIRA_USERNAME && config.JIRA_PASSWORD) {
            this.defaultAuthHeader = `Basic ${Buffer.from(
                `${config.JIRA_USERNAME}:${config.JIRA_PASSWORD}`
            ).toString('base64')}`;
        } else {
            this.defaultAuthHeader = null;
        }
    }

    /**
     * Creates an auth header from credentials.
     */
    private createAuthHeader(credentials: JiraCredentials): string {
        return `Basic ${Buffer.from(
            `${credentials.username}:${credentials.password}`
        ).toString('base64')}`;
    }

    /**
     * Gets the auth header to use for requests.
     * Uses session credentials if provided, otherwise falls back to default config.
     */
    private getAuthHeader(credentials?: JiraCredentials): string {
        if (credentials) {
            return this.createAuthHeader(credentials);
        }
        if (this.defaultAuthHeader) {
            return this.defaultAuthHeader;
        }
        throw new Error('Jira credentials not provided. Please configure JIRA_USERNAME and JIRA_PASSWORD in server environment or provide them via MCP client configuration.');
    }

    /**
     * Makes an authenticated request to the Jira API.
     * @param method - HTTP method
     * @param path - API path (relative to base URL)
     * @param body - Optional request body
     * @param useAuthEndpoint - Whether to use auth endpoint instead of api endpoint
     * @param credentials - Optional credentials to use for this request
     * @returns Parsed JSON response
     */
    private async request<T>(
        method: HttpMethod,
        path: string,
        body?: unknown,
        useAuthEndpoint = false,
        credentials?: JiraCredentials
    ): Promise<T> {
        const baseUrl = useAuthEndpoint ? this.authBaseUrl : this.apiBaseUrl;
        const url = `${baseUrl}${path}`;

        const headers: Record<string, string> = {
            Authorization: this.getAuthHeader(credentials),
            Accept: 'application/json',
        };

        if (body) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        // Handle empty responses (e.g., 204 No Content)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return {} as T;
        }

        const responseBody = await response.text();
        let parsedBody: unknown;

        try {
            parsedBody = responseBody ? JSON.parse(responseBody) : {};
        } catch {
            parsedBody = responseBody;
        }

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;

            if (typeof parsedBody === 'object' && parsedBody !== null) {
                const bodyRecord = parsedBody as Record<string, unknown>;
                const errorMessages = bodyRecord.errorMessages as string[] | undefined;
                if (Array.isArray(errorMessages) && errorMessages.length > 0) {
                    errorMessage = String(errorMessages[0]);
                } else if (typeof bodyRecord.message === 'string') {
                    errorMessage = bodyRecord.message;
                }
            }

            throw new JiraApiError(errorMessage, response.status, parsedBody);
        }

        return parsedBody as T;
    }

    // ============ Session/Auth Methods ============

    /**
     * Gets current authenticated user session info.
     * @param credentials - Optional credentials to use for this request
     * @returns Current user session data
     */
    async getCurrentSession(credentials?: JiraCredentials): Promise<JiraSession> {
        return this.request<JiraSession>('GET', '/session', undefined, true, credentials);
    }

    // ============ Issue Methods ============

    /**
     * Gets an issue by key or ID.
     * @param issueIdOrKey - Issue key (e.g., "PROJ-123") or ID
     * @param fields - Optional comma-separated list of fields to return
     * @param expand - Optional fields to expand
     * @param credentials - Optional credentials to use for this request
     * @returns Issue data
     */
    async getIssue(
        issueIdOrKey: string,
        fields?: string,
        expand?: string,
        credentials?: JiraCredentials
    ): Promise<JiraIssue> {
        const params = new URLSearchParams();
        if (fields) params.set('fields', fields);
        if (expand) params.set('expand', expand);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request<JiraIssue>('GET', `/issue/${issueIdOrKey}${query}`, undefined, false, credentials);
    }

    /**
     * Creates a new issue.
     * @param data - Issue creation data
     * @param credentials - Optional credentials to use for this request
     * @returns Created issue reference
     */
    async createIssue(data: CreateIssueInput, credentials?: JiraCredentials): Promise<CreatedIssue> {
        return this.request<CreatedIssue>('POST', '/issue', { fields: data }, false, credentials);
    }

    /**
     * Updates an existing issue.
     * @param issueIdOrKey - Issue key or ID
     * @param data - Fields to update
     * @param credentials - Optional credentials to use for this request
     */
    async updateIssue(issueIdOrKey: string, data: UpdateIssueInput, credentials?: JiraCredentials): Promise<void> {
        await this.request<void>('PUT', `/issue/${issueIdOrKey}`, { fields: data }, false, credentials);
    }

    /**
     * Deletes an issue.
     * @param issueIdOrKey - Issue key or ID
     * @param deleteSubtasks - Whether to delete subtasks
     * @param credentials - Optional credentials to use for this request
     */
    async deleteIssue(issueIdOrKey: string, deleteSubtasks = false, credentials?: JiraCredentials): Promise<void> {
        const query = deleteSubtasks ? '?deleteSubtasks=true' : '';
        await this.request<void>('DELETE', `/issue/${issueIdOrKey}${query}`, undefined, false, credentials);
    }

    /**
     * Gets comments on an issue.
     * @param issueIdOrKey - Issue key or ID
     * @param credentials - Optional credentials to use for this request
     * @returns Comments data
     */
    async getComments(issueIdOrKey: string, credentials?: JiraCredentials): Promise<CommentsResponse> {
        return this.request<CommentsResponse>('GET', `/issue/${issueIdOrKey}/comment`, undefined, false, credentials);
    }

    /**
     * Adds a comment to an issue.
     * @param issueIdOrKey - Issue key or ID
     * @param body - Comment body text
     * @param credentials - Optional credentials to use for this request
     * @returns Created comment
     */
    async addComment(issueIdOrKey: string, body: string, credentials?: JiraCredentials): Promise<JiraComment> {
        return this.request<JiraComment>('POST', `/issue/${issueIdOrKey}/comment`, {
            body,
        }, false, credentials);
    }

    // ============ Transition Methods ============

    /**
     * Gets available transitions for an issue.
     * @param issueIdOrKey - Issue key or ID
     * @param credentials - Optional credentials to use for this request
     * @returns Available transitions
     */
    async getTransitions(issueIdOrKey: string, credentials?: JiraCredentials): Promise<TransitionsResponse> {
        return this.request<TransitionsResponse>(
            'GET',
            `/issue/${issueIdOrKey}/transitions`,
            undefined,
            false,
            credentials
        );
    }

    /**
     * Transitions an issue to a new status.
     * @param issueIdOrKey - Issue key or ID
     * @param transitionId - ID of the transition to execute
     * @param comment - Optional comment to add
     * @param credentials - Optional credentials to use for this request
     */
    async transitionIssue(
        issueIdOrKey: string,
        transitionId: string,
        comment?: string,
        credentials?: JiraCredentials
    ): Promise<void> {
        const body: TransitionInput = {
            transition: { id: transitionId },
        };
        if (comment) {
            body.update = {
                comment: [{ add: { body: comment } }],
            };
        }
        await this.request<void>('POST', `/issue/${issueIdOrKey}/transitions`, body, false, credentials);
    }

    // ============ Search Methods ============

    /**
     * Searches for issues using JQL.
     * @param jql - JQL query string
     * @param maxResults - Maximum results to return (default 50)
     * @param startAt - Starting index for pagination
     * @param fields - Fields to include in results
     * @param credentials - Optional credentials to use for this request
     * @returns Search results
     */
    async search(
        jql: string,
        maxResults = 50,
        startAt = 0,
        fields?: string[],
        credentials?: JiraCredentials
    ): Promise<SearchResponse> {
        return this.request<SearchResponse>('POST', '/search', {
            jql,
            maxResults,
            startAt,
            fields: fields ?? ['summary', 'status', 'assignee', 'priority', 'issuetype'],
        }, false, credentials);
    }

    // ============ Project Methods ============

    /**
     * Gets all accessible projects.
     * @param credentials - Optional credentials to use for this request
     * @returns List of projects
     */
    async getProjects(credentials?: JiraCredentials): Promise<JiraProject[]> {
        return this.request<JiraProject[]>('GET', '/project', undefined, false, credentials);
    }

    /**
     * Gets a project by key or ID.
     * @param projectIdOrKey - Project key or ID
     * @param credentials - Optional credentials to use for this request
     * @returns Project data
     */
    async getProject(projectIdOrKey: string, credentials?: JiraCredentials): Promise<JiraProject> {
        return this.request<JiraProject>('GET', `/project/${projectIdOrKey}`, undefined, false, credentials);
    }

    // ============ User Methods ============

    /**
     * Gets the currently authenticated user.
     * @param credentials - Optional credentials to use for this request
     * @returns Current user data
     */
    async getCurrentUser(credentials?: JiraCredentials): Promise<JiraUser> {
        return this.request<JiraUser>('GET', '/myself', undefined, false, credentials);
    }

    /**
     * Gets a user by username.
     * @param username - Username to look up
     * @param credentials - Optional credentials to use for this request
     * @returns User data
     */
    async getUser(username: string, credentials?: JiraCredentials): Promise<JiraUser> {
        return this.request<JiraUser>('GET', `/user?username=${encodeURIComponent(username)}`, undefined, false, credentials);
    }

    // ============ Attachment Methods ============

    /**
     * Lists attachments for an issue.
     * Reads from the issue's `fields.attachment[]` array via
     * `GET /rest/api/2/issue/{key}?fields=attachment` (legacy Jira Server v2 API).
     * @param issueIdOrKey - Issue key (e.g., "PROJ-123") or ID
     * @param credentials - Optional credentials to use for this request
     * @returns Array of attachment metadata (empty if the issue has no attachments)
     */
    async listAttachments(issueIdOrKey: string, credentials?: JiraCredentials): Promise<JiraAttachment[]> {
        // Restrict the field set to `attachment` to keep the response small.
        const issue = await this.getIssue(issueIdOrKey, 'attachment', undefined, credentials);
        // `fields.attachment` is absent when attachments are disabled or none exist.
        const attachments = issue.fields.attachment as JiraAttachment[] | undefined;
        return Array.isArray(attachments) ? attachments : [];
    }

    /**
     * Gets metadata for a single attachment by its numeric id.
     * Uses `GET /rest/api/2/attachment/{id}` (legacy Jira Server v2 API).
     * @param attachmentId - Numeric attachment id
     * @param credentials - Optional credentials to use for this request
     * @returns Attachment metadata, including the absolute `content` download URL
     */
    async getAttachmentMeta(attachmentId: string, credentials?: JiraCredentials): Promise<JiraAttachment> {
        return this.request<JiraAttachment>(
            'GET',
            `/attachment/${encodeURIComponent(attachmentId)}`,
            undefined,
            false,
            credentials
        );
    }

    /**
     * Downloads the raw bytes of an attachment.
     *
     * The `content` URL from `fields.attachment[].content` (or `/attachment/{id}`)
     * is an ABSOLUTE URL (e.g. `https://<host>/secure/attachment/{id}/{filename}`)
     * that lives OUTSIDE the `/rest/api/2` base — so this does NOT reuse the private
     * JSON-only `request<T>()` helper. It performs a raw authenticated `fetch`,
     * reusing the same `Authorization: Basic ...` header, and follows redirects
     * (fetch default).
     *
     * @param contentUrl - Absolute download URL (the attachment's `content` field)
     * @param credentials - Optional credentials to use for this request
     * @returns The downloaded bytes plus the reported content type
     * @throws {JiraApiError} If the download fails (e.g. 401/403/404)
     */
    async downloadAttachment(
        contentUrl: string,
        credentials?: JiraCredentials
    ): Promise<{ buffer: Buffer; contentType: string }> {
        const response = await fetch(contentUrl, {
            method: 'GET',
            headers: {
                Authorization: this.getAuthHeader(credentials),
            },
            // fetch follows redirects by default; Jira serves attachment bytes
            // via a redirect to /secure/attachment/... which we must follow.
            redirect: 'follow',
        });

        if (!response.ok) {
            throw new JiraApiError(
                `Failed to download attachment from ${contentUrl} (status ${response.status})`,
                response.status
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType =
            response.headers.get('content-type') ?? 'application/octet-stream';
        return { buffer: Buffer.from(arrayBuffer), contentType };
    }
}

// ============ Type Definitions ============

/** Session information from auth endpoint */
export interface JiraSession {
    self: string;
    name: string;
    loginInfo: {
        failedLoginCount: number;
        loginCount: number;
        lastFailedLoginTime?: string;
        previousLoginTime?: string;
    };
}

/** Jira issue structure */
export interface JiraIssue {
    id: string;
    key: string;
    self: string;
    fields: {
        summary: string;
        description?: string;
        // status / issuetype / project are optional+nullable in practice: a custom
        // `fields` selection or an unusually-shaped ticket may omit them, so callers
        // MUST null-guard (optional chaining) before reading nested props like .name.
        status?: { name: string; id: string } | null;
        priority?: { name: string; id: string } | null;
        assignee?: { displayName: string; name: string; emailAddress?: string } | null;
        reporter?: { displayName: string; name: string } | null;
        issuetype?: { name: string; id: string } | null;
        project?: { key: string; name: string } | null;
        created: string;
        updated: string;
        labels?: string[];
        [key: string]: unknown;
    };
}

/** Input for creating an issue */
export interface CreateIssueInput {
    project: { key: string } | { id: string };
    summary: string;
    issuetype: { name: string } | { id: string };
    description?: string;
    assignee?: { name: string };
    priority?: { name: string } | { id: string };
    labels?: string[];
    [key: string]: unknown;
}

/** Response when creating an issue */
export interface CreatedIssue {
    id: string;
    key: string;
    self: string;
}

/** Input for updating an issue */
export interface UpdateIssueInput {
    summary?: string;
    description?: string;
    assignee?: { name: string } | null;
    priority?: { name: string } | { id: string };
    labels?: string[];
    [key: string]: unknown;
}

/** Jira comment structure */
export interface JiraComment {
    id: string;
    self: string;
    // author may be absent (e.g. anonymized/deleted user); callers must null-guard.
    author?: { displayName: string; name: string } | null;
    body: string;
    created: string;
    updated: string;
}

/** Response containing comments */
export interface CommentsResponse {
    startAt: number;
    maxResults: number;
    total: number;
    comments: JiraComment[];
}

/** Transition information */
export interface JiraTransition {
    id: string;
    name: string;
    // `to` and its statusCategory can be absent on some Jira Server configs; null-guard.
    to?: { id: string; name: string; statusCategory?: { name: string } | null } | null;
}

/** Response containing transitions */
export interface TransitionsResponse {
    transitions: JiraTransition[];
}

/** Input for transitioning an issue */
interface TransitionInput {
    transition: { id: string };
    update?: {
        comment?: Array<{ add: { body: string } }>;
    };
}

/** Search response structure */
export interface SearchResponse {
    startAt: number;
    maxResults: number;
    total: number;
    issues: JiraIssue[];
}

/** Jira project structure */
export interface JiraProject {
    id: string;
    key: string;
    name: string;
    self: string;
    projectTypeKey?: string;
    lead?: { displayName: string; name: string };
    description?: string;
}

/** Jira user structure */
export interface JiraUser {
    self: string;
    key: string;
    name: string;
    displayName: string;
    emailAddress?: string;
    active: boolean;
    timeZone?: string;
}

/**
 * Jira attachment structure (legacy Jira Server v2 API).
 * Shape of each item in an issue's `fields.attachment[]` and of
 * `GET /rest/api/2/attachment/{id}`.
 */
export interface JiraAttachment {
    /** Numeric attachment id (as a string) */
    id: string;
    /** REST self link for the attachment metadata */
    self: string;
    /** Original file name */
    filename: string;
    /** User who uploaded the attachment */
    author?: { displayName: string; name: string };
    /** ISO timestamp of when the attachment was created */
    created: string;
    /** File size in bytes */
    size: number;
    /** MIME type reported by Jira (e.g. "image/png") */
    mimeType: string;
    /**
     * ABSOLUTE download URL for the raw bytes
     * (typically `https://<host>/secure/attachment/{id}/{filename}`).
     * Note: this is NOT under the `/rest/api/2` base.
     */
    content: string;
    /** Optional absolute URL to a thumbnail (images only) */
    thumbnail?: string;
}
