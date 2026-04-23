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

### `flux review`

Generate a Semantic Intent Review and Confidence Score via AI for the current changes in your workspace.

```bash
flux review
```
