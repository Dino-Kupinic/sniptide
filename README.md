<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/sniptide-readme-dark.svg">
    <img alt="Sniptide" src=".github/assets/sniptide-readme-light.svg" width="100%">
  </picture>
</p>

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
See the [self-hosting guide](apps/docs/content/docs/self-hosting/index.mdx) for HTTPS, configuration, backups, and upgrades.

The official Docker image supports AMD64 and ARM64 at `ghcr.io/dino-kupinic/sniptide`.

## Documentation

- [User guide](apps/docs/content/docs/index.mdx)
- [CLI](packages/cli/README.md) and [MCP server](packages/mcp/README.md)
- [Development](docs/development.md) and [contributing](CONTRIBUTING.md)
- [Operations and scaling](docs/scaling.md)

The API reference is available at `/docs/api` on your instance.

## License

[AGPL-3.0](LICENSE)
