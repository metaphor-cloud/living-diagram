import { executeToolFromJson } from '../../tools/registry'
import { OPENAI_BASE, openaiJson } from '../openai'
import { createEventHandler } from './events'
import { buildSessionConfig, type RealtimeMode } from './session'

/**
 * Browser-side Realtime connection over WebRTC. The user's API key mints a
 * short-lived client secret directly against api.openai.com (no backend),
 * and only that ephemeral secret is used for the actual call.
 */

export type RealtimeCallbacks = {
  onStatus: (status: 'connecting' | 'live' | 'closed') => void
  onUserTranscript: (text: string) => void
  onAssistantText: (text: string) => void
  onError: (message: string) => void
}

type ClientSecret = { value: string; expires_at: number }

async function mintClientSecret(
  apiKey: string,
  mode: RealtimeMode,
  model: string,
): Promise<string> {
  const secret = await openaiJson<ClientSecret>(apiKey, '/realtime/client_secrets', {
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: buildSessionConfig(mode, model),
  })
  return secret.value
}

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null
  private mic: MediaStream | null = null
  private audioEl: HTMLAudioElement | null = null

  constructor(
    private readonly mode: RealtimeMode,
    private readonly callbacks: RealtimeCallbacks,
  ) {}

  async connect(apiKey: string, model: string): Promise<void> {
    this.callbacks.onStatus('connecting')
    try {
      const [secret, mic] = await Promise.all([
        mintClientSecret(apiKey, this.mode, model),
        navigator.mediaDevices.getUserMedia({ audio: true }),
      ])
      this.mic = mic

      const pc = new RTCPeerConnection()
      this.pc = pc

      this.audioEl = new Audio()
      this.audioEl.autoplay = true
      pc.ontrack = (e) => {
        // Meeting mode has no audio output modality; attaching is harmless.
        if (this.audioEl && e.streams[0]) this.audioEl.srcObject = e.streams[0]
      }

      const track = mic.getAudioTracks()[0]
      if (!track) throw new Error('microphone has no audio track')
      pc.addTrack(track, mic)

      const dc = pc.createDataChannel('oai-events')
      const handle = createEventHandler({
        execute: executeToolFromJson,
        send: (event) => {
          if (dc.readyState === 'open') dc.send(JSON.stringify(event))
        },
        onUserTranscript: this.callbacks.onUserTranscript,
        onAssistantText: this.callbacks.onAssistantText,
        onError: this.callbacks.onError,
      })
      dc.onmessage = (e) => handle(typeof e.data === 'string' ? e.data : '')
      dc.onopen = () => this.callbacks.onStatus('live')
      dc.onclose = () => this.callbacks.onStatus('closed')

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.warn('realtime: peer connection lost', { state: pc.connectionState })
          this.callbacks.onError('Connection to OpenAI lost.')
          this.disconnect()
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(`${OPENAI_BASE}/realtime/calls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!sdpRes.ok) {
        throw new Error(`OpenAI rejected the WebRTC offer (${sdpRes.status})`)
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })
    } catch (err) {
      console.error('realtime connect failed', { mode: this.mode, err })
      this.disconnect()
      throw err
    }
  }

  disconnect(): void {
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    if (this.audioEl) {
      this.audioEl.srcObject = null
      this.audioEl = null
    }
    this.pc?.close()
    this.pc = null
    this.callbacks.onStatus('closed')
  }
}
