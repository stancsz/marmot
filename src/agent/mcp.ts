import { ToolDef } from './types'

/**
 * MCP client (Streamable HTTP transport) — Marmot as a Model Context
 * Protocol client. Phones can't spawn stdio servers, but they can speak
 * JSON-RPC to HTTP MCP servers on the LAN or the internet. The transport
 * is injected, so the whole protocol layer is unit-tested.
 *
 * v1 scope: initialize → tools/list → tools/call, with servers that reply
 * either as application/json or as a complete SSE body. Live streaming
 * subscriptions and resources/prompts are follow-ups.
 */

export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>
    required?: string[]
  }
}

export interface McpTransportResult {
  status: number
  contentType: string
  bodyText: string
  sessionId?: string
}

export type McpTransport = (bodyJson: string, sessionId?: string) => Promise<McpTransportResult>

/** find the JSON-RPC response with the given id in a JSON or SSE body */
export function parseMcpBody(bodyText: string, contentType: string, id: number): any | null {
  if (contentType.includes('text/event-stream')) {
    for (const line of bodyText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      try {
        const msg = JSON.parse(trimmed.slice(5).trim())
        if (msg && msg.id === id) return msg
      } catch {
        // non-JSON event data — skip
      }
    }
    return null
  }
  try {
    const msg = JSON.parse(bodyText)
    if (Array.isArray(msg)) return msg.find((m) => m?.id === id) ?? null
    return msg && msg.id === id ? msg : null
  } catch {
    return null
  }
}

export class McpClient {
  private sessionId?: string
  private nextId = 0

  constructor(private transport: McpTransport) {}

  private async rpc(method: string, params: Record<string, unknown>): Promise<any> {
    const id = ++this.nextId
    const result = await this.transport(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      this.sessionId
    )
    if (result.sessionId) this.sessionId = result.sessionId
    if (result.status >= 400) throw new Error(`MCP server error (HTTP ${result.status})`)
    const msg = parseMcpBody(result.bodyText, result.contentType, id)
    if (!msg) throw new Error('MCP server sent no matching response')
    if (msg.error) throw new Error(msg.error.message ?? 'MCP error')
    return msg.result
  }

  private async notify(method: string): Promise<void> {
    await this.transport(JSON.stringify({ jsonrpc: '2.0', method }), this.sessionId).catch(() => {})
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'marmot', version: '0.1.0' },
    })
    await this.notify('notifications/initialized')
  }

  async listTools(): Promise<McpToolDef[]> {
    const result = await this.rpc('tools/list', {})
    return Array.isArray(result?.tools) ? result.tools : []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.rpc('tools/call', { name, arguments: args })
    const content = Array.isArray(result?.content) ? result.content : []
    const text = content
      .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('\n')
    if (result?.isError) return `Error: ${text || 'tool failed'}`
    return text || JSON.stringify(result ?? {})
  }
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'server'
  )
}

/** map a server's MCP tools into the agent's tool registry, namespaced */
export function mcpAgentTools(client: McpClient, tools: McpToolDef[], serverLabel: string): ToolDef[] {
  const server = slug(serverLabel)
  return tools.map((tool) => {
    const args: Record<string, string> = {}
    const props = tool.inputSchema?.properties ?? {}
    const required = new Set(tool.inputSchema?.required ?? [])
    for (const [key, schema] of Object.entries(props)) {
      const parts = [schema.type ?? 'any']
      if (!required.has(key)) parts.push('optional')
      if (schema.description) parts.push(schema.description)
      args[key] = parts.join(' — ')
    }
    return {
      name: `mcp_${server}_${slug(tool.name)}`,
      description: `[${serverLabel}] ${tool.description ?? tool.name}`,
      args,
      async run(callArgs) {
        try {
          return await client.callTool(tool.name, callArgs)
        } catch (e: any) {
          return `Error: ${e?.message ?? 'MCP call failed'}`
        }
      },
    }
  })
}
