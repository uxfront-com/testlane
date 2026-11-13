---
"@uxfront/testlane": minor
---

Add `testlane mcp`, an MCP server over stdio with no new dependency, so an AI agent can check out a ref, start a command, read its logs, stop it and remove the workspace through typed tools instead of parsing the CLI's output. Its twelve tools (`projects`, `doctor`, `config_validate`, `list`, `ps`, `info`, `diff`, `logs`, `checkout`, `start`, `stop` and `rm`) call the same code as their commands and return the same JSON as `--json`, and `checkout` and `start` send progress and take a `timeout`. Connect it with `claude mcp add testlane -- testlane mcp`. A project named `mcp` can now only be reached by its repository URL.
