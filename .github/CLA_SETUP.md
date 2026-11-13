# Activate CLA Assistant

CLA Assistant is not yet configured or enforced for these repositories. This guide covers `Dino-Kupinic/sniptide` and `Dino-Kupinic/sniptide-web`. The hosted service records acceptance and reports a pull request status. No repository workflow is needed.

## Publish the agreement

1. Review `CLA.md` version 1.0 in both repositories and confirm that the files are byte-identical.
2. Publish the reviewed file as one public GitHub Gist, with `.github/licenses/Apache-2.0.txt` included as a separate Gist file named `TEMPLATE-LICENSE.txt`. Link both repository integrations to that same Gist. The service renders the first file other than `metadata`, so keep `CLA.md` first and verify its text is displayed before accepting signatures. Do not add files that sort before `CLA.md`.
3. Record the Gist URL, immutable revision URL, and content hash in both copies of this guide after publication. Confirm that the Gist, its displayed text, and both repository copies match before accepting signatures.

Published agreement version 1.0:

- [Signing Gist](https://gist.github.com/Dino-Kupinic/5fd05e5a5cf9822f33598b044860848d). Configure this root URL in CLA Assistant.
- [Immutable reviewed revision](https://gist.github.com/Dino-Kupinic/5fd05e5a5cf9822f33598b044860848d/2d86b087f0c18e4a0b3942e7dae6d53b8937e0b6). This is the audit copy, not the integration URL.
- SHA-256 of `CLA.md`: `bbf838488071d9a0a815ab0f7279984285d27c3f0e0be8e562b410753a555047`.

The published Gist files match the repository copies. `CLA.md` is the first file returned by the Gist API. Live display and signing are still pending activation. Do not accept signatures against an unreviewed or mismatched copy.

## Connect and enforce

1. Sign in as the repository owner at [CLA Assistant](https://cla-assistant.io). Inspect the permissions requested before authorizing access. Connect only the two intended repositories and select the shared Gist for each. Do not copy access tokens into repository files.
2. Open a pull request in each repository and observe the status that the service actually posts. The service source currently uses `license/cla` as the context. Record the exact context and source observed on the live pull request here. Verify the status refers to the current pull request head. Do not require a status that has not appeared.
3. In `sniptide`, add the observed status to the existing required checks on `main`. Preserve the existing branch protection settings and required checks. Keep administrator enforcement enabled.
4. In `sniptide-web`, protect `main` with the observed required status and administrator enforcement. Do not add mandatory reviewer requirements as part of this setup. Bind the status to its observed source where GitHub supports it.
5. Read back both repositories' protection settings and verify that a non-successful or missing required status blocks merging. Preserve existing protections when updating them.

The status context and source are pending observation. GitHub's [branch protection documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) explains required status checks and source selection.

## Verify with a contributor

Use a real non-owner contributor and their own GitHub account. Do not create a signature for another person.

1. In each repository, have an unsigned contributor open a fork pull request. Record its head SHA, the non-successful status, the signing prompt, and the blocked merge state.
2. If that contributor voluntarily accepts the agreement, have them sign through the prompt. Verify the status passes for the same head SHA and inspect the service's acceptance record and agreement revision.
3. Push another commit and verify the status is recalculated for the new head. Add a different unsigned contributor and verify the status is non-successful again until that contributor voluntarily signs. Repeat the relevant checks in both repositories.
4. Manually inspect commit authors, co-author trailers, and unresolved GitHub identities. The service has an [open co-author issue](https://github.com/cla-assistant/cla-assistant/issues/1092), so a passing status alone does not establish that every co-author accepted.

A real non-owner test is still pending because no second account is available. An owner-only test does not satisfy it.

## Change the agreement

Before changing terms, export the existing acceptance records and preserve the exact agreement revision they refer to. Publish a new version, update the copies in both repositories, and configure both integrations to use the reviewed new text. Require contributors to accept the new version before relying on it. Verify the service displays and records the intended revision and repeat the contributor test. Do not infer that a contributor accepted a version they have not signed, or that one person can grant rights in another person's work.

The [Gist renderer](https://github.com/cla-assistant/cla-assistant/blob/main/src/server/src/api/cla.js) selects the first file other than `metadata`. The [status implementation](https://github.com/cla-assistant/cla-assistant/blob/main/src/server/src/services/status.js) currently uses `license/cla` and reports unsigned contributors as pending. The [CLA Assistant documentation](https://github.com/cla-assistant/cla-assistant) describes repository linking, agreement versions, and signature export. The service holds acceptance records, so retain exports and the corresponding agreement revisions.

## Activation checklist

- [x] Reviewed version 1.0 published as a shared Gist and revision and hash recorded here.
- [ ] Owner authorized the service and connected both repositories.
- [ ] Actual status context and source observed and recorded here.
- [ ] Both `main` branches require that status and enforce it for administrators; existing protections are preserved.
- [ ] Real non-owner non-success, voluntary signing, and same-head success verified in both repositories.
- [ ] New commits and another unsigned contributor trigger rechecks; co-authors and unresolved identities reviewed manually.
