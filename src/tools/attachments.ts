/**
 * @file tools/attachments.ts
 * @description Attachment-related MCP tools for Jira.
 * Provides tools for listing an issue's attachments and downloading attachment
 * bytes (inline image content blocks for images, temp-file offload otherwise).
 *
 * Legacy note: targets Jira Server v7.x — uses only the `/rest/api/2` API. The
 * attachment `content` field is an ABSOLUTE URL outside that base and is fetched
 * with a raw authenticated request via `JiraClient.downloadAttachment`.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { JiraApiError, JiraClient, type JiraAttachment } from '../client.js';
import { getCredentials } from '../index.js';

/** Max base64 payload size to inline for non-image attachments (256 KB). */
const MAX_INLINE_BYTES = 256 * 1024;

/**
 * Schema for list_attachments tool input.
 */
export const listAttachmentsSchema = z.object({
    issueKey: z.string().describe('The issue key (e.g., "PROJ-123") or ID'),
});

/**
 * Schema for get_attachment tool input.
 * Either provide `attachmentId` directly, or resolve by `issueKey` + `filename`.
 */
export const getAttachmentSchema = z.object({
    attachmentId: z
        .string()
        .optional()
        .describe('Numeric attachment id to download'),
    issueKey: z
        .string()
        .optional()
        .describe('Issue key/ID — used with filename to resolve an attachment id'),
    filename: z
        .string()
        .optional()
        .describe('Attachment filename to match within the issue (used with issueKey)'),
});

/**
 * Maps a raw Jira attachment to the clean shape returned to callers.
 */
function toCleanAttachment(a: JiraAttachment) {
    return {
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        created: a.created,
        author: a.author?.displayName,
        content: a.content,
        thumbnail: a.thumbnail,
    };
}

/**
 * Resolves a single attachment's metadata from the provided arguments.
 * Prefers `attachmentId`; falls back to matching `filename` within `issueKey`.
 * @throws {JiraApiError} If the attachment cannot be located.
 */
async function resolveAttachment(
    client: JiraClient,
    args: z.infer<typeof getAttachmentSchema>
): Promise<JiraAttachment> {
    const credentials = getCredentials();
    if (args.issueKey && args.filename) {
        const attachments = await client.listAttachments(args.issueKey, credentials);
        const match = attachments.find((a) => a.filename === args.filename);
        if (!match) {
            throw new JiraApiError(
                `No attachment named "${args.filename}" found on issue ${args.issueKey}`,
                404
            );
        }
        return match;
    }

    if (args.attachmentId) {
        if (args.issueKey) {
            const attachments = await client.listAttachments(args.issueKey, credentials);
            const match = attachments.find((a) => a.id === args.attachmentId);
            if (match) {
                return match;
            }
        }
        return client.getAttachmentMeta(args.attachmentId, credentials);
    }

    throw new JiraApiError(
        'Provide either `attachmentId`, or both `issueKey` and `filename`',
        400
    );
}

/**
 * Creates attachment tool handlers.
 * @param client - Jira client instance
 * @returns Object containing all attachment tool handlers
 */
export function createAttachmentTools(client: JiraClient) {
    return {
        /**
         * Lists attachments on an issue.
         */
        jira_list_attachments: async (args: z.infer<typeof listAttachmentsSchema>) => {
            const credentials = getCredentials();
            const attachments = await client.listAttachments(args.issueKey, credentials);

            if (attachments.length === 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    issueKey: args.issueKey,
                                    total: 0,
                                    attachments: [],
                                    message: `Issue ${args.issueKey} has no attachments.`,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                issueKey: args.issueKey,
                                total: attachments.length,
                                attachments: attachments.map(toCleanAttachment),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },

        /**
         * Downloads an attachment.
         * - Images (`mimeType` starting with `image/`) are returned as an MCP
         *   image content block so the calling agent can view them.
         * - Other types are written to a temp file and returned as a text block
         *   with the saved path + metadata (plus inline base64 if small).
         */
        jira_get_attachment: async (args: z.infer<typeof getAttachmentSchema>) => {
            const meta = await resolveAttachment(client, args);
            const credentials = getCredentials();
            const { buffer } = await client.downloadAttachment(meta.content, credentials);

            // Prefer Jira's declared mimeType; it is authoritative for legacy server.
            const mimeType = meta.mimeType || 'application/octet-stream';

            // Image: return an MCP image content block { type, data, mimeType }.
            if (mimeType.startsWith('image/')) {
                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: buffer.toString('base64'),
                            mimeType,
                        },
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    id: meta.id,
                                    filename: meta.filename,
                                    mimeType,
                                    size: meta.size,
                                    created: meta.created,
                                    author: meta.author?.displayName,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }

            // Non-image: write bytes to a temp file and return its path + metadata.
            const dir = path.join(os.tmpdir(), 'jira-mcp');
            await fs.mkdir(dir, { recursive: true });
            // Sanitize the filename to avoid path traversal via the temp path.
            const safeName = path.basename(meta.filename || `attachment-${meta.id}`);
            const filePath = path.join(dir, `${meta.id}-${safeName}`);
            await fs.writeFile(filePath, buffer);

            // Inline base64 only for small payloads to avoid huge responses.
            const small = buffer.byteLength < MAX_INLINE_BYTES;

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                id: meta.id,
                                filename: meta.filename,
                                mimeType,
                                size: meta.size,
                                created: meta.created,
                                author: meta.author?.displayName,
                                savedPath: filePath,
                                base64: small ? buffer.toString('base64') : undefined,
                                note: small
                                    ? undefined
                                    : `File is ${buffer.byteLength} bytes (>= ${MAX_INLINE_BYTES}); base64 omitted. Read it from savedPath.`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },
    };
}

/**
 * Tool definitions for attachment operations.
 * Semantic descriptions help AI understand when to use each tool.
 */
export const attachmentToolDefinitions = [
    {
        name: 'jira_list_attachments',
        description: `List attachments on a Jira issue. Use when user wants to:
- See what files/images are attached to a ticket
- Get attachment ids or download URLs for an issue
- Check whether an issue has any attachments

Returns: id, filename, mimeType, size, created, author, content (download URL), thumbnail.
Note: legacy Jira Server v2 API — reads the issue's fields.attachment[].`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                issueKey: {
                    type: 'string',
                    description: 'Issue key like PROJ-123 or numeric ID',
                },
            },
            required: ['issueKey'],
        },
    },
    {
        name: 'jira_get_attachment',
        description: `Download a Jira issue attachment. Use when user wants to:
- View an attached image (returned as a viewable image content block)
- Fetch/download an attached file by id, or by issue + filename

Provide either attachmentId, OR both issueKey and filename to resolve it.
Images are returned inline as an image block; other files are saved to a temp
path and returned with metadata (plus inline base64 only when small, <256KB).
Note: legacy Jira Server v2 API — bytes are fetched from the absolute content URL.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                attachmentId: {
                    type: 'string',
                    description: 'Numeric attachment id to download',
                },
                issueKey: {
                    type: 'string',
                    description: 'Issue key/ID (use with filename to resolve the attachment)',
                },
                filename: {
                    type: 'string',
                    description: 'Attachment filename to match within the issue',
                },
            },
            required: [],
        },
    },
];
