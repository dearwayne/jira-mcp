# @khanglvm/jira-mcp

MCP server for **legacy Jira Server** (v7.x) with Basic Authentication. Works with any MCP-compatible AI tool.

> **Using Jira Cloud or Data Center 8.14+?** Use [mcp-atlassian](https://github.com/sooperset/mcp-atlassian) instead for OAuth/PAT support.

---

## Prerequisites

**Node.js** (v18+) is required.

**macOS / Linux:**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

**Windows (PowerShell):**
```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

---

## Quick Install

Install using **mcpm** (MCP Manager) — a universal installer that works with all AI agents:

```bash
npx @khanglvm/mcpm https://github.com/khanglvm/jira-mcp
```

**What this does:**
- Auto-detects your installed AI agents (Claude Desktop, Cursor, VS Code, etc.)
- Prompts for your Jira credentials securely
- Transforms config to match each agent's format
- Safely merges with existing configurations

> **AI Agents:** Do NOT use this method — it requires interactive terminal input. See [For AI Agents](#for-ai-agents) below.

---

## For AI Agents

### MCP Installation

Follow the [MCP Server Installation Workflow](https://raw.githubusercontent.com/khanglvm/agent-tools/refs/heads/main/.agent/workflows/install-mcp-server.md) for automated setup:
- Automatic agent detection and configuration
- Secure credential collection
- Proper config format transformation for your specific agent

### Agent Skill (Recommended)

Install the companion skill for JQL expertise, gotcha prevention, and response formatting:

```bash
# Install globally (available across all projects)
npx skills add https://github.com/khanglvm/skills --skill jira-mcp -g

# Install for a specific agent
npx skills add https://github.com/khanglvm/skills --skill jira-mcp -a claude-code -g

# Headless install (non-interactive, for CI/automation)
npx skills add https://github.com/khanglvm/skills --skill jira-mcp -a claude-code -g -y
```

The skill provides:
- **Complete JQL reference** — operators, fields, functions, and date syntax
- **Critical gotchas** — `statusCategory` ("To Do") vs `status` vs `type` (Bug/Task)
- **Common patterns** — ready-to-use JQL queries for standup prep, sprint overview, bug triage
- **Workflow guidance** — transition-based status changes, self-hosted URL construction
- **Response formatting** — clickable ticket links, table layouts, status icons

---

## Available Tools

| Tool | Description |
|------|-------------|
| `jira_get_issue` | Get issue details by key |
| `jira_create_issue` | Create a new issue |
| `jira_update_issue` | Update issue fields |
| `jira_delete_issue` | Delete an issue |
| `jira_add_comment` | Add comment to issue |
| `jira_get_comments` | Get issue comments |
| `jira_search` | Search issues using JQL |
| `jira_list_projects` | List all accessible projects |
| `jira_get_project` | Get project details |
| `jira_get_transitions` | Get available transitions |
| `jira_transition_issue` | Transition issue to new status |
| `jira_get_current_user` | Get authenticated user info |
| `jira_get_user` | Get user by username |
| `jira_list_attachments` | List attachments on an issue |
| `jira_get_attachment` | Download an attachment (image inline, else temp file) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | yes | Jira instance URL |
| `JIRA_USERNAME` | yes | Username |
| `JIRA_PASSWORD` | yes | Password |
| `JIRA_API_VERSION` | no | API version (default: `2`) |

---

## Best Practices

### JQL Query Tips
- Use `statusCategory` for broad filtering (`"To Do"`, `"In Progress"`, `"Done"`) — NOT `status` or `type`
- Always quote values with spaces: `project = "My Project"`
- Use `ORDER BY` to sort results: `ORDER BY created DESC`
- Specify fields in `jira_search` to reduce response size: `["summary", "status", "assignee"]`

### Workflow Transitions
- You cannot set status directly — use `jira_get_transitions` to get valid transition IDs, then `jira_transition_issue`
- Always call `jira_get_current_user` first to verify authentication

### Common Gotcha
```
type = "To Do"  → ERROR: "The value 'To Do' does not exist for the field 'type'"
```
`"To Do"` is a **status category**, not an issue type. Use `statusCategory = "To Do"` instead.

---

### Attachments

- `jira_list_attachments` returns each attachment's `id`, `filename`, `mimeType`, `size`, `created`, `author`, `content` (download URL) and `thumbnail`. Metadata is read from the issue's `fields.attachment[]` via the legacy `GET /rest/api/2/issue/{key}?fields=attachment` endpoint.
- `jira_get_attachment` accepts an `attachmentId`, or resolves an attachment by `issueKey` + `filename`. **Images** (`mimeType` starting with `image/`) are returned as a viewable MCP image content block; **other files** are written to `os.tmpdir()/jira-mcp/<id>-<filename>` and returned as a text block with the saved path and metadata (inline base64 is included only when the file is small, under 256KB).
- The attachment `content` URL is an **absolute** URL outside the `/rest/api/2` base; bytes are fetched with a raw authenticated request that reuses the Basic auth header and follows redirects. This is a **legacy Jira Server v7.x** integration — only `/rest/api/2` endpoints are used (no Cloud `/rest/api/3` or ADF).

---

## Changelog

### v1.6.0
- `feat`: add attachment access tools `jira_list_attachments` and `jira_get_attachment` (images returned as inline image content blocks; other files saved to a temp path). Legacy Jira Server v2 API only.

### v1.5.0
- `feat`: migrate agent skill to [`khanglvm/skills`](https://github.com/khanglvm/skills) for global installation via `npx skills`
- `docs`: rewrite README with best practices, updated skill installation guidance
- `chore`: remove `.agent` directory (skill now lives in dedicated skills repo)

### v1.4.0
- `feat`: add `mcp.json` for `mcpm` tool support
- `feat`: improve tool descriptions with JQL gotchas and add AI agent skill
- `fix`: add `.mjs` extension for Node.js ESM compatibility in temporary files
- `docs`: add `mcpm` quick install instructions and AI agent skill reference

---

## License

MIT
