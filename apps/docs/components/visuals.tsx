import { Badge } from "@sniptide/ui/components/badge"
import { buttonVariants } from "@sniptide/ui/components/button"
import { Kbd } from "@sniptide/ui/components/kbd"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ArrowRight,
  Bot,
  Copy,
  FileCode,
  FileText,
  Flame,
  Link2,
  Lock,
  SquarePen,
  SquareTerminal,
  UserPlus,
} from "lucide-react"
import type { ReactNode } from "react"

// Diagrams for the docs, drawn with the app's tokens and components so they follow the theme,
// light and dark, and reflow on phones. The miniature screens are pictures: they are hidden from
// assistive technology and can't be focused, and the text beside them carries the meaning.
// Keep their wording in step with apps/web/messages/en and with the page each one illustrates.

/** A button as a picture: the app's styles on a span, so it can't be focused or pressed. */
function FakeButton({
  variant = "default",
  size = "sm",
  className,
  children,
}: {
  variant?: "default" | "outline" | "secondary"
  size?: "xs" | "sm"
  className?: string
  children: ReactNode
}) {
  return (
    <span data-slot="button" className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </span>
  )
}

/** The frame of one miniature screen. Every stage in a figure is the same height. */
function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      inert
      className={cn(
        "flex h-44 flex-col overflow-hidden rounded-lg border bg-sidebar p-3 select-none",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Steps that happen in order, joined by arrows: three columns, or one column on phones. */
function Sequence({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure aria-label={label} className="not-prose my-8">
      <ol className="grid gap-10 md:grid-cols-3 md:gap-8">{children}</ol>
    </figure>
  )
}

function Step({
  title,
  first = false,
  stage,
  children,
}: {
  title: string
  first?: boolean
  stage: ReactNode
  children: ReactNode
}) {
  return (
    <li className="relative min-w-0">
      {first ? null : (
        <ArrowRight
          aria-hidden
          className="absolute -top-7 left-1/2 size-4 -translate-x-1/2 rotate-90 text-muted-foreground md:top-20 md:-left-4 md:-translate-y-1/2 md:rotate-0"
        />
      )}
      {stage}
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </li>
  )
}

/** One line of highlighted code, from parts of [text, token] where token names a --syntax-* colour. */
type Token = "keyword" | "string" | "function" | "type" | "punctuation" | "comment" | "property"
const tokenClass: Record<Token, string> = {
  keyword: "text-(--syntax-keyword)",
  string: "text-(--syntax-string)",
  function: "text-(--syntax-function)",
  type: "text-(--syntax-type)",
  punctuation: "text-(--syntax-punctuation)",
  comment: "text-(--syntax-comment)",
  property: "text-(--syntax-property)",
}

function Code({ lines }: { lines: (string | [string, Token])[][] }) {
  return (
    <div className="font-mono text-xs leading-5 whitespace-pre text-(--syntax-foreground)">
      {lines.map((parts, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static lines that never reorder
        <div key={row} className="flex gap-3">
          <span className="w-3 shrink-0 text-right text-muted-foreground/70 tabular-nums">
            {row + 1}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-pre">
            {parts.map((part, index) =>
              typeof part === "string" ? (
                part
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static tokens that never reorder
                <span key={index} className={tokenClass[part[1]]}>
                  {part[0]}
                </span>
              ),
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A collection's square icon, as in the app's sidebar. */
function CollectionIcon({ className }: { className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-[1px] bg-primary", className)} />
}

/** The link field from the paste's Sharing panel. */
function LinkField() {
  return (
    <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-background pr-1 pl-2.5">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
        app.sniptide.com/k3j9xq
      </span>
      <FakeButton variant="outline" size="xs" className="px-1.5">
        <Copy />
      </FakeButton>
    </div>
  )
}

export function FirstPasteVisual() {
  return (
    <Sequence label="Create a paste, file it in a collection, then share its link.">
      <Step
        first
        title="Create a paste"
        stage={
          <Stage>
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <FileCode className="size-3.5 text-muted-foreground" />
              <span className="font-mono">useDebounce.ts</span>
            </div>
            <div className="mt-3 flex-1">
              <Code
                lines={[
                  [
                    ["function ", "keyword"],
                    ["useDebounce", "function"],
                    "(",
                    ["v", "property"],
                    ") {",
                  ],
                  ["  ", ["const ", "keyword"], "[d, set] = ", ["useState", "function"], "(v)"],
                  ["  ", ["// settles after 300ms", "comment"]],
                  ["  ", ["return ", "keyword"], "d"],
                ]}
              />
            </div>
            <div className="flex justify-end">
              <FakeButton>
                Create paste <Kbd>⌘↵</Kbd>
              </FakeButton>
            </div>
          </Stage>
        }
      >
        Type or paste code. Sniptide suggests a title and a file name.
      </Step>
      <Step
        title="File it in a collection"
        stage={
          <Stage className="gap-0.5 text-sm">
            <span className="px-2 pb-1 text-xs text-muted-foreground">Collections</span>
            <span className="flex h-8 items-center gap-2.5 rounded-md bg-muted px-2 font-mono text-[13px] text-foreground">
              <CollectionIcon />
              api-snippets
            </span>
            <span className="flex h-8 items-center gap-2 rounded-md pr-2 pl-[30px] text-[13px] text-foreground">
              useDebounce hook
            </span>
            <span className="flex h-8 items-center gap-2.5 rounded-md px-2 font-mono text-[13px] text-muted-foreground">
              <CollectionIcon className="bg-foreground" />
              dotfiles
            </span>
            <span className="flex h-8 items-center gap-2.5 rounded-md px-2 font-mono text-[13px] text-muted-foreground">
              <CollectionIcon className="border border-primary bg-transparent" />
              k8s-manifests
            </span>
          </Stage>
        }
      >
        A collection groups your pastes in the sidebar so you find them again.
      </Step>
      <Step
        title="Share the link"
        stage={
          <Stage className="justify-center gap-3">
            <div className="flex gap-0.5 rounded-lg bg-muted p-[3px] text-[13px] leading-[18px]">
              {["Private", "Unlisted", "Public"].map((option) => (
                <span
                  key={option}
                  className={cn(
                    "flex-1 rounded-md py-[5px] text-center text-muted-foreground",
                    option === "Unlisted" &&
                      "bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
                  )}
                >
                  {option}
                </span>
              ))}
            </div>
            <LinkField />
          </Stage>
        }
      >
        Copy the link, or make the paste private and invite people.
      </Step>
    </Sequence>
  )
}

export function BurnAfterReadVisual() {
  return (
    <Sequence label="A sealed link leads to one confirmed read, after which the paste moves to your trash.">
      <Step
        first
        title="The sealed page"
        stage={
          <Stage className="items-center justify-center gap-2 text-center">
            <Lock className="size-4 text-muted-foreground" />
            <span className="font-heading text-base text-foreground">Read once</span>
            <span className="max-w-44 text-xs text-muted-foreground">
              This paste can be read once. Opening it deletes it.
            </span>
            <FakeButton className="mt-1">
              <Flame />
              Open and burn
            </FakeButton>
          </Stage>
        }
      >
        Readers, link previews and crawlers see this page first, so the read stays unused.
      </Step>
      <Step
        title="One reader opens it"
        stage={
          <Stage className="gap-3">
            <div className="flex-1">
              <Code
                lines={[
                  [["DB_HOST", "property"], "=", ["db.internal", "string"]],
                  [["DB_USER", "property"], "=", ["deploy", "string"]],
                  [["DB_PASS", "property"], "=", ["n8#Qe…", "string"]],
                ]}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              This paste is now deleted. Copy what you need before you leave.
            </span>
            <FakeButton variant="outline" className="self-start">
              <Copy />
              Copy
            </FakeButton>
          </Stage>
        }
      >
        The reader confirms and gets the code, and the link stops working at once.
      </Step>
      <Step
        title="It moves to your trash"
        stage={
          <Stage className="gap-2">
            <span className="px-2 text-xs text-muted-foreground">Trash</span>
            <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-foreground">Staging database</span>
                <span className="text-xs text-muted-foreground">Read Nov 3</span>
              </div>
              <FakeButton variant="outline" size="xs">
                Restore
              </FakeButton>
            </div>
            <div className="flex items-center gap-2 px-2 py-2 opacity-60">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-foreground">nginx reverse proxy</span>
                <span className="text-xs text-muted-foreground">Deleted Oct 28</span>
              </div>
            </div>
          </Stage>
        }
      >
        You can restore it for 30 days as a private paste, and its link never opens again.
      </Step>
    </Sequence>
  )
}

/** One way in or out of a paste, in the overview diagram. */
function Route({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-foreground">
      <span aria-hidden className="mt-0.5 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-sm font-medium text-foreground">{title}</p>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </div>
  )
}

function Connector() {
  return (
    <ArrowRight
      aria-hidden
      className="size-4 shrink-0 rotate-90 justify-self-center text-muted-foreground md:rotate-0 md:self-center"
    />
  )
}

export function HowItFitsVisual() {
  return (
    <figure
      aria-label="Code enters a paste from the app, the CLI or an agent. The paste sits in a collection and leaves through its link, invitations or an agent."
      className="not-prose my-8 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.35fr)_auto_minmax(0,1fr)] md:gap-5"
    >
      <Column title="Create">
        <Route icon={<SquarePen />}>The editor in the app</Route>
        <Route icon={<SquareTerminal />}>
          <code className="font-mono text-[13px]">sniptide push</code> from a terminal
        </Route>
        <Route icon={<Bot />}>A coding agent over MCP</Route>
      </Column>
      <Connector />
      <div
        aria-hidden
        inert
        className="flex flex-col gap-3 rounded-lg border bg-sidebar p-4 select-none"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CollectionIcon />
          <span className="font-mono">api-snippets</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-heading text-lg leading-6 tracking-[-0.02em] text-foreground">
            useDebounce hook
          </span>
          <Badge variant="muted" className="h-5 px-1.5 text-xs">
            Unlisted
          </Badge>
        </div>
        <span className="truncate font-mono text-xs text-link">app.sniptide.com/k3j9xq</span>
        <div className="flex flex-col border-t pt-2">
          {[
            { name: "useDebounce.ts", icon: FileCode },
            { name: "useDebounce.test.ts", icon: FileCode },
            { name: "README.md", icon: FileText },
          ].map(({ name, icon: Icon }) => (
            <span
              key={name}
              className="flex h-7 items-center gap-2 font-mono text-xs text-foreground"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              {name}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">3 revisions</span>
      </div>
      <Connector />
      <Column title="Share and reuse">
        <Route icon={<Link2 />}>Its link, for anyone while it is unlisted or public</Route>
        <Route icon={<UserPlus />}>People you invite to a private paste</Route>
        <Route icon={<Bot />}>Your agents and the CLI, through a token</Route>
      </Column>
    </figure>
  )
}

/** One line of a terminal session: a prompt, a tool call or a result. */
function TermLine({
  kind,
  children,
}: {
  kind: "prompt" | "call" | "result" | "done"
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex gap-2 font-mono text-xs leading-5",
        kind === "result" && "pl-4 text-muted-foreground",
        kind === "prompt" && "text-muted-foreground",
        kind !== "result" && kind !== "prompt" && "text-foreground",
      )}
    >
      {kind === "call" && <span className="mt-1.5 size-2 shrink-0 bg-link" />}
      {kind === "done" && <span className="mt-1.5 size-2 shrink-0 bg-(--syntax-string)" />}
      {kind === "prompt" && <span className="text-link">&gt;</span>}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

export function AgentLoopVisual() {
  return (
    <figure
      aria-label="A coding agent searches Sniptide for a snippet, reads its files and writes code that follows it."
      className="not-prose my-8 grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-stretch"
    >
      <div
        aria-hidden
        inert
        className="flex flex-col gap-2 rounded-lg border bg-sidebar p-4 select-none"
      >
        <div className="mb-1 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>claude</span>
          <span>~/acme/web</span>
        </div>
        <TermLine kind="prompt">
          Add a confirm dialog to the delete button. Use our usual pattern.
        </TermLine>
        <TermLine kind="call">
          sniptide · search_snippets(
          <span className="text-(--syntax-string)">"confirm dialog"</span>)
        </TermLine>
        <TermLine kind="result">1 match in components</TermLine>
        <TermLine kind="call">
          sniptide · read_snippet(<span className="text-(--syntax-string)">"k7Qe2x"</span>)
        </TermLine>
        <TermLine kind="result">3 files, 84 lines</TermLine>
        <TermLine kind="done">
          Updated src/components/delete-button.tsx with your confirm dialog.
        </TermLine>
      </div>
      <ol className="flex flex-col justify-center gap-4">
        {[
          ["Search", "The agent asks for a pattern by name, tag or language."],
          ["Read", "It opens the files of the paste that matches, as you saved them."],
          [
            "Write",
            "It writes new code that follows your version, and saves back only if you allow it.",
          ],
        ].map(([name, text], index) => (
          <li key={name} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{name}.</span> {text}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}

/** A box in the self-hosting diagram: a name, one line on what it is, and what it listens on. */
function Node({
  icon,
  title,
  detail,
  highlight = false,
}: {
  icon: ReactNode
  title: string
  detail: string
  highlight?: boolean
}) {
  return (
    <li
      className={cn(
        "flex h-full min-w-0 flex-col gap-2 rounded-lg border bg-sidebar p-4",
        highlight && "border-primary",
      )}
    >
      <span aria-hidden className="text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="font-mono text-xs text-muted-foreground">{detail}</span>
    </li>
  )
}

export function SelfHostVisual() {
  const nodes = [
    { icon: <Bot />, title: "Clients", detail: "browser, CLI, agents" },
    { icon: <Lock />, title: "Reverse proxy", detail: "HTTPS on :443" },
    {
      icon: <SquareTerminal />,
      title: "Sniptide",
      detail: "one container, :3000",
      highlight: true,
    },
    { icon: <FileText />, title: "Postgres 17", detail: "your data, :5432" },
  ]
  return (
    <figure
      aria-label="Browsers, the CLI and agents reach your domain over HTTPS. A reverse proxy forwards them to the Sniptide container, which stores everything in Postgres."
      className="not-prose my-8"
    >
      <ol className="grid items-stretch gap-6 md:grid-cols-4 md:gap-8">
        {nodes.map((node, index) => (
          <li key={node.title} className="relative min-w-0">
            {index > 0 && (
              <ArrowRight
                aria-hidden
                className="absolute -top-5 left-1/2 size-4 -translate-x-1/2 rotate-90 text-muted-foreground md:top-1/2 md:-left-5 md:-translate-y-1/2 md:rotate-0"
              />
            )}
            <ul className="h-full">
              <Node {...node} />
            </ul>
          </li>
        ))}
      </ol>
    </figure>
  )
}
