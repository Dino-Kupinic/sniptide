# Support and bug intake

Every bug report and piece of feedback for the hosted app ends up as an issue in the Linear team
Work, so one triage queue covers them all. This page explains how each channel gets there and how
the weekly triage pass works. Readers of the public docs see the user side in
`apps/docs/content/docs/support.mdx`.

## Channels

| Channel | How it reaches Linear | Setup |
| --- | --- | --- |
| **Help and feedback** dialog in the app | The server files the report through the Linear API (`apps/web/lib/support`) | `LINEAR_API_KEY`, `LINEAR_TEAM_ID=WRK` and `LINEAR_PROJECT_ID` on the production app |
| Support assistant in the same dialog | The assistant calls the same filing code, with the conversation attached | `ANTHROPIC_API_KEY`, plus the Linear settings |
| GitHub issues | Linear's GitHub integration syncs new issues in `Dino-Kupinic/sniptide` into Work | Linear settings, **Integrations**, **GitHub**, then turn on **Issues sync** for the repository and Work |
| Support email | Linear's email intake turns each email into a Work issue | Linear team settings for Work, **Email intake**, then forward the support address to the address Linear shows |

The GitHub issue form in `.github/ISSUE_TEMPLATE/bug_report.yml` asks for the same details the app
attaches, so synced issues read the same as in-app reports.

GitHub sync and email intake are Linear settings, not code. Turn them on once in Linear, and send
a test issue and a test email to confirm that both land in Work's Triage.

## What an in-app report looks like

- **Title:** `Bug:` or `Feedback:` followed by the first line of the description.
- **State:** Triage, when Work has triage turned on.
- **Label:** `Bug` or `Feedback`.
- **Priority:** Medium for bugs and none for feedback, so bugs sort first.
- **Project:** Sniptide, from `LINEAR_PROJECT_ID`.
- **Body:** the description, a context list (page address without its query, browser, release,
  user ID, hosted or self-hosted), the screenshot if there is one, the assistant conversation if the
  assistant filed it, and a `Report key` line.

The report key is a hash of the kind, the route with its slugs removed and the first twelve words
of the description. A second report with the same key, while the first issue is open, becomes a
comment on that issue. Different wording of the same bug still creates a second issue, which the
triage pass merges.

## Weekly triage pass

Once a week, work through Work's Triage view until it's empty:

1. Merge duplicates into the oldest issue with **Mark as duplicate**.
2. Reproduce each bug on the release named in its context. Ask for more detail in a comment when
   it doesn't reproduce, and close it after a week without an answer.
3. Set the priority, and replace the default Medium where it doesn't fit.
4. Accept the issue into Backlog or Todo, or decline it with a short reason.
5. Reply on the GitHub issue or the email thread for reports from those channels. In-app reports
   have no reply channel yet, so a fix reaches those people through the release notes.

Keep the pass on the calendar with a recurring Linear issue in Work, such as "Weekly triage pass" every Monday.

## Rate limits and costs

Each account can send 10 reports and ask the assistant 30 questions an hour, counted in Postgres
(`lib/rate-limit.ts`). The assistant sends the whole docs corpus, about 170 KB of text, as a cached
system prompt, so most questions read it from the prompt cache. Check the Anthropic console after
launch to confirm the cache hit rate and the cost per question before raising the limits.
