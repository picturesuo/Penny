# Commit, Push, And PR Check

1. Run `git status --short --branch`.
2. Verify the changed paths are intentional and repo-visible.
3. Commit and push finished files with `bash /Users/bensuo/ghostty-codex-launchpad/scripts/codex-commit.sh --each-path <paths...>`.
4. If a pull request exists, inspect it with `gh pr view --comments` and note any unresolved feedback.
