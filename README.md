# flux

AI-Native Agentic Version Control System MVP.

## Requirements

- Node.js 22+
- Git
- [Gemini CLI](https://ai.google.com/gemini-api/docs/cli) for AI work
- [GitHub CLI](https://cli.github.com/) (optional) for automatic pull request creation
- [Jules CLI](https://jules.google/docs/cli/reference/) (optional) for offloading AI work for Jules to run remotely

## Installation

To use the `flux` command globally on your local machine, run from the project root:

```bash
npm install -g treeder/flux
```

## CLI Commands

### `flux init`

Initialize a new flux repository in the current directory.

```bash
flux init
```

### `flux start <intent>`

Start a new shadow workspace for a specific intent. This creates an isolated shadow branch for you to work on your agentic intent.

```bash
flux start "add user authentication"

# to pull a github issue and implement it
flux start --issue https://github.com/treeder/flux/issues/123
```

### `flux run <intent>`

Apply new changes within a shadow workspace. Use the `--id` flag to target an existing workspace and continue your agentic flow.

```bash
flux run --id <ID> "refactor the new login page"
```

### `flux review`

Generate a Semantic Intent Review and Confidence Score via AI for the current changes or a Pull Request. You can provide an `--id` to review a specific shadow workspace.

The scores are for complexity and confidence helping you decide if a human needs to review it or not.

You can also use the `--github` flag to output a clean Markdown format suitable for posting as a Pull Request comment in a GitHub Action. When `--github` is set, all progress messages are routed to `stderr` so that `stdout` contains only the review markdown.

```bash
flux review
# or to review a specific workspace
flux review --id <ID>
# or to generate a GitHub Action-friendly Markdown response
flux review --github
# or to review a specific Pull Request URL/number and output Markdown
flux review <PR_URL> --github
```

### `flux merge`

Merge the pull request for a specific shadow workspace then pull the changes into your base branch.

```bash
flux merge --id <ID>
```

### `flux push <intent>`

Create and push a new shadow worktree (branch) for any changes in main, open a pull request for it, then reset main so you can get back to work immediately.

This is nice for quick little changes that you want to get in fast. No AI involved.

```bash
flux push "update README"
```

### `flux remove`

Remove a shadow workspace (worktree) and its associated branch by ID.

```bash
flux remove --id <ID>
# or
flux rm --id <ID>
```
