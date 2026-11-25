# Handle a suspected child exploitation report

This is the procedure for app.sniptide.com when a report, an authority request or our own review
suggests that a paste contains child sexual abuse material (CSAM), grooming or solicitation of a
minor. The public rules live in the acceptable-use policy at `sniptide.com/acceptable-use`. The
commands are described in [Restrict a paste from the host](moderation-operations.md) and the
[reporting guide](../../apps/docs/content/docs/abuse.mdx).

A report is an allegation. Reviewers decide whether a paste breaks the acceptable-use policy. Only
an authority or a court decides whether it is illegal, so case records say "suspected" and never
state a legal finding.

## Owners

| Role | Person | Reach |
| --- | --- | --- |
| Incident owner | Dino Kupinic | `office@sniptide.com` |
| Backup | Not assigned yet | Assign before launch |

The incident owner restricts the paste, reports it and closes the case. The backup does the same
when the owner cannot be reached within 24 hours. Until a backup is named, a report that arrives
while the owner is away waits, so the owner checks the queue at least once a day.

## Rules for every step

- Never download, copy, screenshot, quote, forward or re-upload suspected material. In Austria,
  obtaining or possessing it is an offence under § 207a StGB even for a well-meant purpose, and a
  copy is what spreads it further.
- Look at a paste only as far as the decision needs. The URL, the report category and the
  moderation state are often enough to quarantine. Quarantine first, then review.
- Keep material and descriptions of it out of email, chat, Linear, GitHub, PostHog, error
  tracking and support replies. Refer to a case only by its report UUID and paste UUID.
- Keep the case record in one restricted place that only the owner and backup can open, outside
  every tool that syncs to a third party. It holds UUIDs, times, decisions and the reference
  numbers that authorities give back, and nothing else.

## Respond

| Step | Who | Action | Done when |
| --- | --- | --- | --- |
| 1. Triage | Incident owner | Run `moderation reports`. Child exploitation cases sort first. Open the case with `moderation report <uuid>` to get the paste UUID. | The paste UUID is known, or the report names no paste on this instance |
| 2. Contain | Incident owner | Run `moderation inspect`, then `moderation transition` to `quarantined` with reason `policy_violation` and the report UUID as `caseReference`. | `inspect` shows `quarantined` |
| 3. Check reach | Incident owner | Open the share URL, `/raw` and `/embed` signed out. Each returns 404. | No path serves the paste |
| 4. Report | Incident owner | Report the paste URL and paste UUID to the Bundeskriminalamt and to Stopline, as described under Report to the authorities. Send no material. | Both reports are sent and their references are in the case record |
| 5. Preserve | Incident owner | Follow the authority's instructions on preservation, as described under Preserve evidence. | The authority has answered, or 90 days have passed without a request |
| 6. Decide | Incident owner | Move the paste to `removed` with reason `policy_violation`. If the owner uploaded the material on purpose, suspend the account with `moderation suspend`, and delete it once any legal hold ends. If review finds no violation, release with `allowed` and reason `correction`. | `inspect` shows the final state |
| 7. Notify | Incident owner | Send the paste owner a statement of reasons unless the authority asks us to wait, as described under Tell the paste owner. | The notice is sent, or the authority's request to wait is in the case record |
| 8. Close | Incident owner | Run `moderation resolve-report` with the transition's command UUID. Record the closing date. | `moderation reports` no longer lists the case |

If a child appears to be in immediate danger, call the police on 133 (or 112) before step 2.

## Report to the authorities

Article 18 of the Digital Services Act requires a hosting service that becomes aware of
information suggesting a criminal offence that threatens a person's life or safety to inform the
law enforcement or judicial authorities of the Member State concerned. Recital 56 names child
sexual abuse as such an offence. When the Member State is unclear, inform the authorities where
Sniptide is established, which is Austria, or Europol.

| Channel | What it is for | Contact |
| --- | --- | --- |
| Bundeskriminalamt, Meldestelle Kinderpornografie | The Austrian police unit for CSAM, and the Article 18 notification | `meldestelle@interpol.at` |
| Stopline | The Austrian INHOPE hotline, which has material removed abroad | `stopline.at` |
| Police emergency | A child in immediate danger | 133 or 112 |

A report to Stopline does not replace the notification to the Bundeskriminalamt. Send both. The
message holds the paste URL, the paste UUID, the time the report arrived and the time the paste
was quarantined. It never holds the material.

These channels and duties are our reading of the law and have not been confirmed by a lawyer.
Confirm them with counsel, along with any duty to keep data for the authorities, and record the
answer here.

## Preserve evidence

A quarantine is not a legal hold. Expiry cleanup, burn-after-read cleanup, trash cleanup and
account deletion can still destroy a quarantined paste, and backups age out after 30 days. When an
authority asks us to preserve a paste:

1. Place a legal hold with `moderation hold` and the case UUID, as
   [Preserve a paste](../../apps/docs/content/docs/abuse.mdx) describes, and record the hold in the
   case record. Do not copy the content anywhere. While the hold lasts, the database refuses every
   deletion of the paste, and the owner can't delete their account. Backups still age out after
   30 days, so tell the authority that the hold covers the live database.
2. Keep the hold until the authority releases it in writing or 90 days pass without contact, then
   run `moderation release-hold`. The paste then follows its normal lifecycle. Record the date.
3. Hand content to an authority only on a written order, and only through the channel it names.

Without a preservation request, the paste stays quarantined until step 6 and is removed under the
normal lifecycle afterwards.

## Tell the paste owner

Article 17 of the Digital Services Act requires a statement of reasons to the person whose paste
we restrict. Send it to the account's email address and include:

- what we restricted (the paste was removed, or the account was suspended) and since when,
- that a report or our own review led to it, without naming the reporter,
- the facts the decision rests on, in general terms,
- that a person made the decision, with no automated detection involved,
- the rule from the acceptable-use policy or the law the decision rests on,
- how to contest it: reply to the email, use a certified out-of-court dispute settlement body
  under Article 21, or go to court.

An authority can ask us to delay the notice while it investigates. Article 17 does not apply to
a decision we take on an authority's order, and in that case the order decides what we may say.

## Retention

The case record, the report and the moderation audit events are kept for two years after the case
closes, then deleted. The paste content follows Preserve evidence. Delete any notes outside the
case record at closing.

## Synthetic walkthrough

This walkthrough ran on 24 November 2026 against a local database with a synthetic paste and a
synthetic report. No real material was used.

| Step | Responsible | Result | Next action |
| --- | --- | --- | --- |
| Report submitted with category `child_exploitation` | Reporter | Stored as one case | Owner triages |
| `moderation reports` | Incident owner | The case is listed first with its category and time | Open the case |
| `moderation report <uuid>` | Incident owner | Shows the paste UUID and explanation, logged as an inspection | Inspect the paste |
| `moderation inspect` | Incident owner | `allowed`, content version and moderation version 0 | Quarantine |
| `moderation transition` to `quarantined` | Incident owner | Applied, audit event recorded against the report UUID | Report to the Bundeskriminalamt and Stopline |
| `moderation resolve-report` | Incident owner | Case closed as `quarantined` and gone from the queue | Record the closing date |

The walkthrough found that the reporting guide used the reason code `abuse`, which the command
rejects. The guide now uses `policy_violation`. Steps 4, 5 and 7 involve external parties and were
not exercised. The backup role is still open.
