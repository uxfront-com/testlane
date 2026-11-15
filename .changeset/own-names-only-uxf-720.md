---
"@uxfront/testlane": major
---

Testlane now reads and writes only its own names. It reads its config from `--config-dir`, `$TESTLANE_CONFIG_DIR` or `~/.testlane`, in that order, and keeps its state in `${XDG_STATE_HOME:-~/.local/state}/testlane`. Debug output turns on only with `TESTLANE_DEBUG=1` or `--verbose`, and the commands, setup and hooks it runs get only the `TESTLANE_*` variables. If you still keep a config or state directory, or set a variable, under another name, move or rename it to the one above while no `testlane` command is running.
