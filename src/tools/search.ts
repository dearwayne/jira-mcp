/**
 * @file tools/search.ts
 * @description JQL search tool for Jira MCP.
 */

import { z } from 'zod';
import { JiraClient } from '../client.js';

/**
 * Schema for search tool input.
 */
export const searchSchema = z.object({
    jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
    maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Maximum number of results to return (1-100)'),
    startAt: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Starting index for pagination'),
    fields: z
        .array(z.string())
        .optional()
        .describe('Fields to include in results'),
});

/**
 * Creates search tool handlers.
 * @param client - Jira client instance
 * @returns Object containing search tool handler
 */
export function createSearchTools(client: JiraClient) {
    return {
        /**
         * Searches for issues using JQL.
         */
        jira_search: async (args: z.infer<typeof searchSchema>) => {
            const result = await client.search(
                args.jql,
                args.maxResults,
                args.startAt,
                args.fields
            );
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                total: result.total,
                                startAt: result.startAt,
                                maxResults: result.maxResults,
                                issues: result.issues.map((issue) => ({
                                    key: issue.key,
                                    summary: issue.fields.summary,
                                    status: issue.fields.status?.name ?? null,
                                    assignee: issue.fields.assignee?.displayName ?? null,
                                    priority: issue.fields.priority?.name ?? null,
                                    issueType: issue.fields.issuetype?.name ?? null,
                                })),
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
 * Tool definitions for search operations.
 */
export const searchToolDefinitions = [
    {
        name: 'jira_search',
        description: `Find Jira issues matching specific criteria. Use when user asks to:
- Find, list, or show issues (bugs, tasks, stories, epics)
- Search for work by status, assignee, project, priority, or date
- Get open, closed, in-progress, or unassigned items
- Find "my tasks" or someone else's work
- List recent or updated issues

Build JQL from natural language requests:
- "my open bugs" → assignee = currentUser() AND type = Bug AND status != Done
- "high priority tasks in PROJECT" → project = PROJECT AND type = Task AND priority = High
- "issues updated this week" → updated >= startOfWeek()
- "unassigned bugs" → assignee IS EMPTY AND type = Bug

Common JQL fields: project, status, assignee, reporter, priority, type, created, updated, due

CRITICAL JQL GOTCHAS:
- statusCategory ("To Do", "In Progress", "Done") is NOT an issue type! Use for broad status filtering.
- status (exact workflow status name like "Open", "In Review") is project-specific.  
- type (Bug, Task, Story, Epic) is the issue type field.
- "todo tickets" → statusCategory = "To Do", NOT type = "To Do" (which causes errors)
- Example: statusCategory = "To Do" AND assignee = currentUser() AND created >= -1w`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                jql: {
                    type: 'string',
                    description: 'JQL query. Examples: "project = PROJ AND status = Open", "assignee = currentUser() AND type = Bug"',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max results (1-100, default 50)',
                    default: 50,
                },
                startAt: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                    default: 0,
                },
                fields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Fields to include in results',
                },
            },
            required: ['jql'],
        },
    },
];

