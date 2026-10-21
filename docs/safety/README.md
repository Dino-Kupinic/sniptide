# Content safety drafts

These documents are proposed policy and operating procedures for WRK-329. They are not an activated policy or a legal-compliance certification. Do not publish them as current service commitments until the activation checklist is complete.

- [Acceptable-use policy](acceptable-use.md) defines proposed content rules.
- [Incident response](incident-response.md) defines the responder workflow and a synthetic exercise.
- [Privacy disclosure](privacy-disclosure.md) describes the proposed handling of moderation data.

The proposed rules cover public, unlisted, private, password-protected, expiring, and one-time pastes. Visibility and password protection do not grant a policy exemption. They also do not constitute end-to-end encryption.

## Activation checklist

The service operator owns this checklist. Record decisions in an access-controlled operational register, without incident content or credentials in Git.

| Decision | Required result | Current status |
| --- | --- | --- |
| Operator and jurisdiction | Legal entity, establishment, relevant service territories, and counsel contact | Unconfirmed |
| Reporting obligations | Applicable triggers, authorities, secure reporting channels, deadlines, and emergency procedure | Requires legal confirmation |
| Preservation and disposal | Legal basis, scope, periods, authority to issue or release a hold, and backup treatment | Requires legal confirmation |
| Incident ownership | Named primary responder, backup, escalation route, availability, and response targets | Unassigned |
| Abuse contact | Monitored public reporting channel and tested urgent escalation | Not configured by these drafts |
| Appeal contact | Monitored route and decision-notice procedure | Not configured by these drafts |
| Access controls | Authorized reviewers, protected case storage, and access review | Requires implementation and operator verification |
| Enforcement | Verified restrictions across serving, editing, restoration, and deletion paths | Tracked in WRK-330 |
| Reporting and review tools | Report intake, administrative queue, notices, and appeals | Tracked in WRK-331 |
| Privacy | Published disclosure reflecting actual processors, access, transfers, and retention | Draft only |
| Training and exercise | Named participants complete the synthetic walkthrough and record results | The [walkthrough](incident-response.md#synthetic-walkthrough) is a design exercise only |

Preservation must not become indefinite retention by default. Restrict public access promptly while obtaining the applicable preservation instructions. A restriction is not itself a legal hold. Do not make an extra copy of suspected material merely to populate a case record.

## Delivery boundaries

WRK-330 provides the technical basis for restriction and any explicitly authorized preservation controls. It does not establish legal reporting obligations. WRK-331 adds public reports and administrative review. WRK-332 evaluates automated screening and its privacy implications. WRK-333 verifies the full workflow and ongoing monitoring.

Before activation, check the deployed version and complete the checklist against actual behavior. Existing previews retained by third-party messaging services cannot be recalled by changing a paste's current state.

## Reference guidance

These are sources for operator review, not a determination that every rule applies to Sniptide.

- [eSafety Safety by Design](https://www.esafety.gov.au/industry/safety-by-design).
- [eSafety child sexual exploitation prevention toolkit](https://www.esafety.gov.au/sites/default/files/2026-02/Designing-for-Safety_Preventing-child-sexual-exploitation-and-abuse-online_CSEA-toolkit.pdf).
- [EU Digital Services Act](https://eur-lex.europa.eu/eli/reg/2022/2065).
- [European Commission guidance on user rights](https://digital-strategy.ec.europa.eu/en/factpages/user-rights-under-digital-services-act).
- [Stopline Austria](https://www.stopline.at/en/home).
- [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline).
