import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from './events.js'

describe('event bus', () => {
  it('emits typed events and supports unsubscribe', () => {
    const bus = createEventBus<{ 'agent:detected': { id: string } }>()
    const handler = vi.fn()
    const off = bus.on('agent:detected', handler)
    bus.emit('agent:detected', { id: 'a' })
    off()
    bus.emit('agent:detected', { id: 'b' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
