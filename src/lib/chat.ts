import type { ToolResult } from '../tools/registry'

/**
 * Tool-calling loop over the OpenAI Responses API, kept pure of React and
 * fetch so it can be tested with fakes. Conversation state is chained
 * server-side via previous_response_id; the loop feeds function_call
 * outputs back until the model produces a plain message.
 */

export type ResponseOutputItem = {
  type: string
  role?: string
  id?: string
  call_id?: string
  name?: string
  arguments?: string
  content?: { type: string; text?: string }[]
}

export type ResponsesResult = {
  id: string
  output: ResponseOutputItem[]
}

export type ChatTurnEvent = {
  kind: 'tool_call'
  name: string
  args: string
  result: ToolResult
}

export type ChatDeps = {
  post: (body: Record<string, unknown>) => Promise<ResponsesResult>
  execute: (name: string, argsJson: string) => ToolResult
}

const MAX_TOOL_ROUNDS = 16

export function extractText(output: ResponseOutputItem[]): string {
  return output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim()
}

export async function runChatTurn(
  deps: ChatDeps,
  params: {
    model: string
    instructions: string
    tools: unknown[]
    userText: string
    previousResponseId: string | null
    onEvent?: (event: ChatTurnEvent) => void
  },
): Promise<{ responseId: string; assistantText: string }> {
  let input: unknown[] = [{ role: 'user', content: params.userText }]
  let previousId = params.previousResponseId

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await deps.post({
      model: params.model,
      instructions: params.instructions,
      tools: params.tools,
      input,
      ...(previousId ? { previous_response_id: previousId } : {}),
    })
    previousId = response.id

    const calls = response.output.filter((item) => item.type === 'function_call')
    if (calls.length === 0) {
      return { responseId: response.id, assistantText: extractText(response.output) }
    }

    input = calls.map((call) => {
      const name = call.name ?? ''
      const args = call.arguments ?? ''
      const result = deps.execute(name, args)
      params.onEvent?.({ kind: 'tool_call', name, args, result })
      return {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result.ok ? result.result : { error: result.error }),
      }
    })
  }

  return {
    responseId: previousId ?? '',
    assistantText: 'I stopped after too many tool calls in a row - the diagram may be partially updated.',
  }
}

export const CHAT_INSTRUCTIONS = `You are the assistant inside Living Diagram, a conversational diagramming tool. The user sees a React Flow canvas; you read and modify it exclusively through the provided tools.

Rules:
- Before answering questions about the diagram, or editing anything you did not create earlier in this conversation, call describe_diagram (or find/get_node) to see the current state. Node ids are readable slugs.
- Make edits by calling tools, never by describing JSON. Batch naturally: create the nodes, then the edges.
- Use the visual vocabulary: diamond = decision, ellipse = start/end, cylinder = database/storage, hexagon = service/process, parallelogram = input/output, note = sticky annotation, text = borderless label (pair with font_size 18-24 for titles), groups for zones/tiers, colors to distinguish categories, edge labels for relationships, animated edges for active/streaming flows.
- clear_diagram only when the user clearly asks to start over.
- Answer in concise plain prose. Mention what you changed; don't enumerate every tool call.

Layout - you cannot see the rendered canvas, so positions ARE your eyes:
- Coordinates are canvas pixels: x grows rightward, y grows downward. describe_diagram returns every node's absolute x/y/width/height; that is exactly the geometry the human sees.
- auto_layout is a mechanical layered (dagre) pass, not a semantic one. It moves everything, including group interiors, and resizes groups to fit. Use it for pipelines, flowcharts, trees and call graphs - then read the positions back and fix anything awkward.
- For spatial topologies (network zones, parallel subnet lanes, side-by-side environments, region maps), do NOT rely on whole-diagram auto_layout: place the zone groups deliberately with update_node x/y and explicit width/height, use auto_layout with container_id to tidy each group's interior, then align_nodes/distribute_nodes to line up corresponding nodes across lanes and keep edges short.
- After any bulk edit or layout, sanity-check with describe_diagram: look for overlapping boxes, a group that grew far taller than wide, or long edges spanning unrelated regions - and adjust.`
