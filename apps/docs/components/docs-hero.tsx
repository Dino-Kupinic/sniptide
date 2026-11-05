import { buttonVariants } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import Link from "fumadocs-core/link"
import { PixelHorizon } from "@/components/pixel-horizon"

// The overview's opening, in the marketing hero's arrangement: the pixel horizon behind a flat
// panel that holds the page title, its description and the two first steps.
export function DocsHero({ title, description }: { title: string; description?: string }) {
  return (
    <section className="not-prose relative mb-10 flex h-112 flex-col justify-end overflow-clip rounded-lg border md:block md:h-104">
      <PixelHorizon className="absolute bottom-0 left-[calc((100%-900px)*0.8)] h-full w-[900px] md:inset-0 md:left-0 md:w-full" />
      <div className="relative m-3 flex flex-col gap-4 bg-background p-6 md:absolute md:top-6 md:left-6 md:m-0 md:w-[30rem] md:max-w-[calc(100%-3rem)] md:p-8">
        <h1 className="font-heading text-4xl leading-none font-bold tracking-[-0.03em] text-foreground md:text-5xl">
          {title}
        </h1>
        {description && <p className="text-base leading-6 text-muted-foreground">{description}</p>}
        <div className="flex flex-wrap gap-2.5 pt-1">
          <Link
            href="/getting-started/first-paste"
            className={cn(buttonVariants({ size: "lg" }), "gap-2.5 no-underline")}
          >
            <span className="size-2 bg-white" />
            Make a paste
          </Link>
          <Link
            href="/self-hosting"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "no-underline")}
          >
            Self-host
          </Link>
        </div>
      </div>
    </section>
  )
}
