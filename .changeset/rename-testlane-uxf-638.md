---
"@uxfront/testlane": major
---

Rename uxd to Testlane. The package is now `@uxfront/testlane` and its command is `testlane`, so install it with `npm i -g @uxfront/testlane` and remove the old one with `npm rm -g @uxfront/uxd` once nothing calls `uxd` any more. Commands now get `TESTLANE_PATH`, `TESTLANE_PORT` and the rest of the `TESTLANE_*` variables, the config dir is `~/.testlane` (set with `TESTLANE_CONFIG_DIR`), the state dir is `${XDG_STATE_HOME:-~/.local/state}/testlane`, debug output turns on with `TESTLANE_DEBUG=1`, and `setup` suggests `~/dev/testlane` as the root.

Testlane 2.x still works on what uxd left behind. It reads `~/.uxd` and the old state dir when the new ones don't exist, reads `UXD_CONFIG_DIR` and `UXD_DEBUG=1` when the new variables aren't set, and exports every variable under its `UXD_*` name too, so dev servers that bind `$UXD_PORT` keep working. Each fallback warns once per run on stderr with the fix, like `mv ~/.uxd ~/.testlane`, and 3.0 removes them.

**Breaking:** There's no `uxd` binary any more, so update the scripts, aliases and agent instructions that call `uxd`, and regenerate your shell completions with `testlane completions <bash|zsh|fish>`, because the old script completes `uxd`. The README's "Upgrading from uxd" section has every step.
