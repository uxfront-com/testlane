---
"@uxfront/testlane": minor
---

Add `testlane config detect [path | project]`, which drafts a project config from a repository's own files: its package manager and frozen install, its workspace packages, the dev server of each app bound to `127.0.0.1:{port}`, a `turbo` build before dev, seed files from `.env*.example`, and `test` and `check` commands. It only reads files and runs nothing from the repository, and every line ends with `# detected:`, `# guess:` or `# note:` so you can see why it's there. `--repo-file` prints only the keys a `.testlane.toml` may hold, and `--json` prints each finding with its reason and confidence. `config add <url> --detect` and `setup --detect` start the project file from the same draft when the repository has no `.testlane.toml`. Without these flags, nothing changes.
