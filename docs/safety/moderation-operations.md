# Restrict a paste from the host

This is WRK-330's manual enforcement foundation. It does not detect prohibited material, accept abuse reports, or preserve evidence. Before using it for an incident, establish the lawful reporting and preservation procedure with the service operator. The policy drafts are in [PR #111](https://github.com/Dino-Kupinic/sniptide/pull/111).

## Prepare the deployment

Deploy the additive database migration and update every serving replica before issuing restrictions. An older application version does not enforce the new state. Configure proxies and CDNs to respect the application's cache headers. Do not enable edge caching of paste pages, raw responses, or previews.

Use a trusted host account with the intended database credentials. The command requires `DATABASE_URL`; it has no default connection and does not apply migrations. Use the deployment's established secret-injection mechanism. Never paste a production connection string, content, passwords, or API tokens into a case record or issue.

The command's authorization boundary is host and database access. Audit attribution uses the operating-system username and hostname. It is not a separately authenticated moderator identity. Containers that share an OS account require an external access log to identify the person responsible.

Run the commands from a checkout with dependencies installed. The production standalone web image does not include the Bun operational command; use an authorized operations checkout with network access to the intended database.

## Inspect the target

Obtain the immutable paste UUID from an authorized operational record. The command accepts a UUID, not a share slug. Restriction follows that UUID even if the slug changes.

```sh
bun --filter @workspace/db run moderation inspect <paste-uuid>
```

The JSON response contains only `pasteId`, `contentVersion`, `moderationVersion`, and `state`. A missing paste returns `null`. It does not print the title, filenames, body, owner email, or password hash.

## Apply a decision

Choose a new command UUID and an opaque case UUID. Keep both in the restricted operational case record. Use the two versions returned by inspection.

```sh
bun --filter @workspace/db run moderation transition '{
  "commandId": "11111111-1111-4111-8111-111111111111",
  "pasteId": "22222222-2222-4222-8222-222222222222",
  "expectedContentVersion": 123,
  "expectedModerationVersion": 0,
  "state": "quarantined",
  "reasonCode": "review",
  "caseReference": "33333333-3333-4333-8333-333333333333"
}'
```

The UUIDs and version above are synthetic examples. Replace them with the intended target and inspected versions. Do not place evidence text in any field. Accepted reason codes are `review`, `policy_violation`, `legal_request`, `appeal`, and `correction`.

| State | Ordinary behavior |
| --- | --- |
| `allowed` | Existing visibility, password, sharing, expiry, and trash rules apply |
| `pending` | Deny ordinary content and metadata access while review is pending |
| `quarantined` | Deny ordinary content and metadata access during containment |
| `removed` | Deny ordinary content and metadata access after a removal decision |

The last three states block owners, invited editors, unlocked visitors, API tokens, CLI, and MCP callers. They also suppress list entries, search results, previews, notifications, and analytics metadata. Ordinary content edits, access-expanding sharing changes, and restoration cannot clear the state.

A successful command atomically updates the state, increments both versions, and records a metadata-only event. Content and sharing settings are not replaced. Retry an uncertain result with exactly the same JSON and host identity. A matching retry returns the original event, including if the paste has since been deleted. A reused command UUID with different inputs is rejected.

If the command exits nonzero, do not assume it applied. Inspect the current state and consult the restricted audit record. For an identical retry, preserve the original command. If another edit or moderation decision changed either version, inspect and assess the new state before issuing a new decision with a new command UUID.

To release a paste, inspect again and issue a new command with `state` set to `allowed` and an appropriate reason code. Release does not remove a password, undo expiry or trash, revive a consumed one-time paste, or recreate a deleted collection.

## Verify containment

Use harmless synthetic data during deployment verification. Check the shared page, raw and download URLs, preview image, owner detail and edit screens, duplicate initialization, revision access, search, collection export, token API, CLI, and both MCP transports. Verify that no title, filename, description, body, or historical snapshot is returned.

Check response cache headers on successful and denied requests. A restriction applies to new database authorizations after the moderation transaction commits. An already authorized response can finish afterward. Previously downloaded files, client memory, clipboard contents, and previews retained by third parties cannot be recalled.

## Understand deletion and retention

A restriction is not a legal hold. Ordinary trash deletion, scheduled expiry cleanup, burn-after-read cleanup, account deletion, and demo resets retain their existing behavior. Current files and revision snapshots can be destroyed by these operations. Do not rely on this foundation to preserve evidence.

Deleting a collection clears its associations even for restricted pastes, but excludes their slugs from the Undo result. Access-reducing cleanup does not release content. New submissions and external imports remain `allowed` by default; this foundation has no classifier, hash matching, or duplicate-content detection.

The `moderation_event` table is independent of paste and account deletion. It contains command and paste UUIDs, host actor, state transition, reason code, case UUID, observed content version, moderation version, fingerprint, and timestamp. It contains no evidence copy. Treat case references and host identities as restricted operational metadata.

Before operational activation, establish an audit retention and disposal schedule with an authorized owner. There is no automatic audit-expiry job in this foundation. Use a separately approved disposal procedure; never interpret the absence of automatic expiry as a policy of indefinite retention. Any database restore must be assessed for stale moderation decisions before serving traffic.

## Open work

- Confirm Austria-specific operator and legal requirements. Austria is the user-confirmed operating country; the legal entity and monitored abuse contact remain unconfirmed.
- Assign the primary responder and a backup or documented external escalation arrangement. No responder is assigned by this change.
- Implement and verify lawful preservation, restricted evidence access, hold release and disposal, and backup restoration behavior.
- Complete reporting, review, notices, and appeals under WRK-331.
- Evaluate automated screening and processor privacy terms under WRK-332.
- Complete the operational monitoring and deployment exercise under WRK-333.

Keep WRK-330 open for its remaining preservation criteria after this foundation is reviewed.
