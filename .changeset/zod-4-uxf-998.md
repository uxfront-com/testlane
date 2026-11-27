---
"@uxfront/testlane": patch
---

Testlane now validates config files and MCP tool arguments with zod 4, so most validation messages read differently. For example, `ports: Number must be less than or equal to 10` is now `ports: Too big: expected number to be <=10`. The `file`, `path` and `message` fields of `config validate --json` and the exit codes stay the same, so only a script that matches on a message's text needs updating. A command name that breaks the naming rule still says which rule, as in `commands.Bad Name: must match ^[a-z0-9][a-z0-9:_-]*$`.
