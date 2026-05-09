# flux

AI-Native Agentic Version Control System MVP.

## Requirements

- Node.js 22+
- Git
- Gemini CLI
- gh (optional) for automatic pull request creation

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

Generate a Semantic Intent Review and Confidence Score via AI for the current changes. You can provide an `--id` to review a specific shadow workspace.

The scores are for complexity and confidence helping you decide if a human needs to review it or not.

```bash
flux review
# or to review a specific workspace
flux review --id <ID>
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
