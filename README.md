<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/sniptide-readme-dark.svg">
    <img alt="Sniptide" src=".github/assets/sniptide-readme-light.svg" width="100%">
  </picture>
</p>

[![CI](https://github.com/Dino-Kupinic/sniptide/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/Dino-Kupinic/sniptide/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Dino-Kupinic/sniptide)](https://github.com/Dino-Kupinic/sniptide/releases/latest)
[![Documentation](https://img.shields.io/badge/docs-sniptide.com-blue)](https://docs.sniptide.com)
[![Sniptide MCP on mcprush](https://mcprush.com/badge/sniptide-mcp/score.svg)](https://mcprush.com/to/sniptide-mcp?ref=badge)

# Sniptide

A self-hostable pastebin for code snippets, configs, and secrets.
Share multi-file pastes with passwords, expiry, or burn-after-read links.
Organize reusable snippets in collections, sync `.env` files, and connect coding agents through the CLI or MCP server.

## Self-host

Run Sniptide and Postgres with Docker Compose:

```bash
git clone https://github.com/Dino-Kupinic/sniptide.git
cd sniptide
printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:3000\n' "$(openssl rand -hex 32)" > .env
docker compose up -d
```

Open [localhost:3000](http://localhost:3000) and create an account.
Use your public HTTPS URL for `BETTER_AUTH_URL` when deploying to a server.
See the [self-hosting guide](https://docs.sniptide.com/self-hosting) for HTTPS, configuration, backups, and upgrades.

The official Docker image supports AMD64 and ARM64 at `ghcr.io/dino-kupinic/sniptide`.

## Connect a coding agent

Add the MCP server to Claude Code, which signs you in to Sniptide in the browser through OAuth:

```bash
claude mcp add --transport http sniptide https://app.sniptide.com/api/mcp
```

For a client without OAuth, create a token in Settings, API tokens, and pass it with `--header "Authorization: Bearer $SNIPTIDE_TOKEN"`.

Use `<your-instance-url>/api/mcp` on a self-hosted instance.
The [MCP guide](https://docs.sniptide.com/mcp) covers Cursor and a local server, and the [CLI](https://docs.sniptide.com/cli) installs a collection as an agent skill.
This repository is also an [Agent Plugin](https://agent-plugins.org): `plugin.json` bundles the MCP servers in `mcp.json` with the skills in `skills/`.

## Documentation

- [User guide](https://docs.sniptide.com)
- [CLI](https://docs.sniptide.com/cli) and [MCP server](https://docs.sniptide.com/mcp)
- [Self-hosting](https://docs.sniptide.com/self-hosting)
- [Development](docs/development.md) and [contributing](CONTRIBUTING.md)
- [Operations and scaling](docs/scaling.md)

The API reference is available at `/docs/api` on your instance.

## License

The app and UI are licensed under [AGPL-3.0-only](LICENSE). The client packages and shared
contracts are licensed under MIT. See [Licensing](LICENSING.md) for the
open-source core and hosted services.
