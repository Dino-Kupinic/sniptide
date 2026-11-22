# Sniptide admin

A small app for writing and sending Sniptide's product update emails. It runs next to a hosted
Sniptide instance, reads the same database and sends through the same Resend segment, and isn't
part of the self-hosted Docker image. Self-hosted instances don't need it.

The app itself manages who is subscribed: people turn on **Product updates** in Settings, and the
app adds and removes them in the Resend segment. This admin app only writes and sends the emails.

## What it does

- **Sign in** with one operator password (`ADMIN_PASSWORD`). The session lasts 30 days, and
  changing the password signs everyone out.
- **Product updates** lists drafts and sent updates with the number of subscribers.
- **New update** opens the editor: a subject, preview text, cover label, an optional https
  screenshot link at least 700px wide, and the update in Markdown. The finished email shows beside
  the form as you type, and drafts save on their own.
- **Send test** sends one copy, with `[Test]` before the subject, to `BROADCAST_TEST_TO`.
- **Send to subscribers** asks for confirmation with the subscriber count, then creates the Resend
  broadcast and sends it at once. A sent update can no longer change, and sending it twice is
  refused.

## Run it locally

Start the Sniptide app first, so its database is migrated and it serves the email logo and fonts.
Then copy `.env.example` to `.env.local`, fill it in and run:

```sh
bun run --filter admin dev
```

The admin app runs on http://localhost:3002.

## Deploy it

Deploy it as its own service, such as a Coolify application built from this repository with the
Dockerfile `apps/admin/Dockerfile` and the repository root as the build context. Set the variables
from `.env.example` on the service, with `DATABASE_URL` pointing at the production database and the
same Resend key and segment as the app. The container listens on port 3000.

Put it on its own domain, such as `admin.sniptide.com`. Every page needs the password, and the app
sends `noindex`, but a firewall rule or access proxy in front of it adds a second lock.

## Test it

```sh
TEST_DATABASE_URL=postgres://sniptide:sniptide@localhost:5432/sniptide_test bun run --filter admin test
```

Without `TEST_DATABASE_URL` the database tests are skipped.
