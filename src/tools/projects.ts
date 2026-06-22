/**
 * @file tools/projects.ts
 * @description Project-related MCP tools for Jira.
 */

import { z } from 'zod';
import { JiraClient } from '../client.js';

/**
 * Schema for get_project tool input.
 */
export const getProjectSchema = z.object({
    projectKey: z.string().describe('The project key (e.g., "PROJ") or ID'),
});

/**
 * Creates project tool handlers.
 * @param client - Jira client instance
 * @returns Object containing project tool handlers
 */
export function createProjectTools(client: JiraClient) {
    return {
        /**
         * Lists all accessible projects.
         */
        jira_list_projects: async () => {
            const projects = await client.getProjects();
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                total: projects.length,
                                projects: projects.map((p) => ({
                                    key: p.key,
                                    name: p.name ?? null,
                                    id: p.id,
                                    projectType: p.projectTypeKey,
                                    lead: p.lead?.displayName ?? null,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },

        /**
         * Gets a project by key or ID.
         */
        jira_get_project: async (args: z.infer<typeof getProjectSchema>) => {
            const project = await client.getProject(args.projectKey);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                key: project.key,
                                name: project.name ?? null,
                                id: project.id,
                                description: project.description,
                                projectType: project.projectTypeKey,
                                lead: project.lead?.displayName ?? null,
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
 * Tool definitions for project operations.
 * Semantic descriptions help AI understand project browsing.
 */
export const projectToolDefinitions = [
    {
        name: 'jira_list_projects',
        description: `List all Jira projects accessible to the user. Use when user wants to:
- See available projects
- Find a project key
- Browse what projects exist
- Get project list for searching issues`,
        inputSchema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'jira_get_project',
        description: `Get details of a specific Jira project. Use when user wants to:
- Get info about a project by key
- See project description or lead
- Check project details`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                projectKey: {
                    type: 'string',
                    description: 'Project key like "PROJ"',
                },
            },
            required: ['projectKey'],
        },
    },
];

