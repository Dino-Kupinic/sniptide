import type { NotificationFeed } from "./types"

export class NotificationReader {
  private generation = 0
  private mutations = 0
  private pending: { generation: number; work: Promise<void> } | null = null

  constructor(
    private readonly options: {
      read(): Promise<NotificationFeed>
      publish(feed: NotificationFeed): void
      failed(): void
    },
  ) {}

  invalidate() {
    this.generation++
  }

  load(): Promise<void> {
    if (this.mutations) return Promise.resolve()
    const generation = this.generation
    if (this.pending?.generation === generation) return this.pending.work
    const work = Promise.resolve()
      .then(() => this.options.read())
      .then(
        (feed) => {
          if (generation === this.generation) this.options.publish(feed)
        },
        () => {
          if (generation === this.generation) this.options.failed()
        },
      )
      .finally(() => {
        if (this.pending?.work === work) this.pending = null
      })
    this.pending = { generation, work }
    return work
  }

  async mutate(change: () => Promise<void>) {
    this.mutations++
    this.invalidate()
    try {
      await change()
    } finally {
      this.mutations--
      this.invalidate()
      await this.load()
    }
  }
}
