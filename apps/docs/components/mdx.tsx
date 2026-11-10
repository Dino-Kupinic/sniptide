import { Kbd } from "@sniptide/ui/components/kbd"
import { Step, Steps } from "fumadocs-ui/components/steps"
import defaultMdxComponents from "fumadocs-ui/mdx"
import {
  BookOpen,
  Bot,
  ChartColumn,
  Download,
  FileCode,
  Flame,
  FolderTree,
  GitFork,
  History,
  KeyRound,
  LayoutDashboard,
  Link2,
  Rocket,
  Server,
  Share2,
  Terminal,
} from "lucide-react"
import type { MDXComponents } from "mdx/types"
import { Card, Cards } from "@/components/cards"
import { FeatureCard, FeatureCards } from "@/components/feature-cards"
import { Callout, File, Files, Folder, Param, Params } from "@/components/prose"
import { CodeBlockTabs, Tab, Tabs } from "@/components/tabs"
import {
  AgentLoopVisual,
  BurnAfterReadVisual,
  FirstPasteVisual,
  HowItFitsVisual,
  SelfHostVisual,
} from "@/components/visuals"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Callout,
    Card,
    CodeBlockTabs,
    FeatureCard,
    FeatureCards,
    Cards,
    File,
    Files,
    Folder,
    Kbd,
    Param,
    Params,
    AgentLoopVisual,
    BurnAfterReadVisual,
    SelfHostVisual,
    FirstPasteVisual,
    HowItFitsVisual,
    BookOpenIcon: BookOpen,
    BotIcon: Bot,
    ChartColumnIcon: ChartColumn,
    DownloadIcon: Download,
    FileCodeIcon: FileCode,
    FlameIcon: Flame,
    FolderTreeIcon: FolderTree,
    GitForkIcon: GitFork,
    HistoryIcon: History,
    KeyRoundIcon: KeyRound,
    LayoutDashboardIcon: LayoutDashboard,
    Link2Icon: Link2,
    RocketIcon: Rocket,
    ServerIcon: Server,
    Share2Icon: Share2,
    TerminalIcon: Terminal,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
