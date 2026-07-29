/**
 * Audio capture for realtime sessions. Meeting mode can listen to more
 * than the microphone: browsers expose no "speaker output" input, but a
 * Chromium tab share (getDisplayMedia with audio) captures the meeting
 * tab's sound cleanly, and the Web Audio API can mix it with the mic.
 *
 * Note on echo cancellation: the mic keeps its default echo cancellation
 * ON even in the mix. EC subtracts speaker output from the mic signal, so
 * without tab capture the far end of a call is mostly lost (why mic-only
 * fails for remote meetings) - but in the mix the far end arrives cleanly
 * via the tab track, and EC stops it arriving a second time acoustically.
 */

export const AUDIO_SOURCES = ['microphone', 'tab', 'mix'] as const
export type AudioSourceKind = (typeof AUDIO_SOURCES)[number]

export const AUDIO_SOURCE_LABELS: Record<AudioSourceKind, string> = {
  microphone: 'microphone',
  tab: 'tab audio',
  mix: 'mic + tab audio',
}

export type AudioSourceHandle = {
  track: MediaStreamTrack
  label: string
  stop: () => void
}

/** Minimal surface of AudioContext used here, injectable for tests. */
export interface AudioContextLike {
  createMediaStreamSource(stream: MediaStream): { connect(destination: unknown): unknown }
  createMediaStreamDestination(): { stream: MediaStream }
  close(): Promise<void>
}

export type AudioDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  getDisplayMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null
  createAudioContext: () => AudioContextLike
}

function browserDeps(): AudioDeps {
  const md = navigator.mediaDevices
  return {
    getUserMedia: (c) => md.getUserMedia(c),
    getDisplayMedia: typeof md.getDisplayMedia === 'function' ? (c) => md.getDisplayMedia(c) : null,
    createAudioContext: () => new AudioContext(),
  }
}

function stopAll(streams: (MediaStream | null)[]) {
  for (const stream of streams) stream?.getTracks().forEach((t) => t.stop())
}

async function captureTab(deps: AudioDeps): Promise<MediaStream> {
  if (!deps.getDisplayMedia) {
    throw new Error('This browser cannot capture tab audio - use Chrome or Edge, or the microphone source.')
  }
  // Chromium requires video in the request; the video track is unused but
  // kept alive, since ending it can end the capture session.
  const display = await deps.getDisplayMedia({ video: true, audio: true })
  if (display.getAudioTracks().length === 0) {
    stopAll([display])
    throw new Error('No tab audio was shared. Pick the meeting tab and tick "Also share tab audio".')
  }
  return display
}

/**
 * Acquire the requested audio source. `onEnded` fires if an underlying
 * input track ends outside our control (e.g. the user stops sharing the
 * tab from the browser UI).
 */
export async function acquireAudioSource(
  kind: AudioSourceKind,
  onEnded?: () => void,
  deps: AudioDeps = browserDeps(),
): Promise<AudioSourceHandle> {
  const label = AUDIO_SOURCE_LABELS[kind]

  if (kind === 'microphone') {
    const mic = await deps.getUserMedia({ audio: true })
    const track = mic.getAudioTracks()[0]
    if (!track) {
      stopAll([mic])
      throw new Error('microphone has no audio track')
    }
    if (onEnded) track.addEventListener('ended', onEnded)
    return { track, label, stop: () => stopAll([mic]) }
  }

  if (kind === 'tab') {
    const display = await captureTab(deps)
    const track = display.getAudioTracks()[0]!
    if (onEnded) track.addEventListener('ended', onEnded)
    return { track, label, stop: () => stopAll([display]) }
  }

  // mix: microphone + tab audio through a Web Audio destination
  let mic: MediaStream | null = null
  let display: MediaStream | null = null
  try {
    mic = await deps.getUserMedia({ audio: true })
    display = await captureTab(deps)
  } catch (err) {
    stopAll([mic, display])
    throw err
  }

  const context = deps.createAudioContext()
  const destination = context.createMediaStreamDestination()
  context.createMediaStreamSource(mic).connect(destination)
  context.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(destination)

  const track = destination.stream.getAudioTracks()[0]
  if (!track) {
    stopAll([mic, display])
    void context.close()
    throw new Error('audio mixer produced no track')
  }
  if (onEnded) {
    for (const input of [...mic.getAudioTracks(), ...display.getAudioTracks()]) {
      input.addEventListener('ended', onEnded)
    }
  }
  return {
    track,
    label,
    stop: () => {
      stopAll([mic, display])
      context.close().catch(() => {})
    },
  }
}
