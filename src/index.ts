#!/usr/bin/env node
/**
 * @file index.ts
 * @description Main entry point for the Jira MCP server.
 * Supports two modes:
 * 1. MCP Server mode (default) - Runs as HTTP MCP server using Streamable HTTP transport
 * 2. Setup mode - Injects MCP configuration into AI tool config files
 */

import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { loadConfig, JiraCredentials } from './config.js';
import { JiraClient, JiraApiError } from './client.js';
// Export MCP registry types for external use
export * from './types/mcp-config.js';
export { createRegistry, createRegistryFromConfig, McpRegistry } from './mcp-registry.js';
export { fetchMcpConfig, clearCache, getCacheStatus } from './config-fetcher.js';
import {
    createIssueTools,
    issueToolDefinitions,
    createSearchTools,
    searchToolDefinitions,
    createProjectTools,
    projectToolDefinitions,
    createTransitionTools,
    transitionToolDefinitions,
    createUserTools,
    userToolDefinitions,
    createAttachmentTools,
    attachmentToolDefinitions,
} from './tools/index.js';
import {
    parseSetupArgs,
    injectMcpConfig,
    printSetupHelp,
    printSupportedClis,
} from './setup.js';

/**
 * Package information for server identification.
 */
const SERVER_INFO = {
    name: '@khanglvm/jira-mcp',
    version: '1.0.0',
};

/**
 * Prints general help message.
 */
function printHelp(): void {
    console.log(`
@khanglvm/jira-mcp - Jira MCP Server for Legacy Jira Server (Basic Auth)

MODES:

  1. MCP Server Mode (default) - HTTP Streamable Transport
     Run as an HTTP MCP server using Streamable HTTP transport.

     Required Environment Variables:
       JIRA_BASE_URL  - Jira server URL (e.g., https://jira.example.com)

     Optional Environment Variables:
       JIRA_USERNAME  - Username for basic auth (can be provided by MCP clients)
       JIRA_PASSWORD  - Password for basic auth (can be provided by MCP clients)
       MCP_HOST       - HTTP server host (default: 127.0.0.1)
       MCP_PORT       - HTTP server port (default: 3000)

     Usage:
       npx @khanglvm/jira-mcp

     MCP Endpoint:
       http://<MCP_HOST>:<MCP_PORT>/mcp

     Client-Side Credentials:
       JIRA_USERNAME and JIRA_PASSWORD can be provided by MCP clients during
       the initialize request instead of being configured on the server.
       See README.md for details on how to configure client credentials.

     Server-Side Credentials (alternative):
       If JIRA_USERNAME and JIRA_PASSWORD are set on the server, they will
       be used as default credentials for all sessions.

  2. Setup Mode
     Inject MCP configuration into AI tool config files.

     Usage:
       npx @khanglvm/jira-mcp setup -c <cli> -b <url> -u <user> -p <pass> [-s <scope>]

     Run 'npx @khanglvm/jira-mcp setup --help' for more details.

COMMANDS:
  setup       Configure MCP in AI tool config files
  list-clis   List supported AI CLI tools
  --help      Show this help message
  --version   Show version

EXAMPLES:
  # Run as HTTP MCP server
  JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

  # Run on custom port
  MCP_PORT=8080 JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

  # Setup for Claude Code
  npx @khanglvm/jira-mcp setup -c claude-code -b https://jira.example.com -u admin -p secret

  # Setup for Cursor (project scope)
  npx @khanglvm/jira-mcp setup -c cursor -b https://jira.example.com -u admin -p secret -s project
`);
}

/**
 * Handles CLI commands and arguments.
 * @returns true if handled as CLI command, false to continue as MCP server
 */
async function handleCliCommands(): Promise<boolean> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        return false; // No args, run as MCP server
    }

    const command = args[0];

    switch (command) {
        case '--help':
        case '-h':
        case 'help':
            printHelp();
            return true;

        case '--version':
        case '-v':
            console.log(SERVER_INFO.version);
            return true;

        case 'list-clis':
            printSupportedClis();
            return true;

        case 'setup': {
            const setupArgs = args.slice(1);

            if (setupArgs.length === 0 || setupArgs.includes('--help') || setupArgs.includes('-h')) {
                printSetupHelp();
                return true;
            }

            const options = parseSetupArgs(setupArgs);
            if (!options) {
                console.error('Error: Invalid arguments. Run with --help for usage.\n');
                printSetupHelp();
                process.exit(1);
            }

            const result = await injectMcpConfig(options);
            console.log(result.message);

            if (!result.success) {
                process.exit(1);
            }
            return true;
        }

        default:
            // Unknown command, check if it looks like MCP server mode
            if (command.startsWith('-')) {
                console.error(`Unknown option: ${command}`);
                printHelp();
                process.exit(1);
            }
            return false;
    }
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * AsyncLocalStorage for storing credentials in the request context.
 */
