# Sniptide for Claude Code

Use the Sniptide skills in Claude Code to search, read and save snippets or apply a collection.
The plugin includes five skills:
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

The bundled server entry points to `https://app.sniptide.com/api/mcp`. To use the skills with
your own instance, add your [instance’s MCP address](https://docs.sniptide.com/mcp#connect-an-agent)
and select that connection in Claude Code.

See the [main README](https://github.com/Dino-Kupinic/sniptide#readme) for the rest of Sniptide.
