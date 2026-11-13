# Sniptide for Claude Code

[Sniptide](https://sniptide.com) is a self-hostable pastebin for coding agents. This plugin
connects Claude Code to the hosted Sniptide MCP server at `https://app.sniptide.com/api/mcp`,
so Claude can search, read and save your snippets and collections. It also adds five skills:
`setup-sniptide`, `reuse-snippets`, `save-snippets`, `apply-collection` and
`integrate-sniptide-sdk`.

## Install

```bash
claude plugin marketplace add Dino-Kupinic/sniptide
claude plugin install sniptide@sniptide
```

## Sign in

Start Claude Code, type `/mcp`, choose `sniptide` and pick **Authenticate**. Claude Code opens
Sniptide in your browser and signs you in through OAuth.

To use a [personal API token](https://docs.sniptide.com/api-tokens) instead, enter it in the
**Sniptide API token** plugin setting. Claude Code keeps it in its credential store, and the
plugin holds no token itself.

The plugin only reaches the hosted app. For a self-hosted instance, follow
[Connect an agent](https://docs.sniptide.com/mcp#connect-an-agent).

See the [main README](https://github.com/Dino-Kupinic/sniptide#readme) for the rest of Sniptide.
