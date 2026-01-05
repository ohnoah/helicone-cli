# Helicone CLI

A command-line interface for fetching and analyzing data from [Helicone](https://helicone.ai). Query LLM requests, sessions, and view metrics directly from your terminal.

## Features

- **Query requests** - List, filter, and export LLM request logs
- **View sessions** - Analyze grouped request traces
- **Metrics dashboard** - Cost breakdowns, latency stats, error analysis
- **Flexible output** - Table, JSON, JSONL, CSV formats
- **Ergonomic viewing** - Formatted message display, field extraction
- **Multi-region** - Support for US and EU data residency

## Quick Start

```bash
# Install dependencies and build
npm install
npm run build

# Authenticate (stores credentials in ~/.helicone/config.yaml)
node dist/index.js auth login --api-key sk-helicone-... --region eu

# List recent requests
node dist/index.js requests list

# View metrics summary
node dist/index.js metrics summary
```

For global access, link the CLI:

```bash
npm link
helicone --help
```

## Installation

```bash
# Clone the repository
git clone https://github.com/ohnoah/helicone-cli.git
cd helicone-cli

# Install dependencies
npm install

# Build
npm run build

# Optional: Link globally
npm link
```

## Authentication

The CLI supports three authentication methods (in order of precedence):

1. **CLI flag**: `--api-key sk-helicone-...`
2. **Environment variable**: `HELICONE_API_KEY=sk-helicone-...`
3. **Stored credentials**: `helicone auth login`

```bash
# Store credentials for future use
helicone auth login --api-key sk-helicone-... --region eu

# Check auth status
helicone auth status

# View masked credentials
helicone auth whoami

# Remove stored credentials
helicone auth logout
```

Credentials are stored in `~/.helicone/config.yaml` with restricted permissions.

## Commands

### Requests

Query and export LLM request data.

```bash
# List recent requests (last 7 days, 25 results)
helicone requests list

# List with filters
helicone requests list --model gpt-4o --status 200 --since 24h

# List with custom fields
helicone requests list --fields request_id,model,cost,latency_ms

# Filter by custom properties
helicone requests list -p environment=production -p user_type=premium

# Output as JSON
helicone requests list --format json

# Get single request (shows summary by default)
helicone requests get <request-id>

# View formatted chat messages
helicone requests get <request-id> --show messages

# View timing and cost breakdown
helicone requests get <request-id> --show metadata

# Extract specific fields (jq-like path syntax)
helicone requests get <request-id> --extract response_body.choices[0].message.content

# Get raw JSON
helicone requests get <request-id> --raw

# Export to file
helicone requests export --since 30d --format jsonl -o requests.jsonl

# Export with request/response bodies
helicone requests export --since 7d --include-body -o full-export.jsonl

# See available fields
helicone requests fields

# Filter schema help
helicone requests filter-help
```

#### Request Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `--since` | Start date (ISO or relative) | `--since 7d`, `--since 2024-01-01` |
| `--until` | End date | `--until 2024-01-31` |
| `--model` | Model name | `--model gpt-4o` |
| `--model-contains` | Partial model match | `--model-contains gpt-4` |
| `--status` | HTTP status code | `--status 200` |
| `--user-id` | Your app's user ID | `--user-id user_123` |
| `--property` | Custom property | `-p key=value` |
| `--search` | Search request/response bodies | `--search "refund policy"` |
| `--request-contains` | Search request body | `--request-contains "function_call"` |
| `--response-contains` | Search response body | `--response-contains "I apologize"` |
| `--filter` | Raw filter JSON (advanced) | `--filter '{"request_response_rmt":{"status":{"equals":500}}}'` |
| `--filter-file` | Load raw filter JSON from file | `--filter-file ./filter.json` |
| `--min-cost` | Minimum cost (USD) | `--min-cost 0.01` |
| `--max-cost` | Maximum cost (USD) | `--max-cost 1.00` |
| `--min-latency` | Minimum latency (ms) | `--min-latency 1000` |
| `--max-latency` | Maximum latency (ms) | `--max-latency 5000` |
| `--cached` | Only cached requests | `--cached` |

#### Viewing Single Requests

The `get` command provides flexible options for viewing request data:

| Option | Description |
|--------|-------------|
| `--show summary` | Clean summary with key info (default) |
| `--show messages` | Formatted chat messages with role colors |
| `--show request` | Raw request body JSON |
| `--show response` | Raw response body JSON |
| `--show metadata` | Timing, tokens, cost breakdown |
| `--show properties` | Custom properties |
| `--show scores` | Evaluation scores |
| `--show all` | Full JSON object |
| `--extract <path>` | Extract specific field using dot notation |
| `--raw` | Alias for `--show all --format json` |

### Sessions

Query session/trace data (grouped requests).

```bash
# List sessions
helicone sessions list --since 7d

# Search by name
helicone sessions list --search "chat-session"

# Get session details with requests
helicone sessions get <session-id> --include-requests

# Export sessions
helicone sessions export --since 30d -o sessions.jsonl
```

### Metrics

View aggregate statistics.

```bash
# Summary metrics (requests, cost, latency, error rate)
helicone metrics summary --since 30d

# Cost breakdown by model
helicone metrics cost --by model

# Cost breakdown by day
helicone metrics cost --by day --since 7d

# Error analysis by status code
helicone metrics errors --since 7d
```

## Output Formats

All list/export commands support multiple output formats:

| Format | Flag | Description |
|--------|------|-------------|
| Table | `--format table` | Pretty-printed terminal table (default for list) |
| JSON | `--format json` | Pretty-printed JSON array |
| JSONL | `--format jsonl` | One JSON object per line (default for export) |
| CSV | `--format csv` | Comma-separated values |

## Configuration

### Config File

Credentials and settings are stored in `~/.helicone/config.yaml`:

```yaml
apiKey: sk-helicone-...
region: eu
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HELICONE_API_KEY` | API key for authentication |
| `HELICONE_REGION` | API region (`us` or `eu`) |

### Default Behaviors

- **Time range**: Last 7 days (`--since 7d`)
- **Limit**: 25 results for list, unlimited for export
- **Bodies**: Request/response bodies are NOT included by default
- **Sort**: Descending by creation time (newest first)

## Region Support

For EU-hosted data, use the `--region` flag:

```bash
helicone requests list --region eu
```

Or set during login:

```bash
helicone auth login --api-key sk-helicone-... --region eu
```

## Examples

```bash
# Find expensive requests
helicone requests list --min-cost 0.10 --since 24h

# Check error rate
helicone metrics errors --since 7d

# Export GPT-4 requests for analysis
helicone requests export --model gpt-4 --since 30d --format csv -o gpt4-requests.csv

# View session conversation
helicone sessions get sess_abc123 --include-requests --format json

# View formatted chat messages from a request
helicone requests get req_abc123 --show messages

# Extract just the assistant's response
helicone requests get req_abc123 --extract response_body.choices[0].message.content

# Quick look at timing and cost
helicone requests get req_abc123 --show metadata

# Pipe to jq for further processing
helicone requests list --format json | jq '.[].model' | sort | uniq -c
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Watch mode (rebuild on changes)
npm run dev
```

### Project Structure

```
helicone-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── auth.ts        # Authentication commands
│   │   ├── requests.ts    # Request commands
│   │   ├── sessions.ts    # Session commands
│   │   └── metrics.ts     # Metrics commands
│   └── lib/
│       ├── client.ts      # Helicone API client
│       ├── config.ts      # Configuration management
│       ├── output.ts      # Output formatting
│       └── types.ts       # TypeScript types
├── dist/                  # Compiled output
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## API Reference

This CLI uses the [Helicone API](https://docs.helicone.ai/rest/request/post-v1requestquery). Key endpoints:

- `POST /v1/request/query-clickhouse` - Query requests
- `POST /v1/request/count/query` - Count requests
- `GET /v1/request/:id` - Get single request
- `POST /v1/session/query` - Query sessions

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT
