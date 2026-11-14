---
"@uxfront/testlane": patch
---

`--branch` refuses names that git would read as a refspec, like `a:b` or `+x`, with exit code 4. Before, such a name reached `git fetch`, where it could write a ref other than the branch you asked for.
