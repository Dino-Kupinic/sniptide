# Respond to suspected child exploitation

Status: draft procedure for WRK-329. Activate only after the [operator checklist](README.md#activation-checklist) is complete. Technical controls and public reporting are tracked separately in WRK-330 and WRK-331.

## Prepare the response

Record the primary responder, backup, secure case system, counsel contact, competent authorities, applicable reporting triggers, deadlines, and preservation rules in the restricted operational register. Test access with synthetic data. Confirm which tools exist in the deployed version before relying on them.

Give only authorized responders access to cases. Keep incident content out of Git, issue trackers, ordinary chat, analytics, and email notifications. Notifications contain an opaque case reference and urgency only.

## Handle an incident

1. Record the report's receipt time, source, paste identifier or URL, allegation category, and opaque case identifier in the restricted case system. Record the responsible responder. Collect only necessary information.
2. If the report describes an imminent threat to a child, use the operator's confirmed emergency escalation immediately. Do not wait for routine review or certainty from a model.
3. Restrict the affected paste promptly using the deployed moderation controls. Verify denial through shared pages, raw files, previews, owner access, API, and MCP. Existing password or share credentials must not override the restriction. If the controls fail, escalate to the operator for an immediate containment action and record the failure.
4. Record the immutable paste identifier, content version, restriction time, actor, reason category, and action result. Avoid copying content into the record. A classifier score or user allegation is evidence for triage, not a legal conclusion.
5. Apply the confirmed preservation procedure. Identify its legal basis, scope, authorized owner, start time, review date, expiry or release condition, and disposal rule. Protect material in place when that is authorized and sufficient. Do not download suspected material or create additional copies without an authorized, lawful process.
6. Assess the report through the trained responder and confirmed legal procedure. Limit content exposure to what is necessary. Do not ask an ordinary coding agent or general-purpose chat to inspect suspected material.
7. Submit any required report through the applicable secure channel within the confirmed deadline. Record the submission time, destination, reference number, and follow-up owner. Verify receipt or record a delivery failure and escalate. Do not assume a hotline submission replaces a direct legal notification requirement.
8. Record the access and account decision. Send notices and provide an appeal route only as permitted by the confirmed legal and incident procedure. Do not disclose reporter identity or sensitive investigative details unnecessarily.
9. Follow up on requests, appeals, and preservation review dates. An expired or released hold requires a recorded disposal or retention decision. Removing a hold does not make restricted material available.
10. Close the case only after required reporting, access checks, preservation disposition, and follow-up ownership are recorded. Review any detection or response gap without reproducing the content.

If a reporting channel is unavailable, record the failed attempt, escalate to the backup responder and counsel, and use the confirmed alternate channel. Do not consider an unsent report complete.

## Preserve only authorized records

The case record contains identifiers, timestamps, decisions, reporting references, and the authority for any preservation. Store additional account or request metadata only when available, necessary, and authorized. Do not introduce blanket request-body logging or indefinite IP retention.

Account deletion, expiry, burn-after-read, revision pruning, trash cleanup, and backups can remove relevant records. Verify the actual preservation mechanism before promising that evidence survives these operations. A paste hidden from users is not an isolated evidence repository. Define who can access database backups and how a restore prevents restricted content from being served again.

Stopline and NCMEC provide established reporting channels. The operator must confirm which channel and authority apply to each incident. References are listed in the [draft overview](README.md#reference-guidance).

## Synthetic walkthrough

This is a tabletop exercise with invented identifiers and the harmless text `synthetic moderation exercise`. No prohibited material is needed or permitted. The following results assess the procedure's design, not deployed tool behavior.

| Step | Simulated event | Responsible role | Next action or result |
| --- | --- | --- | --- |
| Intake | A report names fictional paste `exercise-paste` | Primary responder | Open restricted case `exercise-001` and record receipt time |
| Availability | The primary responder is unavailable | Backup responder | Accept ownership and apply the same urgency rules |
| Containment | The case alleges child exploitation | Assigned responder | Restrict the synthetic paste and check each access method |
| Technical failure | A raw URL still returns the harmless marker | Operator | Escalate containment, record the failing path, and retest before calling containment complete |
| Preservation | The synthetic record would otherwise expire | Responder and counsel | Select only a confirmed lawful preservation action, record its authority and review date |
| Reporting | The confirmed reporting channel is unavailable | Responder | Record failure, escalate, and use the confirmed alternate channel |
| Review | The invented allegation is found unsupported | Authorized reviewer | Record the finding and resolve the access decision separately from any preservation decision |
| Closure | Reporting and disposition are resolved | Incident owner | Verify action records and follow-up ownership, then close the exercise |

Design result: the procedure names the responsible role and next action for each branch. Operational result: not verified. Assign actual people, configure channels, implement the controls, and repeat the exercise before activation. Record participants, date, observed outcomes, and corrective work in the restricted operational register.
