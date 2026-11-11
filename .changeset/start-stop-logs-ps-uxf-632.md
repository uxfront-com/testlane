---
"@uxfront/uxd": minor
---

Add `start`, `stop`, `logs` and `ps`, so you can hand someone a running app and get your terminal back. `uxd <project> <ref> start <name>` runs a configured command in the background, returns once `127.0.0.1:{port}` accepts connections and leaves it running after uxd exits, with its output in a log that `logs` prints and `logs -f` follows. `stop` stops the whole process tree, `uxd <project> ps` lists what's running, and `rm` and `clean` now stop a running process before they remove its workspace. If you've configured a command named `start`, `stop`, `logs` or `ps`, note that the new verbs win over it, so `uxd <project> <ref> start` now runs the verb, while `uxd <project> <ref> run start` still reaches your command and `uxd doctor` warns about the overlap.

Under `--json`, what `[setup]` and hooks print now goes to stderr, so `start --json` and `checkout --setup --json` print nothing but the JSON on stdout.
