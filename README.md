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

Sniptide is an open-source, self-hostable pastebin for code snippets, configs and secrets, best for
developers and small teams who want to share code from their own server and give coding agents
access to it through a CLI or MCP server.

Share multi-file pastes with passwords, expiry or burn-after-read links.
Organize reusable snippets in collections, sync `.env` files, and connect coding agents through the CLI or MCP server.
Use the hosted app at [app.sniptide.com](https://app.sniptide.com) or run your own instance.

## Self-host Sniptide

### Install with one command

This is the recommended way to self-host Sniptide. On a Linux server with Docker and the Docker
Compose plugin, run:

```bash
curl -fsSL https://sniptide.com/install.sh | sh
```

The script asks for your domain, generates the secrets, starts Sniptide and Postgres with Docker
Compose, serves your domain over HTTPS through the bundled Caddy proxy, and closes sign-up once
your account exists. Run it again in the same folder to upgrade.
To install Docker first, run `curl -fsSL https://get.docker.com | sh`.

To skip the questions, pass the domain:

```bash
curl -fsSL https://sniptide.com/install.sh | sh -s -- --domain paste.example.com --yes
```

The [install script guide](https://docs.sniptide.com/self-hosting/install-script) lists every
option and what the script writes.

### Install by hand

Set up Docker Compose yourself when you want to manage the files directly or try Sniptide on your
own machine:

```bash
git clone https://github.com/Dino-Kupinic/sniptide.git
cd sniptide
printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:3000\n' "$(openssl rand -hex 32)" > .env
docker compose up -d
```

Open [localhost:3000](http://localhost:3000) and create an account.
On a server, replace `BETTER_AUTH_URL` with `SNIPTIDE_DOMAIN=<your-domain>` and add
`COMPOSE_PROFILES=proxy` and `SNIPTIDE_BIND=127.0.0.1` so public traffic goes through Caddy over HTTPS.
See the [self-hosting guide](https://docs.sniptide.com/self-hosting) for Docker without Compose,
Coolify, configuration, backups and upgrades.

The official Docker image supports AMD64 and ARM64 at `ghcr.io/dino-kupinic/sniptide`.

## Connect a coding agent

Add the MCP server to Claude Code, which signs you in to Sniptide in the browser through OAuth:

```bash
claude mcp add --transport http sniptide https://app.sniptide.com/api/mcp
```

Then start Claude Code, type `/mcp`, choose `sniptide` and pick **Authenticate** to open the browser.

For a client without OAuth, create a token in **Settings** > **API tokens** and pass it with `--header "Authorization: Bearer $SNIPTIDE_TOKEN"`.

Use `<your-instance-url>/api/mcp` on a self-hosted instance.
The [MCP guide](https://docs.sniptide.com/mcp) covers Cursor and a local server, and the [CLI](https://docs.sniptide.com/cli) installs a collection as an agent skill.
This repository is also an [Agent Plugin](https://agent-plugins.org): `plugin.json` bundles the MCP servers in `mcp.json` with the skills in `skills/`.

To install the MCP server and the skills as a plugin, run one of these. The Claude Code plugin lives in `plugins/claude/`.

```bash
# Claude Code
claude plugin marketplace add Dino-Kupinic/sniptide
claude plugin install sniptide@sniptide

# Gemini CLI
gemini extensions install https://github.com/Dino-Kupinic/sniptide
```

## Documentation

- [User guide](https://docs.sniptide.com)
- [CLI](https://docs.sniptide.com/cli), [MCP server](https://docs.sniptide.com/mcp) and [SDKs](https://docs.sniptide.com/sdks)
- [Self-hosting](https://docs.sniptide.com/self-hosting)
- [Development](docs/development.md) and [contributing](CONTRIBUTING.md)
- [Operations and scaling](docs/scaling.md)

The API reference is available at `/docs/api` on your instance.

## License

The app and UI are licensed under [AGPL-3.0-only](LICENSE). The client packages and shared
contracts are licensed under MIT. See [Licensing](LICENSING.md) for the
open-source core and hosted services.
