# Documentation style guide

A shared standard for developer and product documentation. Use it to write, design, and review documentation that helps readers complete real work.

Version 1.4. Updated 3 November 2026. Source A is the primary reference. Source B, Source C, and Source D provide complementary patterns. Source evidence and review scope appear at the end.

## How to apply the source priorities

Use Source A as the default model for page anatomy, direct wording, product navigation, workflow variants, and operational documentation. When the sources offer different approaches to the same editorial decision, prefer the Source A pattern if it fits the reader's task. Accuracy, accessibility, and a complete working procedure remain requirements regardless of source preference.

| Priority | Source | Main contribution |
| --- | --- | --- |
| Primary | Source A | Outcome-led openings, practical entry points, explicit workflow choices, availability, limits, and production operations |
| Complementary | Source B | Content purposes, writing consistency, components, and accessible presentation |
| Complementary | Source C | Runnable recipes, concrete modifications, resource ownership, and cleanup |
| Complementary | Source D | Framework conventions, execution context, typed API reference, and migrations |

Source labels and inventory titles use neutral aliases. Canonical source URLs remain intact for traceability.

This weighting changes the standard throughout the document. It is an editorial preference, not a percentage derived from page counts. Apply the resulting rules to the adopting product's terminology and workflows.

## 1. Put the reader's task first

Every page must answer a recognizable question or help a reader reach a specific outcome. State that purpose at the beginning. Give readers enough context to choose the right path, then help them make progress.

For a product overview, prefer a compact statement of what the reader can accomplish, followed by a small, labeled example or a clear entry point. Explain the concept and deeper choices after readers can see its practical use. Include prerequisites beside an example if they are necessary to run it safely. An overview example introduces a capability; the linked quickstart provides the complete first-run procedure. Source A's [Functions overview](https://vercel.com/docs/functions) and [Observability overview](https://vercel.com/docs/observability) demonstrate this default.

Use this order when it fits the task:

1. Explain the outcome and when the page applies.
2. State the prerequisites and relevant constraints.
3. Show the smallest useful action or example.
4. Explain how to recognize success.
5. Provide recovery steps and cleanup when needed.
6. Link to configuration, related tasks, or deeper reference.

This guide uses **must** for requirements and **prefer** for defaults that allow judgment. Examples are illustrative unless identified as tested against a specific product version.

## 2. Choose a primary page type

Choose the reader's need before outlining the page. Keep the main purpose clear, and link to other page types when deeper detail would interrupt it.

| Page type | Reader's need | Required content |
| --- | --- | --- |
| Overview | Decide whether a product or capability fits | What it does, where it fits, constraints, and a useful starting point |
| Quickstart or tutorial | Get a first successful result | A bounded outcome, prerequisites, a complete path, and visible milestones |
| How-to | Complete a known task | Conditions, ordered actions, and verification |
| Integration | Connect an existing tool | Compatibility requirements, the connection point, a minimal example, and a runnable follow-up |
| Recipe | Adapt a working example | What it builds, files or repository, setup, run command, output, cleanup, and specific modifications |
| Reference | Look up exact behavior | A predictable description of inputs, outputs, defaults, limits, and failures |
| Explanation | Understand a concept or decision | A clear definition, relationships, rationale, tradeoffs, and links to practical use |
| Troubleshooting | Recover from a failure | Recognizable symptoms, diagnostic checks, corrective actions, and verification |
| Migration | Move an existing implementation to new behavior | Source and target versions, affected behavior, ordered changes, before-and-after examples, and verification |

