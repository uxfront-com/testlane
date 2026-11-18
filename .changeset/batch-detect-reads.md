---
"@uxfront/testlane": patch
---

Make `setup --detect` and `config detect` read a large monorepo in one fetch, and stop git's background maintenance from breaking them. Before, detection downloaded each `package.json` on its own, so a repository like n8n took minutes, and after 50 downloads git started repacking the whole clone in the background, which could make a read fail with "in the commit graph file but not in the object database". Now detection downloads every file it may read in a single `git fetch`, and every git command Testlane runs passes `maintenance.auto=false` and `gc.auto=0` through `GIT_CONFIG_COUNT`, after any entries your environment already sets.
