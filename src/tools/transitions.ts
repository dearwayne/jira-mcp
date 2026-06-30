/**
 * @file tools/transitions.ts
 * @description Workflow transition tools for Jira MCP.
 */

import { z } from 'zod';
import { JiraClient } from '../client.js';
import { getCredentials } from '../index.js';

/**
 * Schema for get_transitions tool input.
 */
export const getTransitionsSchema = z.object({
    issueKey: z.string().describe('The issue key or ID'),
});

/**
 * Schema for transition_issue tool input.
 */
export const transitionIssueSchema = z.object({
    issueKey: z.string().describe('The issue key or ID'),
    transitionId: z.string().describe('The ID of the transition to execute'),
    comment: z.string().optional().describe('Optional comment to add during transition'),
});

/**
 * Creates transition tool handlers.
 * @param client - Jira client instance
 * @returns Object containing transition tool handlers
 */
export function createTransitionTools(client: JiraClient) {
    return {
        /**
         * Gets available transitions for an issue.
         */
        jira_get_transitions: async (args: z.infer<typeof getTransitionsSchema>) => {
            const credentials = getCredentials();
            const result = await client.getTransitions(args.issueKey, credentials);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                issueKey: args.issueKey,
                                transitions: result.transitions.map((t) => ({
                                    id: t.id,
                                    name: t.name,
                                    toStatus: t.to?.name ?? null,
                                    toStatusCategory: t.to?.statusCategory?.name ?? null,
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
         * Transitions an issue to a new status.
         */
        jira_transition_issue: async (args: z.infer<typeof transitionIssueSchema>) => {
            const credentials = getCredentials();
            await client.transitionIssue(args.issueKey, args.transitionId, args.comment, credentials);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Issue ${args.issueKey} transitioned successfully`,
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
 * Tool definitions for transition operations.
 * Semantic descriptions help AI understand workflow operations.
 */
export const transitionToolDefinitions = [
    {
        name: 'jira_get_transitions',
        description: `Get available workflow transitions for an issue. Use FIRST when user wants to:
- Move an issue to a different status
- Start, complete, close, or reopen a ticket
- Change workflow state

Returns list of valid transitions with IDs. Required before calling jira_transition_issue.

NOTE: You cannot directly set status. Jira uses workflows with transitions between statuses.
Each transition has an ID and leads to a target status (e.g., "Start Progress" → "In Progress").
The response includes toStatusCategory (To Do/In Progress/Done) to help identify the right transition.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                issueKey: {
                    type: 'string',
                    description: 'Issue key like PROJ-123',
                },
            },
            required: ['issueKey'],
        },
    },
    {
        name: 'jira_transition_issue',
        description: `Move a Jira issue to a new workflow status. Use when user wants to:
- Start working on a ticket (→ In Progress)
- Complete or close an issue (→ Done)
- Reopen a closed issue
- Change issue status

IMPORTANT: Call jira_get_transitions first to get valid transition IDs.

Workflow: 1) Call jira_get_transitions to see available transitions 2) Find the transition matching desired target status 3) Use that transition's ID here.
You cannot set status directly - you must use the workflow transition.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                issueKey: {
                    type: 'string',
                    description: 'Issue key to transition',
                },
                transitionId: {
                    type: 'string',
                    description: 'Transition ID from jira_get_transitions',
                },
                comment: {
                    type: 'string',
                    description: 'Optional comment to add with transition',
                },
            },
            required: ['issueKey', 'transitionId'],
        },
    },
];

