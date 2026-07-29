import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramStore } from '../store/diagram'
import { executeToolFromJson } from '../tools/registry'
import { extractText, runChatTurn, type ResponsesResult } from './chat'

beforeEach(() => {
  useDiagramStore.setState({ nodes: [], edges: [] })
})

function scriptedPost(responses: ResponsesResult[]) {
  const bodies: Record<string, unknown>[] = []
  let i = 0
  const post = vi.fn(async (body: Record<string, unknown>) => {
    bodies.push(body)
    const next = responses[Math.min(i, responses.length - 1)]
    i++
    return next!
  })
  return { post, bodies }
}

const message = (text: string): ResponsesResult['output'][number] => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text }],
})

const call = (id: string, name: string, args: object): ResponsesResult['output'][number] => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args),
})

const params = (over: Partial<Parameters<typeof runChatTurn>[1]> = {}) => ({
  model: 'test-model',
  instructions: 'test',
  tools: [],
  userText: 'hello',
  previousResponseId: null,
  ...over,
})

describe('runChatTurn', () => {
  it('returns assistant text when there are no tool calls', async () => {
    const { post, bodies } = scriptedPost([{ id: 'resp_1', output: [message('Hi there')] }])
    const turn = await runChatTurn({ post, execute: executeToolFromJson }, params())
    expect(turn).toEqual({ responseId: 'resp_1', assistantText: 'Hi there' })
    expect(bodies[0]).toMatchObject({ model: 'test-model', input: [{ role: 'user', content: 'hello' }] })
    expect(bodies[0]).not.toHaveProperty('previous_response_id')
  })

  it('chains previous_response_id across turns', async () => {
    const { post, bodies } = scriptedPost([{ id: 'resp_2', output: [message('ok')] }])
    await runChatTurn({ post, execute: executeToolFromJson }, params({ previousResponseId: 'resp_1' }))
    expect(bodies[0]).toMatchObject({ previous_response_id: 'resp_1' })
  })

  it('executes tool calls against the diagram and feeds outputs back', async () => {
    const { post, bodies } = scriptedPost([
      {
        id: 'resp_1',
        output: [
          call('c1', 'add_node', { label: 'API' }),
          call('c2', 'add_node', { label: 'DB' }),
        ],
      },
      { id: 'resp_2', output: [call('c3', 'add_edge', { source: 'api', target: 'db' })] },
      { id: 'resp_3', output: [message('Built it.')] },
    ])
    const events: string[] = []
    const turn = await runChatTurn(
      { post, execute: executeToolFromJson },
      params({ onEvent: (e) => events.push(`${e.name}:${e.result.ok}`) }),
    )

    expect(turn.assistantText).toBe('Built it.')
    expect(useDiagramStore.getState().nodes.map((n) => n.id).sort()).toEqual(['api', 'db'])
    expect(useDiagramStore.getState().edges).toHaveLength(1)
    expect(events).toEqual(['add_node:true', 'add_node:true', 'add_edge:true'])

    // second request must return the two call outputs, chained on resp_1
    expect(bodies[1]).toMatchObject({ previous_response_id: 'resp_1' })
    const outputs = bodies[1]!.input as { type: string; call_id: string; output: string }[]
    expect(outputs.map((o) => o.call_id)).toEqual(['c1', 'c2'])
    expect(JSON.parse(outputs[0]!.output)).toMatchObject({ id: 'api' })
  })

  it('feeds tool errors back to the model instead of crashing', async () => {
    const { post, bodies } = scriptedPost([
      { id: 'r1', output: [call('c1', 'add_edge', { source: 'ghost', target: 'nope' })] },
      { id: 'r2', output: [message('That failed, sorry.')] },
    ])
    const turn = await runChatTurn({ post, execute: executeToolFromJson }, params())
    expect(turn.assistantText).toBe('That failed, sorry.')
    const outputs = bodies[1]!.input as { output: string }[]
    expect(JSON.parse(outputs[0]!.output).error).toContain('ghost')
  })

  it('stops after the max number of tool rounds', async () => {
    const { post } = scriptedPost([
      { id: 'loop', output: [call('c', 'describe_diagram', {})] },
    ])
    const turn = await runChatTurn({ post, execute: executeToolFromJson }, params())
    expect(post).toHaveBeenCalledTimes(16)
    expect(turn.assistantText).toContain('too many tool calls')
  })
})

describe('extractText', () => {
  it('joins multiple message items and ignores non-text content', () => {
    expect(
      extractText([
        message('one'),
        { type: 'reasoning' },
        { type: 'message', role: 'assistant', content: [{ type: 'refusal' }] },
        message('two'),
      ]),
    ).toBe('one\ntwo')
  })
})
