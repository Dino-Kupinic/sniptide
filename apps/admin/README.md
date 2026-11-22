# Sniptide admin

A small app for running a hosted Sniptide instance: an overview of accounts and pastes, and the
emails sent to subscribers. It runs next to a hosted
Sniptide instance, reads the same database and sends through the same Resend segment, and isn't
part of the self-hosted Docker image. Self-hosted instances don't need it.

The app itself manages who is subscribed: people turn on **Product updates** in Settings, and the
app adds and removes them in the Resend segment. This admin app only writes and sends the emails.

## What it does

- **Sign in** with one operator password (`ADMIN_PASSWORD`). The session lasts 30 days, and
  changing the password signs everyone out.
- **Overview** shows the number of accounts, sign-ups in the last 7 and 30 days, pastes, product
  update subscribers and sent emails, and the newest accounts.
- **Emails** lists drafts and sent emails with their kind and the number of subscribers.
- **New email** asks for the kind of email, then opens its editor. Every kind has a subject,
  preview text and a Markdown body. The finished email shows beside the form as you type, and
  drafts save on their own.
  - A **product update** adds a cover label and an optional https screenshot link at least 700px
    wide.
  - A **survey or feedback request** adds a heading, the https survey link, a button label, the
    minutes it takes and an optional rating question. The question shows scores from 1 to 5, and
    each opens the survey link with `?rating=` and the score. A survey can't be sent without its
    link.
  - **Educational content** adds a title, a topic, a reading time and an optional link to the full
    guide.
- **Send test** sends one copy, with `[Test]` before the subject, to `BROADCAST_TEST_TO`.
- **Send to subscribers** asks for confirmation with the subscriber count, then creates the Resend
  broadcast and sends it at once. A sent email can no longer change, and sending it twice is
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

## Add a section

Each section is a route under `app/(admin)`, which wraps it in the shell, and an entry in
`lib/sections.ts`, which adds it to the sidebar and the phone navigation.
