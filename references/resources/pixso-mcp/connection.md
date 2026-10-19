## Connection

- MCP server name: `pixso`
- Default endpoint: `http://127.0.0.1:3667/mcp`
- Keep Pixso running with the target design file open and active.
- Inspect the live tool schemas before the first operation. Treat them as authoritative because the desktop MCP may evolve.
- The installed official Codex plugin may add workflow guidance, but it does
  not replace this local Desktop MCP or add a second HTML renderer. Do not
  register a remote STDIO proxy under the same `pixso` server name for this
  local-file workflow.
- If the server reports a missing session ID during a raw HTTP probe, complete the MCP `initialize` handshake and reuse the returned `mcp-session-id`. A normally configured Codex MCP connection handles this automatically.