The four core modes follow Source B's [content-type guidance](https://www.mintlify.com/docs/guides/content-types). Integration and recipe patterns draw on Source C's [connection guide](https://docs.steel.dev/integrations/playwright) and [runnable cookbook](https://docs.steel.dev/cookbook/playwright). Migration patterns draw on [Source D's upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade).

Use Source A's separation of [overview](https://vercel.com/docs/functions), [quickstart](https://vercel.com/docs/functions/quickstart), and [command reference](https://vercel.com/docs/cli/deploy) as the default relationship between pages. An overview offers useful routes into a capability. A quickstart delivers a first result. Reference explains the exact contract. Link these pages so each can stay focused.

## 3. Write directly and precisely

Address the reader as "you." Write instructions as commands. Name the system component that performs an action when the actor matters. Use present tense for current behavior and future tense only for an event that happens later.

Prefer familiar words and concrete verbs. Define necessary technical terms where they first appear. Keep the product's actual object names, interface labels, identifiers, and commands consistent across pages.

Keep each sentence focused on one idea. Split a sentence when its conditions make the reader backtrack. Use short paragraphs, with enough context to prevent ambiguity. Sentence length is an editing signal, not a quota.

Avoid filler, unexplained jargon, idioms, and claims such as "effortless," "powerful," or "production-ready" without concrete support. Do not describe a task as easy. A reader who needs help may disagree.

Adapt the tone to the task. A tutorial can acknowledge progress. A reference should prioritize exact facts. A failure message should explain what happened and what the reader can do next.

| Avoid | Prefer |
| --- | --- |
| Configuration can be performed via the dashboard. | Open **Settings** and select **Webhooks**. |
| Simply run the following command. | Run this command from the project directory. |
| The request failed. | The request returned `401`. Check that the API key is set in the server environment. |
| A timeout of 30 is used. | The request timeout defaults to 30 seconds. |
| This powerful feature improves reliability. | The client retries a failed connection up to three times. |

These are original editing examples. Apply the behavior claims only when they match the product. The voice draws on [Source B's writing guidance](https://www.mintlify.com/docs/guides/style-and-tone) and [Source C's published brand voice](https://docs.steel.dev/DESIGN.md).

## 4. Make pages easy to scan

Use one page title and a logical heading hierarchy. Use sentence case. Task headings should name an action, such as "Create a webhook." Reference headings should name the thing being described, such as "Response fields."

Write a short description that adds information to the title. Put important context in the opening rather than repeating the description word for word. Make headings specific enough to work in a table of contents or a search result.

Keep the opening concrete. Prefer a capability, action, or consequence over a paragraph of product positioning. Source A's [access-token documentation](https://vercel.com/docs/accounts/access-tokens) explains authentication, scope, and one-time visibility before the detailed workflow.

Use numbered lists for sequences and bullets for unordered items. Keep related items parallel. Use a table when the reader needs to compare the same attributes across several options.

Put code identifiers, paths, environment variables, and literal values in `code`. Put interface labels in **bold** when referring to controls. Use descriptive link text that tells readers what they will find.

Do not repeat the page as an FAQ. Add a question only when it resolves a distinct uncertainty, exception, or decision. Put answers needed to complete the main task in the main content.

## 5. Organize navigation around useful routes

Give new readers a visible starting point. Give returning readers direct routes to tasks, integrations, recipes, and reference. A small product may combine these in one sidebar. A larger product may need separate sections.

For a broad platform, organize the top level around the reader's work, such as building, deploying, operating, and managing resources. Within each area, keep product names stable and expose quickstarts, configuration, reference, limits, and troubleshooting as needed. Source A's [documentation home](https://vercel.com/docs) provides the primary model for this organization. The directory-based route below remains useful for frameworks.

Use labels readers recognize, and keep them short enough to scan. Group related pages and promote frequently needed material. Add nesting only when the group names help readers predict where an answer belongs.

Do not impose a fixed number of navigation items on every site. Validate the structure with task-finding exercises, search queries, support questions, and observed navigation failures.

A starting structure might be:

```text
Get started
  Overview
  Quickstart
  Core concepts
Guides
  Common tasks
  Configuration
  Operations
Integrations
Recipes
Reference
Troubleshooting
```

Keep product, language, and version choices explicit when they change instructions. Preserve existing links with redirects when pages move. These rules synthesize [Source B's navigation guidance](https://www.mintlify.com/docs/guides/navigation) and Source C's separation of [integration](https://docs.steel.dev/integrations/playwright), [recipe](https://docs.steel.dev/cookbook/playwright), and [conceptual overview](https://docs.steel.dev/overview/sessions-api/overview) pages.

For products whose behavior follows a directory structure, provide a parallel lookup route by file or directory. Explain each location's purpose and connect it to tasks and API entries. Source D's [pages directory reference](https://nuxt.com/docs/4.x/directory-structure/app/pages) illustrates how a structural reference complements task-based navigation.

## 6. Give procedures a verifiable result

List required permissions, credentials, runtime versions, and existing setup before the steps that depend on them. State where commands run and where files belong.

State applicability where it changes the path. Identify the relevant plan, role, resource scope, environment, framework, and feature status. Include only dimensions that affect the task. Put restrictions beside the affected action and link to the authoritative access or limits reference. Source A's [Observability access information](https://vercel.com/docs/observability) and [role documentation](https://vercel.com/docs/rbac/access-roles) illustrate this practice.

Present dashboard, command-line, API, and framework variants at the point of choice. Give selection criteria and keep each chosen path complete. Do not imply that one interface is mandatory when supported alternatives exist. Source A's [deployment overview](https://vercel.com/docs/deployments) distinguishes several routes to the same outcome.

Give each step one main action. Put conditions before the action they govern. Explain a choice at the point where the reader must make it. A first-run tutorial should have one recommended path; put optional variants after the first success or behind clearly labeled alternatives.

Show what success looks like. Use an expected file, response, log line, interface state, or test result. Explain variable values so readers do not mistake a different identifier or timestamp for failure.

When an action creates a remote resource, starts a process, incurs charges, or changes persistent state, document its lifetime and cleanup. Make that cleanup part of the procedure. Source C's [session quickstart](https://docs.steel.dev/overview/sessions-api/quickstart) demonstrates cleanup in a `finally` block, and its [lifecycle guide](https://docs.steel.dev/overview/sessions-api/session-lifecycle) makes termination behavior explicit.

For a live change, explain when it takes effect, which environment it affects, and what recovery restores. State what recovery leaves unchanged, including external data or configuration when relevant. Source A's [environment-variable guide](https://vercel.com/docs/environment-variables) distinguishes new deployments from existing ones, and its [rollback guide](https://vercel.com/docs/instant-rollback) describes consequences beyond changing the active deployment.

## 7. Treat examples as working instructions

Distinguish a **minimal excerpt** from a **complete example**. An excerpt may isolate an integration point, but it must identify assumptions and link to a runnable version. A complete example must include the imports, dependencies, setup, execution command, and expected result needed to reproduce it.

For every complete example:

- State the runtime and dependency requirements.
- Name the file and working directory.
- Use obvious placeholders and explain how to replace them.
- Load credentials through the supported mechanism and keep secrets out of published output.
- Include error handling and resource cleanup appropriate to the task.
- Explain which values are defaults and which are optional choices.
- State what the example proves and what additional work deployment requires.
- Verify it against the supported environment before publication.

Keep equivalent language examples aligned in behavior, prerequisites, and cleanup. Preserve language-specific API names rather than inventing uniform spelling across SDKs.

Label framework, language, package-manager, and interface variants consistently. Show only the differences needed for the selected path. Keep filenames attached to code, and ensure that exported text still identifies the applicable variant. Source A's [Functions quickstart](https://vercel.com/docs/functions/quickstart) supplies the primary model for framework-specific file examples.

Use comments for decisions that code alone does not explain. Avoid comments that narrate each assignment. Keep output separate from commands so readers can copy the command safely.

### Make conventions visible

Label code examples with the file path when placement changes behavior. Identify whether a directory tree is relative to the project root or another configured directory. Distinguish files the reader creates from generated files.

For automatic behavior, explain the input and resulting behavior together. A file tree can show which files register automatically, and an adjacent example can show the generated route or available symbol. Include naming rules, scan boundaries, ordering, and overrides where they affect the task.

An example that relies on auto-imports or injected values must identify that convention. If an equivalent explicit form is supported, show or link to it. Source D's [plugin registration guide](https://nuxt.com/docs/4.x/directory-structure/app/plugins) and [auto-import explanation](https://nuxt.com/docs/4.x/guide/concepts/auto-imports) demonstrate these patterns.

When a subtle mistake causes a recognizable failure, show a small failing example beside its correction. Name the condition and symptom, and label the failing code clearly. Keep the pair focused on the difference that fixes the issue. This pattern appears in Source D's [auto-import context examples](https://nuxt.com/docs/4.x/guide/concepts/auto-imports).

This standard combines Source C's [small connection example](https://docs.steel.dev/integrations/playwright), [runnable recipe](https://docs.steel.dev/cookbook/playwright), and Source B's [content templates](https://www.mintlify.com/docs/guides/content-templates). The verification requirements are editorial policy adopted for this guide.

## 8. Explain configuration through decisions

Start with the default or smallest valid configuration. Then map common goals to the settings they require. Put the exhaustive option list in reference material.

For each setting, document the type, units, default, allowed values, scope, and relevant interactions. Distinguish "omitted," `null`, `false`, and `0` when they produce different behavior.

For time-based behavior, explain when the timer starts, what resets it, what happens at expiry, and whether a hard limit takes precedence. For persistent state, explain what survives, who owns it, and when it is deleted.

Label recommendations separately from product defaults. Label service limits separately from example values. Link to the authoritative limits page when a plan or deployment changes the answer.

### Document operational limits and cost

For a hosted capability, make limits and resource use part of the documentation plan. Distinguish a default, a configurable maximum, an included allowance, and a hard service limit. State the unit, scope, eligibility, and consequence of exceeding a limit. Link to the setting or recovery procedure rather than leaving the reader with a number alone. Source A's [Functions limits reference](https://vercel.com/docs/functions/limitations) is the primary model.

Explain billing through the resource being measured and its billing unit. State when measurement starts and stops, whether waiting time counts, and how included usage or credits affect the result. Use a worked example with explicit assumptions when it clarifies the model. Keep current rates in one authoritative location. Source A's [compute pricing explanation](https://vercel.com/docs/functions/usage-and-pricing) demonstrates the distinction between execution time, memory lifetime, and request counts.

Compare similar mechanisms at the point where the reader must choose. Explain the deciding condition and the consequence of each choice. Link to reference for complete options. Avoid unsupported claims that one mechanism is always faster, safer, or better.

### Explain where and when code runs

When execution context affects behavior, state whether code runs during build, on the server, in the browser, or in more than one environment. Explain repeated execution, request-scoped state, initialization, and later updates where relevant. Annotate the relevant lines rather than leaving readers to infer the context.

For asynchronous behavior, describe the initial state, what blocks progress, what completes in the background, and how success, failure, refresh, or cancellation changes the state. Explain interactions between options that appear similar. Source D's [rendering explanation](https://nuxt.com/docs/4.x/guide/concepts/rendering) and [data-fetching guide](https://nuxt.com/docs/4.x/getting-started/data-fetching) supply these patterns.

Source C's [configuration guide](https://docs.steel.dev/overview/sessions-api/configuration) and [session lifecycle](https://docs.steel.dev/overview/sessions-api/session-lifecycle) provide the main pattern behind this section.

## 9. Make reference complete and predictable

Use the same field order across comparable entries. For an API operation, document its purpose, method and path, authentication, inputs, response, errors, and relevant side effects.

For each input or response field, state the name, type, meaning, required status, and default where applicable. Explain nested fields and provide representative values. State pagination, retry behavior, idempotency, or rate limits where they affect the operation.

Put credential scope and handling requirements beside authentication instructions. Distinguish a missing value from an empty result, and a successful request from completed asynchronous work.

Generate reference details from schemas where practical. Review the descriptions and examples for accuracy. Generated structure does not guarantee useful explanations. [Source B's API introduction](https://www.mintlify.com/docs/api/introduction) illustrates explicit authentication scope and credential handling.

For callable APIs, also document the signature, return type, state changes, execution context, and side effects. Explain shared state, interaction constraints, and cancellation when applicable. Pair a common usage example with focused variants so readers can find a starting point before consulting every option. Source D's [useAsyncData reference](https://nuxt.com/docs/4.x/api/composables/use-async-data) combines usage, types, parameters, return values, and status definitions.

For command reference, document invocation syntax, working directory, authentication and scope, common usage, options, output, and failure behavior. Explain standard output, standard error, and exit codes when scripts depend on them. Describe prompts, non-interactive flags, and dry-run behavior where supported. Source A's [deploy command reference](https://vercel.com/docs/cli/deploy) is the default model for this contract.

## 10. Help readers diagnose failures

Use symptoms readers can recognize as troubleshooting headings. For each issue, give a check, explain what the result means, and provide a corrective action. Prefer a short diagnostic sequence over an unordered list of speculative causes.

| Symptom | Check | Action | Verification |
| --- | --- | --- | --- |
| Authentication fails | Confirm the credential is available to the process making the request. | Set or replace the credential through the supported mechanism. | Repeat a documented read-only request. |
| A connection times out | Check the documented endpoint, network access, and resource state. | Correct the failed dependency. | Reconnect and confirm an expected response. |
| State does not persist | Inspect the feature's persistence scope and lifetime. | Use the documented persistence mechanism. | Repeat the task in a new process or session. |

These rows illustrate the format. Replace them with product-specific diagnostics. Include a path to support that names useful evidence, such as a request ID, version, or sanitized log. Source C's [skills troubleshooting](https://docs.steel.dev/overview/skills/troubleshooting) is an example of symptom-based guidance.

For production investigations, connect the symptom to the right evidence. Use logs for failing events, traces for a request path, and metrics for behavior over time. Specify the resource scope, environment, and time range. Explain how to interpret the result and disclose access or retention limits where they affect the investigation. Source A's [Observability guide](https://vercel.com/docs/observability) is the primary model for this sequence.

## 11. Use components to support comprehension

Choose a component because it solves a reading problem. Keep ordinary explanatory text in the main reading flow.

| Component | Use | Guardrail |
| --- | --- | --- |
| Steps | A sequence with distinct stages | Preserve the order and keep the required actions visible. |
| Tabs or code groups | Equivalent language, platform, or workflow choices | Label each choice clearly and keep its instructions complete. |
| Cards | A choice between destinations | Give each card a useful title and enough context to choose. |
| Callouts | A constraint, warning, or relevant shortcut | Use a severity that matches the consequence. |
| Accordions | Secondary explanations or uncommon cases | Keep required setup and warnings in the main flow. |
| Tables | Repeated attributes and comparisons | Use plain paragraphs when long cells make comparison difficult. |
| Screenshots or diagrams | A location, relationship, or sequence that benefits from a visual | Supply a text alternative and maintain the visual when the product changes. |

This selection model draws on [Source B's component library](https://www.mintlify.com/docs/components) and [media guidance](https://www.mintlify.com/docs/guides/media).

## 12. Keep the interface quiet and readable

Give the main article a clear reading area. Make site navigation, the current location, and page sections easy to identify. Let long reference pages carry more density than tutorials without shrinking text or hiding essential information.

Use a readable prose typeface and a monospace face for code and literal values. Establish hierarchy through consistent type, spacing, and restrained borders. Use accent color for meaningful emphasis and interaction states.

Support the product's theme requirements, including readable code, callouts, links, and focus states. Pair status colors with text or icons. Ensure keyboard access, a logical heading order, descriptive links, appropriate image alternatives, and usable content at narrow widths and increased zoom.

These are functional design recommendations informed by [Source C's published design language](https://docs.steel.dev/DESIGN.md) and [Source B's accessibility guidance](https://www.mintlify.com/docs/guides/accessibility). This generic standard does not prescribe either brand's palette, fonts, or theme. No pixel measurements or browser accessibility audit were performed for this synthesis.

## 13. Preserve meaning in exported content

Offer a discoverable documentation index and stable page URLs. Provide text or Markdown representations when they help external tools consume the content.

Ensure exported code keeps its language labels, prerequisites, and surrounding explanation. Label alternatives so a flattened export does not merge incompatible instructions. Give interactive content a useful text equivalent and keep warnings close to the steps they govern.

Inspect exported content after changes to templates or custom components. Make sure examples, links, and headings still make sense outside the rendered site. This recommendation follows [Source B's Markdown export documentation](https://www.mintlify.com/docs/ai/markdown-export) and the indexes supplied by both sources.

## 14. Maintain accuracy as part of publication

Assign an owner to content that can drift. Review instructions when the corresponding product behavior changes. Keep claims about versions, limits, pricing, and availability tied to an authoritative source.

Check links, navigation, terminology, and examples before publication. Use automation for checks it can perform reliably, and reserve human review for audience fit, missing context, and misleading explanations. Prioritize maintenance using reader failures, support demand, traffic, and feedback. [Source B's maintenance guide](https://www.mintlify.com/docs/guides/maintenance) supports this approach.

Resolve conflicting examples before publishing them. If verification is unavailable, state the unresolved point rather than selecting a plausible answer. A working example on one page does not establish consistency across the site.

Label availability changes beside the affected feature. State minimum versions, experimental status, deprecation, and replacement behavior when relevant. A site-wide version selector cannot explain every feature's history.

## 15. Make migrations explicit

Name the source and target versions in the opening. Identify affected users and prerequisites. Separate a routine dependency update from an upgrade that changes application behavior.

For each breaking change, explain the old behavior, the new behavior, and the action required. Pair corresponding before-and-after code with file paths. If automation is available, state its scope and the changes that still need review. Distinguish a temporary compatibility option from the intended final implementation.

Give readers checks that confirm the new behavior and a recovery path appropriate to the change. Mark irreversible steps before they occur. Recovery guidance is a policy recommendation in this standard.

Source D's [upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade) supplies patterns for versioned changes and codemods. Its [runtime configuration migration](https://nuxt.com/docs/4.x/migration/runtime-config) shows a focused subsystem migration. Verify the migration endpoints in the content itself. A documentation URL containing a version does not establish which versions the migration covers.

## 16. Use these authoring templates

### Product overview

```markdown
# [Capability]

[State what readers can accomplish and when to use the capability.]

## [Practical entry point]

[Give a compact, labeled example or an action linked to a complete quickstart.]
[State required context and relevant availability.]

## How it works

[Explain the mechanism and its boundaries.]

## Choose an approach

[Compare supported workflows by the decision the reader needs to make.]

## Operate the capability

[Link to configuration, monitoring, limits, and pricing where relevant.]

## Explore further

[Offer distinct routes to the quickstart, task guides, and reference.]
```

### Task page

```markdown
# [Verb] [object]

[State the outcome and when this procedure applies.]

## Before you begin

[List required setup, permissions, credentials, and versions.]
[Identify the environment, scope, and availability that affect this task.]

## Choose your workflow

[Include only when supported paths differ. State how to choose.]

## [Action that advances the task]

1. [Give a concrete action and its location.]
2. [Provide the required command or configuration.]
3. [Describe the result where it helps the reader continue.]

## Verify the result

[Give a specific check and explain variable output.]

## Troubleshooting

[Address a likely symptom with a diagnostic and corrective action.]

## Clean up

[Release temporary resources or explain persistent changes.]

## Next steps

[Link to a relevant task, recipe, explanation, or reference.]
```

### Integration or recipe

```markdown
# [Build or connect] [specific outcome]

[Describe what runs where and which connection this example adds.]

## Requirements

[Name runtime versions, packages, credentials, and required access.]

## Connect the tools

[Show the integration point and identify whether the snippet is an excerpt.]

## Run the example

[Link to complete files or provide them. Give setup and execution commands.]

## Check the output

[Show observable results, generated files, or a verification request.]

## Clean up

[Close processes and release remote resources, including on failure.]

## Adapt the example

[Offer specific modifications and explain the setting each requires.]

## Related documentation

[Link to configuration, limits, troubleshooting, and API reference.]
```

### Migration

```markdown
# Migrate [subsystem] from [source version] to [target version]

[State who is affected and what changes.]

## Before you begin

[List required versions, preparation, and relevant compatibility constraints.]

## [Changed behavior]

[Explain the old behavior and the replacement.]
[Show labeled before-and-after examples with file paths.]
[Give ordered actions, including any supported migration command.]

## Verify the migration

[Check the changed behavior and remaining manual work.]

## Recover from a failed migration

[Describe recovery steps and any irreversible changes.]
```

Omit sections that do not apply. A reference page uses the field structure in section 9. An explanation uses a concept-led outline. In a platform that generates a title from metadata, omit the duplicate H1 from the page body.

## 17. Publication checklist

- [ ] The page has a clear audience, purpose, and outcome.
- [ ] The title, description, and headings help readers find an answer.
- [ ] Prerequisites and relevant constraints appear before affected actions.
- [ ] Availability, role, scope, environment, and workflow variants are explicit where relevant.
- [ ] The main path leads to a recognizable result.
- [ ] Examples identify their environment and have been verified.
- [ ] Equivalent examples agree across languages and pages.
- [ ] File locations, automatic behavior, and execution contexts are explicit where they affect the result.
- [ ] Defaults, limits, units, persistence, and side effects are explicit where relevant.
- [ ] Cleanup covers resources the procedure creates, including failure paths.
- [ ] Recovery instructions start with symptoms readers can recognize.
- [ ] Production tasks explain when changes take effect and how to inspect or recover from failures.
- [ ] Usage-based capabilities explain measurement units, limits, and where to find current pricing.
- [ ] Components and media improve comprehension and remain accessible.
- [ ] Links work and exported content preserves the instructions.
- [ ] Time-sensitive claims have a source and a maintenance owner.
- [ ] Migrations name source and target versions, required changes, and verification steps.

## Evidence and coverage

The preceding sections are a synthesized editorial standard. They combine source guidance, observed patterns, and policy recommendations. They do not claim that either source follows every rule on every page.

On 3 November 2026, Source B's, Source C's, and Source A's public full-text exports were downloaded and split using their source URL markers. Source D's connected documentation tools supplied its version 4 catalog and page content. Source A's sitemap was also compared with its export, and missing pages were requested individually. Every retrieved section was included in a structural scan. Selected pages were read closely for the rules above. Retrieval and structural scanning are distinct from manually reviewing every page or exercising every example.

| Source | Retrieved page sources | Scope |
| --- | --- | --- |
| [Source A documentation](https://vercel.com/docs) | 2,022 unique documentation URLs | Primary reference. Full-export content plus successful retrievals of sitemap pages absent from the export |
| [Source B full-text export](https://www.mintlify.com/docs/llms-full.txt) | 272 unique source URLs | Includes guides, components, configuration, deployment, help, and API material present in the export |
| [Source C full-text export](https://docs.steel.dev/llms-full.txt) | 140 unique source URLs | Includes overview, integration, and cookbook material present in the export |
| [Source D version 4 documentation](https://nuxt.com/docs/4.x/getting-started/introduction) | 272 unique page URLs | All `/docs/4.x/` entries returned by the connected version 4 catalog, retrieved individually |
| [Source C design guide](https://docs.steel.dev/DESIGN.md) | Separate source | Published brand principles and voice, read directly |

Source C's export covered all 140 links parsed from its [documentation index](https://docs.steel.dev/llms.txt). Source B's [index](https://www.mintlify.com/docs/llms.txt) also points to nested collections, other languages, and external destinations. This review used the English full-text export. It did not crawl translated collections, authenticated areas, external repositories, or Source C's separately hosted API reference. Exported text does not establish visual or interactive behavior.

Source D's version 4 catalog returned 291 entries, including 19 shared example pages outside `/docs/4.x/`. The review retrieved all 272 version-specific entries. The connected tool truncated 32 long responses, so those bodies were replaced with the full public Markdown at the corresponding `https://nuxt.com/raw/docs/4.x/...md` URLs. No truncation markers remained. Other major versions, shared example pages, external dependencies, and interactive sandboxes were outside this retrieval scope. Source D framework examples were not executed.

Source A's [full export](https://vercel.com/docs/llms-full.txt) contained 1,666 documentation sections covering 1,661 unique documentation URLs. Repeated source sections were combined for the inventory. One additional source block pointing to the external OpenAPI site was excluded. Its [sitemap](https://vercel.com/docs/sitemap.md) listed 1,729 documentation page URLs after excluding links to the sitemap and taxonomy metadata. Of these, 1,357 were in the export, 361 additional pages were retrieved as Markdown, and 11 API pages returned HTTP 404 at both their canonical and Markdown URLs. Those unavailable pages are recorded in the inventory. Authenticated areas and separately hosted documentation sites were outside scope. Source A commands were not executed.

The companion `documentation-source-inventory.csv` lists 2,717 page entries: 2,706 successfully retrieved sources across the four sites and 11 unavailable Source A API pages. Successful entries include body sizes and SHA-256 digests. Unavailable entries have a zero size, no digest, and an explicit failure label. Coverage labels distinguish exports, connected-tool responses, public Markdown retrievals, and failures. A digest identifies the text used for this review. It is not a claim that the live page remains unchanged.

### Patterns selected and adapted

| Source contribution | Adopted rule | Adaptation |
| --- | --- | --- |
| Source A's practical overview openings | Lead with an outcome and a useful entry point | Prefer this page anatomy while supplying enough context to use an example safely. |
| Source A's workflow, access, and operational documentation | Make variants, availability, limits, cost, and diagnostic evidence explicit | Use these as default editorial requirements where the product has the corresponding behavior. |
| Source A's command reference and rollback guidance | Describe output contracts, activation timing, and recovery consequences | Preserve verification and cleanup requirements even when a source example omits them. |
| Source B's explicit writing and content guidance | Match voice and page structure to reader intent | Use flexible editing judgments rather than mechanical sentence or navigation quotas. |
| Source B's component patterns | Choose components by reading need | Keep essential instructions visible and readable in text exports. |
| Source C's integration and cookbook separation | Pair a small connection example with a runnable recipe | Clearly label excerpts and complete examples. |
| Source C's configuration and lifecycle material | Explain defaults, decisions, persistence, and cleanup | Apply the pattern to any resource-owning product. |
| Source C's recipe customization sections | Offer concrete modifications after the first working result | Explain which setting changes and why. |
| Source C's published visual principles | Use restrained surfaces, meaningful color, and distinct code typography | Leave palette, typeface, and theme choices to the adopting product. |
| Source D's convention and directory documentation | Connect file placement and naming to automatic behavior | Make scan boundaries, imports, and overrides explicit. |
| Source D's rendering and data-fetching explanations | State execution context, lifecycle, and consequences of similar choices | Apply the pattern to any system with multiple runtimes or asynchronous states. |
| Source D's API and upgrade documentation | Pair usage with exact reference and scoped migration steps | Require explicit migration endpoints, feature availability, and verification. |

### Source inconsistencies informed the verification rules

Source C's export introduction advises against using `session.websocketUrl`, while the Playwright integration uses that property. Its integration says local browser installation is unnecessary, while the Python note in its session quickstart tells readers to install Chromium. These conflicts were observed in the downloaded corpus and were not resolved through runtime testing. This guide adopts the documentation patterns without reproducing those instructions as verified technical advice.

The synthesis also avoids repeated FAQs that add no new answer, promotional claims without evidence, and brand-specific design choices. Future sources should strengthen or revise this shared standard rather than add isolated vendor chapters.

Source D's version 4 migration overview still describes a Source D 2-to-3 migration. The guide therefore requires explicit source and target versions rather than inferring them from a URL. Its introductory benefit claims are not adopted as universal guarantees about performance, search indexing, or accessibility. Patterns from Source D were selected for their explanatory value, not treated as proof of runtime behavior.

Source A's getting-started page presents the CLI as a universal starting point, while its deployment overview also supports Git and dashboard workflows. This standard retains the useful workflow patterns without imposing an unnecessary interface requirement. Source A's greater editorial weight does not endorse every promotional claim, guarantee source-wide consistency, or replace technical verification. The visual recommendations remain functional guidance; no measured visual audit was added in this review.