const credentialsStorage = new AsyncLocalStorage<JiraCredentials | undefined>();

/**
 * Gets credentials for the current request context.
 */
export function getCredentials(): JiraCredentials | undefined {
    return credentialsStorage.getStore();
}

/**
 * Session storage for Jira credentials.
 * Maps session IDs to credentials provided by MCP clients.
 */
const sessionCredentials = new Map<string, JiraCredentials>();

/**
 * Main function to initialize and run the MCP server.
 */
async function runMcpServer(): Promise<void> {
    let config;
    try {
        config = loadConfig();
    } catch (error) {
        console.error((error as Error).message);
        process.exit(1);
    }

    const jiraClient = new JiraClient(config);

    const issueTools = createIssueTools(jiraClient);
    const searchTools = createSearchTools(jiraClient);
    const projectTools = createProjectTools(jiraClient);
    const transitionTools = createTransitionTools(jiraClient);
    const userTools = createUserTools(jiraClient);
    const attachmentTools = createAttachmentTools(jiraClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allToolHandlers: Record<string, (args: any) => Promise<{ content: Array<Record<string, unknown>> }>> = {
        ...issueTools,
        ...searchTools,
        ...projectTools,
        ...transitionTools,
        ...userTools,
        ...attachmentTools,
    };

    const allToolDefinitions = [
        ...issueToolDefinitions,
        ...searchToolDefinitions,
        ...projectToolDefinitions,
        ...transitionToolDefinitions,
        ...userToolDefinitions,
        ...attachmentToolDefinitions,
    ];

    const server = new Server(SERVER_INFO, {
        capabilities: {
            tools: {},
        },
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: allToolDefinitions,
        };
    });

    server.setRequestHandler(InitializeRequestSchema, async (request) => {
        const params = request.params as Record<string, unknown>;
        const sessionId = (request as Record<string, unknown>).sessionId as string | undefined;

        const meta = params._meta as Record<string, unknown> | undefined;
        const creds = meta?.credentials as Record<string, string> | undefined;

        if (sessionId && creds?.username && creds?.password) {
            sessionCredentials.set(sessionId, {
                username: creds.username,
                password: creds.password,
            });
            console.error(`[Session ${sessionId}] Credentials received`);
        }

        return {
            capabilities: {
                tools: {},
            },
            protocolVersion: '2025-11-25',
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const { name, arguments: args } = request.params;
        const sessionId = extra?.sessionId;

        const credentials = sessionId ? sessionCredentials.get(sessionId) : undefined;

        const handler = allToolHandlers[name];
        if (!handler) {
            throw new Error(`Unknown tool: ${name}`);
        }

        try {
            return await credentialsStorage.run(credentials, async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await handler(args as any);
            });
        } catch (error) {
            if (error instanceof JiraApiError) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    error: true,
                                    message: error.message,
                                    statusCode: error.statusCode,
                                    details: error.body,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    });

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
    });

    await server.connect(transport);

    const app = createMcpExpressApp({
        host: process.env.MCP_HOST || '127.0.0.1',
    });

    app.post('/mcp', async (req: Request, res: Response) => {
        await transport.handleRequest(req, res, req.body);
    });

    app.get('/mcp', async (req: Request, res: Response) => {
        await transport.handleRequest(req, res);
    });

    const port = parseInt(process.env.MCP_PORT || '3000', 10);
    const host = process.env.MCP_HOST || '127.0.0.1';

    app.listen(port, host, () => {
        console.error(`Jira MCP server started on http://${host}:${port}/mcp`);
        console.error(`Connected to Jira: ${config.JIRA_BASE_URL}`);
        if (!config.JIRA_USERNAME || !config.JIRA_PASSWORD) {
            console.error('Note: JIRA_USERNAME and JIRA_PASSWORD not configured on server. Credentials must be provided by MCP clients via initialize request.');
        }
    });
}

// Main entry point
(async () => {
    if (await handleCliCommands()) {
        // CLI command handled, exit normally
        process.exit(0);
    } else {
        // Run as MCP server
        runMcpServer().catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
    }
})();
