# @khanglvm/jira-mcp

MCP server for **legacy Jira Server** (v7.x) with Basic Authentication. Works with any MCP-compatible AI tool.

> **Using Jira Cloud or Data Center 8.14+?** Use [mcp-atlassian](https://github.com/sooperset/mcp-atlassian) instead for OAuth/PAT support.

> **Transport**: This server uses **Streamable HTTP transport** (recommended for remote MCP servers). Streamable HTTP is the modern MCP transport introduced in March 2025, offering better compatibility, session management, and resumability compared to legacy HTTP+SSE.

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

## Running the MCP Server

### HTTP Streamable Transport

This server runs as an HTTP server using Streamable HTTP transport, which is the recommended approach for remote MCP servers.

**Starting the server:**

```bash
# Basic usage
JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

# Custom port
MCP_PORT=8080 JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

# Custom host (for remote deployment)
MCP_HOST=0.0.0.0 MCP_PORT=3000 JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp
```

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JIRA_BASE_URL` | yes | - | Jira server URL |
| `JIRA_USERNAME` | no | - | Username for basic auth (can be provided by MCP clients) |
| `JIRA_PASSWORD` | no | - | Password for basic auth (can be provided by MCP clients) |
| `MCP_HOST` | no | `127.0.0.1` | HTTP server host |
| `MCP_PORT` | no | `3000` | HTTP server port |
| `JIRA_API_VERSION` | no | `2` | API version |

### Client-Side Credentials

Jira credentials can be provided by MCP clients during the initialize request instead of being configured on the server. This is useful when:
- The server is shared among multiple users
- Each user has their own Jira credentials
- You want to avoid storing credentials on the server

**How it works:**
1. Start the server without `JIRA_USERNAME` and `JIRA_PASSWORD` environment variables
2. MCP clients provide credentials in the `_meta` field during initialization
3. Credentials are stored per-session and used for all subsequent tool calls

**Example MCP client configuration:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "your-client",
      "version": "1.0.0"
    },
    "_meta": {
      "credentials": {
        "username": "jira-user",
        "password": "jira-password"
      }
    }
  }
}
```

**Security Note:**
- Credentials are stored in memory only (not persisted)
- Each session has its own set of credentials
- Credentials are automatically cleared when the session ends

**MCP Endpoint:**

The server exposes a single MCP endpoint: `http://<MCP_HOST>:<MCP_PORT>/mcp`

This endpoint handles both POST requests (for tool calls, list tools, etc.) and GET requests (for SSE streaming when enabled).

**Security Note:**

When deploying to a remote server:
- The server includes DNS rebinding protection by default when running on localhost
- For production deployments, consider adding authentication middleware
- Always use HTTPS in production environments

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

### v1.7.0
- `feat`: migrate from stdio transport to Streamable HTTP transport (recommended for remote MCP servers)
- `feat`: add HTTP server configuration with MCP_HOST and MCP_PORT environment variables
- `feat`: use StreamableHTTPServerTransport for stateful session management
- `feat`: create Express app with DNS rebinding protection enabled by default
- `docs`: update README with Streamable HTTP transport documentation and examples
- `docs`: add HTTP server endpoint information (`http://<MCP_HOST>:<MCP_PORT>/mcp`)
- `deps`: add @types/express for TypeScript support

**Migration from stdio to Streamable HTTP:**
- This change transforms the server from a local stdio-based MCP server to a remote HTTP-based server
- The server now runs on `http://127.0.0.1:3000/mcp` by default (configurable via MCP_HOST and MCP_PORT)
- Streamable HTTP is the recommended transport for remote MCP servers (introduced March 2025)
- Supports session management, resumability, and better compatibility with modern MCP clients

### v1.6.1
- `fix`: null-guard all issue/search/transition/comment field rendering. `jira_get_issue` and `jira_search` no longer throw `Cannot read properties of undefined (reading 'name')` when a ticket has a null/absent `assignee`, `priority`, `status`, `issuetype`, `project`, transition `to`/`statusCategory`, or comment `author`. Missing values now normalize to `null`.
- `test`: add `test:null` regression test covering null/missing nested fields.

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

## 中文使用说明

### 启动服务器

```bash
# 基础用法
JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

# 自定义端口
MCP_PORT=8080 JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp

# 远程部署（监听所有网络接口）
MCP_HOST=0.0.0.0 MCP_PORT=3000 JIRA_BASE_URL=https://jira.example.com JIRA_USERNAME=admin JIRA_PASSWORD=secret npx @khanglvm/jira-mcp
```

### 环境变量配置

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JIRA_BASE_URL` | 是 | - | Jira 服务器地址 |
| `JIRA_USERNAME` | 是 | - | Basic Auth 用户名 |
| `JIRA_PASSWORD` | 是 | - | Basic Auth 密码 |
| `MCP_HOST` | 否 | `127.0.0.1` | HTTP 服务器绑定地址 |
| `MCP_PORT` | 否 | `3000` | HTTP 服务器端口 |
| `JIRA_API_VERSION` | 否 | `2` | API 版本 |

### MCP 端点

服务器暴露单一 MCP 端点：`http://<MCP_HOST>:<MCP_PORT>/mcp`

该端点支持：
- POST 请求：用于工具调用、列出工具等操作
- GET 请求：用于 SSE 流式传输

### 安全注意事项

- 运行在 localhost 时默认启用 DNS rebinding 保护
- 生产环境部署时建议添加认证中间件
- 生产环境应始终使用 HTTPS

---

## License

MIT
