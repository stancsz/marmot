import AsyncStorage from '@react-native-async-storage/async-storage'
import { McpClient, McpTransport, ToolDef, mcpAgentTools } from '../agent'

const MCP_KEY = 'marmot.mcpServers.v1'
const CACHE_TTL_MS = 5 * 60 * 1000

export interface McpServerEntry {
  id: string
  name: string
  url: string
  enabled: boolean
}

export async function loadMcpServers(): Promise<McpServerEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MCP_KEY)
    return raw ? (JSON.parse(raw) as McpServerEntry[]) : []
  } catch {
    return []
  }
}

async function save(servers: McpServerEntry[]): Promise<void> {
  await AsyncStorage.setItem(MCP_KEY, JSON.stringify(servers))
  toolCache.clear() // config changed — refetch tool lists
}

export async function addMcpServer(name: string, url: string): Promise<McpServerEntry[]> {
  const cleanName = name.trim()
  const cleanUrl = url.trim()
  if (!cleanName) throw new Error('Give the server a name.')
  if (!/^https?:\/\/.+/i.test(cleanUrl)) throw new Error('Enter an http(s):// server URL.')
  const servers = await loadMcpServers()
  const entry: McpServerEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    url: cleanUrl,
    enabled: true,
  }
  const next = [...servers, entry]
  await save(next)
  return next
}

export async function setMcpServerEnabled(id: string, enabled: boolean): Promise<McpServerEntry[]> {
  const next = (await loadMcpServers()).map((s) => (s.id === id ? { ...s, enabled } : s))
  await save(next)
  return next
}

export async function removeMcpServer(id: string): Promise<McpServerEntry[]> {
  const next = (await loadMcpServers()).filter((s) => s.id !== id)
  await save(next)
  return next
}

function httpTransport(url: string): McpTransport {
  return async (bodyJson, sessionId) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: bodyJson,
    })
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      bodyText: await res.text(),
      sessionId: res.headers.get('mcp-session-id') ?? undefined,
    }
  }
}

const toolCache = new Map<string, { tools: ToolDef[]; at: number }>()

/**
 * Connect to every enabled MCP server and return its tools, namespaced for
 * the agent registry. Per-server failures are skipped — a dead server never
 * blocks a run. Results cached briefly to avoid a handshake per message.
 */
export async function loadMcpAgentTools(): Promise<ToolDef[]> {
  const servers = (await loadMcpServers()).filter((s) => s.enabled)
  const all: ToolDef[] = []
  for (const server of servers) {
    const cached = toolCache.get(server.url)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      all.push(...cached.tools)
      continue
    }
    try {
      const client = new McpClient(httpTransport(server.url))
      await client.initialize()
      const tools = mcpAgentTools(client, await client.listTools(), server.name)
      toolCache.set(server.url, { tools, at: Date.now() })
      all.push(...tools)
    } catch {
      // unreachable/misbehaving server — skip this run
    }
  }
  return all
}
