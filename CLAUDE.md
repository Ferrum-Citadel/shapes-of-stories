@AGENTS.md

## Claude Code

- Every commit is made as `git commit -m "<subject>" --trailer "Assisted-by: Claude Fable 5.1"`, with no other trailer.
- Before each commit, `git diff --cached | grep -inE "claude|anthropic"` prints nothing outside the files AGENTS.md names as exceptions to the vendor-name rule; the trailer is added by git, not in the diff.
