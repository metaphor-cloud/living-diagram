import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '../../store/diagram'
import { executeToolFromJson } from '../../tools/registry'
import { createEventHandler } from './events'
import { buildSessionConfig, MEETING_INSTRUCTIONS } from './session'

beforeEach(() => {
  useDiagramStore.setState({ nodes: [], edges: [] })
})

function harness() {
  const sent: Record<string, unknown>[] = []
  const userLines: string[] = []
  const assistantLines: string[] = []
  const errors: string[] = []
  const handle = createEventHandler({
    execute: executeToolFromJson,
    send: (e) => sent.push(e),
    onUserTranscript: (t) => userLines.push(t),
    onAssistantText: (t) => assistantLines.push(t),
    onError: (m) => errors.push(m),
  })
  return { handle, sent, userLines, assistantLines, errors }
}

describe('realtime event handler', () => {
  it('executes function calls and returns output plus response.create', () => {
    const h = harness()
    h.handle(
      JSON.stringify({
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'add_node',
          arguments: '{"label": "Router"}',
        },
      }),
    )

    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toEqual(['router'])
    expect(h.sent).toHaveLength(2)
    expect(h.sent[0]).toMatchObject({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call_1' },
    })
    expect(JSON.parse((h.sent[0] as any).item.output)).toEqual({ id: 'router' })
    expect(h.sent[1]).toEqual({ type: 'response.create' })
  })

  it('returns tool errors to the model rather than dropping them', () => {
    const h = harness()
    h.handle(
      JSON.stringify({
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'c9', name: 'delete_node', arguments: '{"id":"ghost"}' },
      }),
    )
    expect(JSON.parse((h.sent[0] as any).item.output).error).toContain('ghost')
    expect(h.sent[1]).toEqual({ type: 'response.create' })
  })

  it('ignores non-function output items', () => {
    const h = harness()
    h.handle(JSON.stringify({ type: 'response.output_item.done', item: { type: 'message' } }))
    expect(h.sent).toHaveLength(0)
  })

  it('routes transcripts and text to the right callbacks', () => {
    const h = harness()
    h.handle(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'add a database',
      }),
    )
    h.handle(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Done!' }))
    h.handle(JSON.stringify({ type: 'response.output_text.done', text: 'noop' }))
    expect(h.userLines).toEqual(['add a database'])
    expect(h.assistantLines).toEqual(['Done!', 'noop'])
  })

  it('surfaces server errors and survives malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = harness()
    h.handle('{not json')
    h.handle(JSON.stringify({ type: 'error', error: { message: 'rate limited' } }))
    expect(h.errors).toEqual(['rate limited'])
    expect(h.sent).toHaveLength(0)
    warn.mockRestore()
    error.mockRestore()
  })
})

describe('buildSessionConfig', () => {
  it('voice mode is a GA realtime session with tools and audio in/out', () => {
    const config = buildSessionConfig('voice', 'gpt-realtime-2.1') as any
    expect(config.type).toBe('realtime')
    expect(config.model).toBe('gpt-realtime-2.1')
    expect(config.tools.length).toBeGreaterThan(10)
    expect(config.audio.input.turn_detection.type).toBe('server_vad')
    expect(config.audio.output.voice).toBe('marin')
    expect(config.output_modalities).toBeUndefined()
  })

  it('meeting mode is text-only, silent-scribe instructions', () => {
    const config = buildSessionConfig('meeting', 'gpt-realtime-2.1') as any
    expect(config.output_modalities).toEqual(['text'])
    expect(config.instructions).toBe(MEETING_INSTRUCTIONS)
    expect(config.instructions).toContain('noop')
    expect(config.tools.length).toBeGreaterThan(10)
  })
})
