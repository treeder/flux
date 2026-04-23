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
npm install -g .
# or
npm link
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
```

### `flux run <intent>`

Apply new changes within a shadow workspace. Use the `--id` flag to target an existing workspace and continue your agentic flow.

```bash
flux run --id <ID> "refactor the new login page"
```

### `flux review`

Generate a Semantic Intent Review and Confidence Score via AI for the current changes. You can provide an `--id` to review a specific shadow workspace.

```bash
flux review
# or to review a specific workspace
flux review --id <ID>
```

### `flux merge`

Merge the pull request for a specific shadow workspace back into your base branch. This will squash your changes and tidy up the remote branch.

```bash
flux merge --id <ID>
```
