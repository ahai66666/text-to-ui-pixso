# Pixso MCP Workflow

Use this reference before reading or writing a Pixso design.

For Text-to-UI whole-page HTML imports, this is not the normal executor. The
native Text-to-UI Pixso plugin is required because it provides the higher-
fidelity single-transaction path. Use MCP whole-page execution only in an
explicit converter diagnosis or after the user approves an emergency fallback;
never switch automatically because the plugin is disconnected.

