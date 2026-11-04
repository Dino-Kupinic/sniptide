# Scan repository history for secrets

The **Secret scanning / Gitleaks** check scans the full reachable history on pull
requests, pushes to any branch or tag, and manual runs. It fetches every branch
and tag and includes the PR merge commit. Gitleaks 8.30.1 is downloaded from its
official release and checked against a pinned SHA-256 digest.

## Review a scan

Open the workflow run in GitHub Actions. A successful Gitleaks step means no
findings matched its enabled rules in the fetched history. Download the
`gitleaks-report` artifact for redacted findings; it expires after seven days.
A failed fetch, download, checksum, or scanner execution is not a clean audit.
Scanner coverage does not prove that arbitrary provider credentials are absent.

To reproduce with Gitleaks 8.30.1 installed, run from a full repository clone:

```sh
git fetch --force --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
test "$(git rev-parse --is-shallow-repository)" = false
gitleaks git . --log-opts="--all --full-history" --redact=100 --report-format=json --report-path=/tmp/gitleaks-report.json
```

Keep reports private even when redacted: filenames and commit metadata may be
sensitive. Delete the local report when triage is complete.

## Resolve findings

Review the file, rule, commit, and line without copying credentials into issues
or logs. For a real credential, revoke or rotate it with its provider, update
the affected deployment through its secret manager, and verify that the old
credential no longer works. Removing a value from the current tree does not
revoke it or erase history.

Because this check scans history, rotated credentials still fail. After recording
rotation evidence privately, allow only the reviewed finding's exact fingerprint
in `.gitleaksignore`, with a comment explaining the rotation or why it is a test
fixture. Do not add broad path or rule exclusions to make CI pass. Public client
identifiers need classification before deciding whether rotation applies.

## Require the check before merge

A repository administrator must add **Gitleaks** as a required status check in
the branch protection rule or ruleset for `main`, after the first run registers
the check. A workflow alone reports failures but does not prevent merging without
that setting. Keep the check required and review changes to this workflow and any
Gitleaks configuration or ignore file.

Before announcing the open-core policy, retain the run URL, audited refs and
commit IDs, findings disposition, and any rotation verification for both
`Dino-Kupinic/sniptide` and `Dino-Kupinic/sniptide-web`. WRK-433 remains incomplete
until both histories are reviewed and merge protection requires this check.
