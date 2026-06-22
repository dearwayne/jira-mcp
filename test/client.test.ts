/**
 * @file test/client.test.ts
 * @description Integration tests for the Jira client.
 * Uses real Jira credentials from .env file.
 * 
 * Run with: npm test
 */

import { config } from 'dotenv';
import { JiraClient, JiraApiError } from '../src/client.js';
import { loadConfig } from '../src/config.js';

// Load environment variables from .env file
config();

/**
 * Simple test runner that logs results.
 */
async function runTests(): Promise<void> {
    console.log('='.repeat(60));
    console.log('Jira MCP Client Integration Tests');
    console.log('='.repeat(60));
    console.log();

    let config;
    try {
        config = loadConfig();
        console.log(`✅ Configuration loaded successfully`);
        console.log(`   Base URL: ${config.JIRA_BASE_URL}`);
        console.log(`   Username: ${config.JIRA_USERNAME}`);
        console.log();
    } catch (error) {
        console.error('❌ Configuration failed:', (error as Error).message);
        process.exit(1);
    }

    const client = new JiraClient(config);
    let passed = 0;
    let failed = 0;

    // Test: Get Current User
    console.log('Testing: Get Current User...');
    try {
        const user = await client.getCurrentUser();
        console.log(`✅ Get Current User - PASSED`);
        console.log(`   Name: ${user.displayName}`);
        console.log(`   Username: ${user.name}`);
        console.log(`   Email: ${user.emailAddress || 'N/A'}`);
        passed++;
    } catch (error) {
        console.error(`❌ Get Current User - FAILED:`, getErrorMessage(error));
        failed++;
    }
    console.log();

    // Test: List Projects
    console.log('Testing: List Projects...');
    try {
        const projects = await client.getProjects();
        console.log(`✅ List Projects - PASSED`);
        console.log(`   Found ${projects.length} projects`);
        if (projects.length > 0) {
            console.log(`   First 5 projects:`);
            projects.slice(0, 5).forEach((p) => {
                console.log(`     - ${p.key}: ${p.name}`);
            });
        }
        passed++;
    } catch (error) {
        console.error(`❌ List Projects - FAILED:`, getErrorMessage(error));
        failed++;
    }
    console.log();

    // Test: Search Issues
    console.log('Testing: Search Issues (recent 5)...');
    try {
        const results = await client.search('ORDER BY updated DESC', 5);
        console.log(`✅ Search Issues - PASSED`);
        console.log(`   Total issues: ${results.total}`);
        console.log(`   Returned: ${results.issues.length}`);
        if (results.issues.length > 0) {
            console.log(`   Recent issues:`);
            results.issues.forEach((issue) => {
                console.log(`     - ${issue.key}: ${issue.fields.summary?.substring(0, 50)}...`);
            });
        }
        passed++;
    } catch (error) {
        console.error(`❌ Search Issues - FAILED:`, getErrorMessage(error));
        failed++;
    }
    console.log();

    // Test: Get Specific Issue (if we found any)
    console.log('Testing: Get Specific Issue...');
    try {
        // Try to get the first issue from search results
        const searchResults = await client.search('ORDER BY updated DESC', 1);
        if (searchResults.issues.length > 0) {
            const issueKey = searchResults.issues[0].key;
            const issue = await client.getIssue(issueKey);
            console.log(`✅ Get Issue - PASSED`);
            console.log(`   Key: ${issue.key}`);
            console.log(`   Summary: ${issue.fields.summary}`);
            console.log(`   Status: ${issue.fields.status?.name ?? 'N/A'}`);
            console.log(`   Type: ${issue.fields.issuetype?.name ?? 'N/A'}`);
            passed++;

            // Test: Get Transitions
            console.log();
            console.log('Testing: Get Transitions...');
            try {
                const transitions = await client.getTransitions(issueKey);
                console.log(`✅ Get Transitions - PASSED`);
                console.log(`   Available transitions for ${issueKey}:`);
                transitions.transitions.forEach((t) => {
                    console.log(`     - [${t.id}] ${t.name} → ${t.to?.name ?? 'N/A'}`);
                });
                passed++;
            } catch (error) {
                console.error(`❌ Get Transitions - FAILED:`, getErrorMessage(error));
                failed++;
            }

            // Test: Get Comments
            console.log();
            console.log('Testing: Get Comments...');
            try {
                const comments = await client.getComments(issueKey);
                console.log(`✅ Get Comments - PASSED`);
                console.log(`   Total comments: ${comments.total}`);
                if (comments.comments.length > 0) {
                    console.log(`   Latest comment by: ${comments.comments[0].author?.displayName ?? 'N/A'}`);
                }
                passed++;
            } catch (error) {
                console.error(`❌ Get Comments - FAILED:`, getErrorMessage(error));
                failed++;
            }
        } else {
            console.log(`⚠️ Get Issue - SKIPPED (no issues found)`);
        }
    } catch (error) {
        console.error(`❌ Get Issue - FAILED:`, getErrorMessage(error));
        failed++;
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log();

    if (failed > 0) {
        process.exit(1);
    }
}

/**
 * Extracts error message from various error types.
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof JiraApiError) {
        return `[${error.statusCode}] ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

// Run tests
runTests().catch((error) => {
    console.error('Fatal test error:', error);
    process.exit(1);
});
