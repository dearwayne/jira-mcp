/**
 * @file config.ts
 * @description Configuration module for Jira MCP server.
 * Handles environment variable parsing and validation.
 */

import { z } from 'zod';

/**
 * Environment variable schema for Jira configuration.
 * Validates required and optional configuration values.
 * JIRA_USERNAME and JIRA_PASSWORD are optional - they can be provided via MCP client configuration.
 */
const configSchema = z.object({
    /** Base URL of the Jira instance (e.g., http://jira.example.com:8080) */
    JIRA_BASE_URL: z.string().url('JIRA_BASE_URL must be a valid URL'),
    /** Username for basic authentication (optional - can be provided via MCP client) */
    JIRA_USERNAME: z.string().optional(),
    /** Password for basic authentication (optional - can be provided via MCP client) */
    JIRA_PASSWORD: z.string().optional(),
    /** API version (defaults to "2") */
    JIRA_API_VERSION: z.string().default('2'),
});

/**
 * Validated configuration type inferred from schema.
 */
export type JiraConfig = z.infer<typeof configSchema>;

/**
 * Jira authentication credentials.
 */
export interface JiraCredentials {
    username: string;
    password: string;
}

/**
 * Loads and validates configuration from environment variables.
 * @returns Validated configuration object
 * @throws Error if required environment variables are missing or invalid
 */
export function loadConfig(): JiraConfig {
    const result = configSchema.safeParse({
        JIRA_BASE_URL: process.env.JIRA_BASE_URL,
        JIRA_USERNAME: process.env.JIRA_USERNAME,
        JIRA_PASSWORD: process.env.JIRA_PASSWORD,
        JIRA_API_VERSION: process.env.JIRA_API_VERSION ?? '2',
    });

    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
            .join('\n');
        throw new Error(
            `Jira MCP configuration error:\n${errors}\n\n` +
            'Required environment variables:\n' +
            '  JIRA_BASE_URL - Base URL of Jira instance\n' +
            '\nOptional:\n' +
            '  JIRA_USERNAME - Username for authentication (can be provided via MCP client)\n' +
            '  JIRA_PASSWORD - Password for authentication (can be provided via MCP client)\n' +
            '  JIRA_API_VERSION - API version (default: "2")'
        );
    }

    return result.data;
}

/**
 * Constructs the full REST API base URL.
 * @param config - Validated configuration
 * @returns Full API base URL (e.g., http://jira.example.com:8080/rest/api/2)
 */
export function getApiBaseUrl(config: JiraConfig): string {
    // Remove trailing slash if present
    const baseUrl = config.JIRA_BASE_URL.replace(/\/$/, '');
    return `${baseUrl}/rest/api/${config.JIRA_API_VERSION}`;
}

/**
 * Constructs the auth API base URL for session endpoints.
 * @param config - Validated configuration
 * @returns Full auth API base URL (e.g., http://jira.example.com:8080/rest/auth/1)
 */
export function getAuthBaseUrl(config: JiraConfig): string {
    const baseUrl = config.JIRA_BASE_URL.replace(/\/$/, '');
    return `${baseUrl}/rest/auth/1`;
}
