/**
 * @file tools/users.ts
 * @description User-related MCP tools for Jira.
 */

import { z } from 'zod';
import { JiraClient } from '../client.js';
import { getCredentials } from '../index.js';

/**
 * Schema for get_user tool input.
 */
export const getUserSchema = z.object({
    username: z.string().describe('The username to look up'),
});

/**
 * Creates user tool handlers.
 * @param client - Jira client instance
 * @returns Object containing user tool handlers
 */
export function createUserTools(client: JiraClient) {
    return {
        /**
         * Gets the currently authenticated user.
         */
        jira_get_current_user: async () => {
            const credentials = getCredentials();
            const user = await client.getCurrentUser(credentials);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                name: user.name,
                                displayName: user.displayName,
                                emailAddress: user.emailAddress,
                                active: user.active,
                                timeZone: user.timeZone,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },

        /**
         * Gets a user by username.
         */
        jira_get_user: async (args: z.infer<typeof getUserSchema>) => {
            const credentials = getCredentials();
            const user = await client.getUser(args.username, credentials);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                name: user.name,
                                displayName: user.displayName,
                                emailAddress: user.emailAddress,
                                active: user.active,
                                timeZone: user.timeZone,
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
 * Tool definitions for user operations.
 * Semantic descriptions help AI understand user lookups.
 */
export const userToolDefinitions = [
    {
        name: 'jira_get_current_user',
        description: `Get the currently logged-in Jira user's info. Use when user asks:
- "Who am I logged in as?"
- "What's my Jira username?"
- Need to know the current user for searches like "my issues"`,
        inputSchema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'jira_get_user',
        description: `Look up a Jira user by username. Use when user wants to:
- Find info about a specific team member
- Check if a username exists
- Get a user's display name or email`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                username: {
                    type: 'string',
                    description: 'Jira username to look up',
                },
            },
            required: ['username'],
        },
    },
];

