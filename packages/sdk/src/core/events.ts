export type EventMap = Record<string, unknown>

export type EventHandler<Payload> = (payload: Payload) => void

export interface EventBus<Events extends EventMap> {
  on<Name extends keyof Events & string>(name: Name, handler: EventHandler<Events[Name]>): () => void
  emit<Name extends keyof Events & string>(name: Name, payload: Events[Name]): void
  clear(): void
}

export const createEventBus = <Events extends EventMap>(): EventBus<Events> => {
  const handlers = new Map<keyof Events & string, Set<EventHandler<Events[keyof Events & string]>>>()

  return {
    on(name, handler) {
      const set = handlers.get(name) ?? new Set()
      set.add(handler as EventHandler<Events[keyof Events & string]>)
      handlers.set(name, set)
      return () => set.delete(handler as EventHandler<Events[keyof Events & string]>)
    },
    emit(name, payload) {
      for (const handler of handlers.get(name) ?? []) handler(payload)
    },
    clear() {
      handlers.clear()
    },
  }
}
