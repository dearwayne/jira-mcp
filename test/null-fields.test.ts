/**
 * @file test/null-fields.test.ts
 * @description Regression test for the null-field crash.
 *
 * Reproduces the bug where jira_get_issue / jira_search / jira_get_transitions /
 * jira_get_comments threw `Cannot read properties of undefined (reading 'name')`
 * when a real ticket had a null/absent assignee, priority, status, issuetype,
 * project, transition target, statusCategory, or comment author.
 *
 * Uses a stub JiraClient (no network) returning deliberately null-heavy payloads
 * and asserts the tool handlers normalize the output without throwing.
 *
 * Run with: npm run test:null
 */

import assert from 'node:assert';
import { JiraClient } from '../src/client.js';
import { createIssueTools } from '../src/tools/issues.js';
import { createSearchTools } from '../src/tools/search.js';
import { createTransitionTools } from '../src/tools/transitions.js';

/**
 * Minimal stub of JiraClient that returns null-heavy payloads, mimicking real
 * tickets where optional fields are absent. Cast to JiraClient since the tool
 * handlers only ever call these methods.
 */
function makeStubClient(): JiraClient {
    const stub = {
        // get_issue: assignee/priority/reporter null, AND status/issuetype/project
        // entirely absent (as happens with a custom `fields` selection).
        getIssue: async () => ({
            id: '1001',
            key: 'BRAN-1',
            self: 'https://jira.example/rest/api/2/issue/1001',
            fields: {
                summary: 'Ticket with no assignee or priority',
                description: 'desc',
                assignee: null,
                priority: null,
                reporter: null,
                // status, issuetype, project intentionally omitted
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-02T00:00:00.000Z',
                labels: [],
            },
        }),
        // search: a mix of fully-null and missing nested objects.
        search: async () => ({
            total: 1,
            startAt: 0,
            maxResults: 50,
            issues: [
                {
                    id: '1002',
                    key: 'BRAN-2',
                    self: 'https://jira.example/rest/api/2/issue/1002',
                    fields: {
                        summary: 'Search hit with null fields',
                        assignee: null,
                        priority: null,
                        // status + issuetype omitted on purpose
                        created: '2024-01-01T00:00:00.000Z',
                        updated: '2024-01-02T00:00:00.000Z',
                    },
                },
            ],
        }),
        // transitions: `to` present but statusCategory null, plus a `to`-less one.
        getTransitions: async () => ({
            transitions: [
                { id: '11', name: 'Start', to: { id: '3', name: 'In Progress', statusCategory: null } },
                { id: '21', name: 'Broken', to: null },
            ],
        }),
        // comments: one anonymized (author null) comment.
        getComments: async () => ({
            startAt: 0,
            maxResults: 50,
            total: 1,
            comments: [
                { id: 'c1', self: 's', author: null, body: 'anon comment', created: 'x', updated: 'y' },
            ],
        }),
    } as unknown as JiraClient;
    return stub;
}

async function run(): Promise<void> {
    console.log('Regression: null-field issue rendering must not throw');
    const client = makeStubClient();
    const issueTools = createIssueTools(client);
    const searchTools = createSearchTools(client);
    const transitionTools = createTransitionTools(client);

    let passed = 0;
    let failed = 0;

    async function check(label: string, fn: () => Promise<{ content: { text: string }[] }>): Promise<void> {
        try {
            const result = await fn();
            // Must produce valid JSON (proves it rendered, did not throw).
            const data = JSON.parse(result.content[0].text);
            assert.ok(data, `${label}: expected parseable output`);
            console.log(`✅ ${label} - did not throw`);
            passed++;
        } catch (error) {
            console.error(`❌ ${label} - FAILED:`, error);
            failed++;
        }
    }

    await check('jira_get_issue (null assignee/priority, missing status/type/project)', () =>
        issueTools.jira_get_issue({ issueKey: 'BRAN-1' })
    );
    await check('jira_search (null + missing nested fields)', () =>
        searchTools.jira_search({ jql: 'ORDER BY updated DESC', maxResults: 5, startAt: 0 })
    );
    await check('jira_get_transitions (null statusCategory / null to)', () =>
        transitionTools.jira_get_transitions({ issueKey: 'BRAN-1' })
    );
    await check('jira_get_comments (null author)', () =>
        issueTools.jira_get_comments({ issueKey: 'BRAN-1' })
    );

    // Explicitly assert the get_issue output normalized nulls instead of crashing.
    const issueOut = JSON.parse((await issueTools.jira_get_issue({ issueKey: 'BRAN-1' })).content[0].text);
    assert.strictEqual(issueOut.status, null, 'missing status should normalize to null');
    assert.strictEqual(issueOut.issueType, null, 'missing issuetype should normalize to null');
    assert.strictEqual(issueOut.assignee, null, 'null assignee should normalize to null');
    assert.strictEqual(issueOut.priority, null, 'null priority should normalize to null');
    assert.strictEqual(issueOut.project, null, 'missing project should normalize to null');
    console.log('✅ get_issue null normalization assertions passed');

    console.log(`\nPassed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
