import type { ToolResult } from '../../tools/registry'

/**
 * Pure bridge between Realtime server events (JSON over the "oai-events"
 * data channel) and the diagram tool registry. Kept free of WebRTC so it
 * is unit-testable; the client wires it to a live data channel.
 */

export type RealtimeEventDeps = {
  execute: (name: string, argsJson: string) => ToolResult
  send: (event: Record<string, unknown>) => void
  onUserTranscript?: (text: string) => void
  onAssistantText?: (text: string) => void
  onError?: (message: string) => void
}

type ServerEvent = {
  type?: string
  transcript?: string
  text?: string
  error?: { message?: string; code?: string }
  item?: {
    type?: string
    call_id?: string
    name?: string
    arguments?: string
  }
}

export function createEventHandler(deps: RealtimeEventDeps): (raw: string) => void {
  return (raw) => {
    let event: ServerEvent
    try {
      event = JSON.parse(raw) as ServerEvent
    } catch {
      console.warn('realtime: dropping malformed event', { raw: raw.slice(0, 200) })
      return
    }

    switch (event.type) {
      case 'response.output_item.done': {
        const item = event.item
        if (item?.type === 'function_call' && item.name && item.call_id) {
          const result = deps.execute(item.name, item.arguments ?? '')
          deps.send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify(result.ok ? result.result : { error: result.error }),
            },
          })
          // Let the model see the tool result and continue its turn.
          deps.send({ type: 'response.create' })
        }
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        if (event.transcript) deps.onUserTranscript?.(event.transcript)
        break
      }

      case 'response.output_audio_transcript.done': {
        if (event.transcript) deps.onAssistantText?.(event.transcript)
        break
      }

      case 'response.output_text.done': {
        if (event.text) deps.onAssistantText?.(event.text)
        break
      }

      case 'error': {
        const message = event.error?.message ?? 'unknown realtime error'
        console.error('realtime server error', { error: event.error })
        deps.onError?.(message)
        break
      }

      default:
        break
    }
  }
}
