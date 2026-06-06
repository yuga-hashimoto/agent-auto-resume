export const CODEX_SAFE_RESUME_PROMPT = `
Continue the previous task from where it stopped.

Before making changes:
1. Inspect the current repository state.
2. Run git status.
3. Inspect git diff.
4. Read AGENT_PROGRESS.md if it exists.
5. Identify what was already completed and what remains.
6. Do not overwrite user changes.
7. Continue only the remaining work.
8. Run relevant tests if available.
9. Summarize what changed and what remains.
`;

export const ANTIGRAVITY_SAFE_RESUME_PROMPT = `
Continue the previous task from where it stopped.

Before making changes:
1. Inspect the current workspace state.
2. Run git status.
3. Inspect git diff.
4. Read AGENT_PROGRESS.md if it exists.
5. Identify what was already completed and what remains.
6. Do not overwrite user changes.
7. Continue only the remaining work.
8. Ask for confirmation before destructive operations.
9. Run relevant tests if available.
10. Summarize what changed and what remains.
`;

export const CLAUDE_SAFE_RESUME_PROMPT = `
Continue the previous task from where it stopped.

Before making changes:
1. Inspect the current repository state.
2. Run git status.
3. Inspect git diff.
4. Read AGENT_PROGRESS.md if it exists.
5. Continue only the remaining work.
6. Do not overwrite user changes.
7. Summarize what changed and what remains.
`;
