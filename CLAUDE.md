@AGENTS.md

## Claude Code

- Every commit is made as `git commit -m "<subject>" --trailer "Assisted-by: Claude 5.1 Fable"`, with no other trailer.
- Before each commit, `git diff --cached | grep -inE "claude|anthropic"` prints nothing; the trailer is added by git, not in the diff.
- Ask before the first paid scoring run (`JEV_MODE=live`, `--mode live`) in a session and state the cost; synthetic mode for everything else.
- Never press Analyze in, or start an analysis against, a running dev stack whose backend is in live mode.
