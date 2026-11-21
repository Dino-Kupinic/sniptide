import { Action, Broadcast, type BroadcastProps, Cover, H2, List, P } from "@/lib/email/broadcast"

export const subject = "What's new in Sniptide: phone screens, templates and secret audit logs"
export const preview =
  "Sniptide now feels native on your phone, starts pastes from templates and logs who read a secret."

export default function November2026Update(props: BroadcastProps) {
  const app = (path: string) => new URL(path, props.appUrl ?? "https://app.sniptide.com").href
  return (
    <Broadcast
      {...props}
      subject={subject}
      preview={preview}
      title="Sniptide product updates"
      date="November 21, 2026"
    >
      <Cover
        appUrl={props.appUrl}
        label="November 2026"
        title="Product updates"
        image={{
          src: app("/email/broadcasts/2026-11-editor.png"),
          alt: "The Sniptide app with the sidebar and the new paste editor",
        }}
      />
      <P>
        This month Sniptide got a proper phone layout, a faster way to start a paste and an audit
        log for secrets. Here is what changed and how to try it.
      </P>
      <H2>Built for your phone</H2>
      <P>
        On phones and small tablets the app now has a tab bar, large titles and grouped lists, so
        reading and sharing a paste on your phone takes two taps at most.
      </P>
      <H2>Start from a template</H2>
      <P>
        The dashboard, the tour and the new templates page start a paste from a ready-made file,
        such as a CLAUDE.md.
      </P>
      <H2>Secrets you can account for</H2>
      <List
        items={["Choose who can open each secret.", "See who read it in the secret's audit log."]}
      />
      <Action href={app("/templates")}>Browse templates</Action>
      <P>
        Reply to this email if something doesn't work the way you expect. It reaches me directly.
      </P>
      <P>Dino</P>
    </Broadcast>
  )
}

November2026Update.PreviewProps = {
  // The logo and fonts load from a running app (bun dev).
  appUrl: "http://localhost:3000",
  operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien\nAustria" },
} satisfies BroadcastProps
