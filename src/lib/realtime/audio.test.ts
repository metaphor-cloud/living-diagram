import { describe, expect, it, vi } from 'vitest'
import { acquireAudioSource, type AudioContextLike, type AudioDeps } from './audio'

type FakeTrack = {
  kind: string
  stopped: boolean
  stop: () => void
  listeners: Map<string, () => void>
  addEventListener: (name: string, fn: () => void) => void
  fireEnded: () => void
}

function fakeTrack(kind: 'audio' | 'video'): FakeTrack {
  const track: FakeTrack = {
    kind,
    stopped: false,
    listeners: new Map(),
    stop() {
      track.stopped = true
    },
    addEventListener(name, fn) {
      track.listeners.set(name, fn)
    },
    fireEnded() {
      track.listeners.get('ended')?.()
    },
  }
  return track
}

function fakeStream(tracks: FakeTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  } as unknown as MediaStream
}

function fakeContext() {
  const mixTrack = fakeTrack('audio')
  const connected: unknown[] = []
  let closed = false
  const context: AudioContextLike = {
    createMediaStreamSource: (stream) => ({
      connect: (dest) => connected.push([stream, dest]),
    }),
    createMediaStreamDestination: () => ({ stream: fakeStream([mixTrack]) }),
    close: async () => {
      closed = true
    },
  }
  return { context, mixTrack, connected, isClosed: () => closed }
}

function deps(over: Partial<AudioDeps> = {}): AudioDeps {
  return {
    getUserMedia: vi.fn(async () => fakeStream([fakeTrack('audio')])),
    getDisplayMedia: vi.fn(async () => fakeStream([fakeTrack('video'), fakeTrack('audio')])),
    createAudioContext: () => fakeContext().context,
    ...over,
  }
}

// The global MediaStream constructor is absent in node; the mix path wraps
// display audio tracks in one, so provide a minimal stand-in.
vi.stubGlobal(
  'MediaStream',
  class {
    constructor(private tracks: FakeTrack[] = []) {}
    getTracks() {
      return this.tracks
    }
    getAudioTracks() {
      return this.tracks.filter((t) => t.kind === 'audio')
    }
  },
)

describe('acquireAudioSource', () => {
  it('microphone: returns the mic track and stop() stops it', async () => {
    const micTrack = fakeTrack('audio')
    const d = deps({ getUserMedia: vi.fn(async () => fakeStream([micTrack])) })
    const handle = await acquireAudioSource('microphone', undefined, d)
    expect(handle.track).toBe(micTrack)
    expect(handle.label).toBe('microphone')
    handle.stop()
    expect(micTrack.stopped).toBe(true)
  })

  it('tab: requests display media with audio and returns the tab audio track', async () => {
    const video = fakeTrack('video')
    const audio = fakeTrack('audio')
    const getDisplayMedia = vi.fn(async () => fakeStream([video, audio]))
    const handle = await acquireAudioSource('tab', undefined, deps({ getDisplayMedia }))
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true })
    expect(handle.track).toBe(audio)
    handle.stop()
    // the unused video track is kept alive during capture but released on stop
    expect(video.stopped).toBe(true)
    expect(audio.stopped).toBe(true)
  })

  it('tab: fails clearly when the user did not share tab audio', async () => {
    const video = fakeTrack('video')
    const d = deps({ getDisplayMedia: vi.fn(async () => fakeStream([video])) })
    await expect(acquireAudioSource('tab', undefined, d)).rejects.toThrow('Also share tab audio')
    expect(video.stopped).toBe(true)
  })

  it('tab: fails clearly on browsers without getDisplayMedia', async () => {
    await expect(
      acquireAudioSource('tab', undefined, deps({ getDisplayMedia: null })),
    ).rejects.toThrow('cannot capture tab audio')
  })

  it('mix: connects mic and tab audio into one destination track', async () => {
    const mic = fakeTrack('audio')
    const tabAudio = fakeTrack('audio')
    const ctx = fakeContext()
    const d = deps({
      getUserMedia: vi.fn(async () => fakeStream([mic])),
      getDisplayMedia: vi.fn(async () => fakeStream([fakeTrack('video'), tabAudio])),
      createAudioContext: () => ctx.context,
    })
    const handle = await acquireAudioSource('mix', undefined, d)
    expect(handle.track).toBe(ctx.mixTrack)
    expect(handle.label).toBe('mic + tab audio')
    expect(ctx.connected).toHaveLength(2)
    handle.stop()
    expect(mic.stopped).toBe(true)
    expect(tabAudio.stopped).toBe(true)
    expect(ctx.isClosed()).toBe(true)
  })

  it('mix: releases the mic if tab capture then fails', async () => {
    const mic = fakeTrack('audio')
    const d = deps({
      getUserMedia: vi.fn(async () => fakeStream([mic])),
      getDisplayMedia: vi.fn(async () => fakeStream([fakeTrack('video')])),
    })
    await expect(acquireAudioSource('mix', undefined, d)).rejects.toThrow('Also share tab audio')
    expect(mic.stopped).toBe(true)
  })

  it('fires onEnded when an underlying input track ends', async () => {
    const tabAudio = fakeTrack('audio')
    const onEnded = vi.fn()
    const d = deps({ getDisplayMedia: vi.fn(async () => fakeStream([fakeTrack('video'), tabAudio])) })
    await acquireAudioSource('tab', onEnded, d)
    tabAudio.fireEnded()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
