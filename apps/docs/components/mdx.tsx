import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
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
    Card,
    Cards,
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
