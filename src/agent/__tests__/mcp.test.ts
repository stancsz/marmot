import { McpClient, McpTransportResult, mcpAgentTools, parseMcpBody } from '../mcp'

describe('parseMcpBody', () => {
  it('parses a plain JSON response by id', () => {
    expect(parseMcpBody('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', 'application/json', 1))
      .toMatchObject({ result: { ok: true } })
    expect(parseMcpBody('{"jsonrpc":"2.0","id":2,"result":{}}', 'application/json', 1)).toBeNull()
  })
  it('finds the matching event in a complete SSE body', () => {
    const sse = [
      'event: message',
      'data: {"jsonrpc":"2.0","method":"notifications/progress"}',
      '',
      'data: {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}',
      '',
    ].join('\n')
    expect(parseMcpBody(sse, 'text/event-stream', 3)).toMatchObject({ result: { tools: [] } })
  })
  it('returns null for garbage', () => {
    expect(parseMcpBody('not json', 'application/json', 1)).toBeNull()
  })
})

function scriptedTransport(script: (body: any, sessionId?: string) => McpTransportResult) {
  const calls: { body: any; sessionId?: string }[] = []
  const transport = async (bodyJson: string, sessionId?: string) => {
    const body = JSON.parse(bodyJson)
    calls.push({ body, sessionId })
    return script(body, sessionId)
  }
  return { transport, calls }
}

describe('McpClient', () => {
  it('initializes, adopts the session id, and lists tools with it', async () => {
    const { transport, calls } = scriptedTransport((body) => {
      if (body.method === 'initialize') {
        return {
          status: 200,
          contentType: 'application/json',
          bodyText: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { capabilities: {} } }),
          sessionId: 'sess-42',
        }
      }
      if (body.method === 'notifications/initialized') {
        return { status: 202, contentType: '', bodyText: '' }
      }
      return {
        status: 200,
        contentType: 'application/json',
        bodyText: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'get_weather', description: 'Weather lookup' }] },
        }),
      }
    })
    const client = new McpClient(transport)
    await client.initialize()
    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    // the session id from initialize was sent on subsequent calls
    expect(calls.find((c) => c.body.method === 'tools/list')?.sessionId).toBe('sess-42')
  })

  it('surfaces JSON-RPC errors and HTTP failures as thrown errors', async () => {
    const bad = new McpClient(async (bodyJson) => ({
      status: 200,
      contentType: 'application/json',
      bodyText: JSON.stringify({
        jsonrpc: '2.0',
        id: JSON.parse(bodyJson).id,
        error: { code: -32601, message: 'Method not found' },
      }),
    }))
    await expect(bad.listTools()).rejects.toThrow('Method not found')

    const down = new McpClient(async () => ({ status: 502, contentType: '', bodyText: '' }))
    await expect(down.listTools()).rejects.toThrow('HTTP 502')
  })

  it('callTool joins text content and flags isError results', async () => {
    const client = new McpClient(async (bodyJson) => {
      const body = JSON.parse(bodyJson)
      const isError = body.params?.arguments?.fail === true
      return {
        status: 200,
        contentType: 'application/json',
        bodyText: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            isError,
            content: [
              { type: 'text', text: isError ? 'boom' : 'line one' },
              ...(isError ? [] : [{ type: 'text', text: 'line two' }, { type: 'image', data: 'x' }]),
            ],
          },
        }),
      }
    })
    expect(await client.callTool('t', {})).toBe('line one\nline two')
    expect(await client.callTool('t', { fail: true })).toBe('Error: boom')
  })
})

describe('mcpAgentTools', () => {
  it('namespaces names, builds arg hints from the schema, and runs through the client', async () => {
    const client = new McpClient(async (bodyJson) => {
      const body = JSON.parse(bodyJson)
      return {
        status: 200,
        contentType: 'application/json',
        bodyText: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: `called ${body.params.name}` }] },
        }),
      }
    })
    const tools = mcpAgentTools(
      client,
      [
        {
          name: 'get-weather',
          description: 'Look up weather',
          inputSchema: {
            properties: {
              city: { type: 'string', description: 'City name' },
              units: { type: 'string' },
            },
            required: ['city'],
          },
        },
      ],
      'Home Server'
    )
    expect(tools[0].name).toBe('mcp_home_server_get_weather')
    expect(tools[0].description).toContain('[Home Server]')
    expect(tools[0].args.city).toBe('string — City name')
    expect(tools[0].args.units).toBe('string — optional')
    expect(await tools[0].run({ city: 'Calgary' })).toBe('called get-weather')
  })
})
