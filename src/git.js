import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function run(cmd, cwd = process.cwd()) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
  } catch (error) {
    if (error.stdout) console.log(error.stdout.toString())
    if (error.stderr) console.error(error.stderr.toString())
    throw error
  }
}

export function isGitInitialized() {
  return fs.existsSync(path.join(process.cwd(), '.git'))
}

export function initGit() {
  run('git init')
  // Initial commit to avoid issues with branch creation
  fs.writeFileSync('.gitignore', 'node_modules/\n.env\n.hit/\n')
  run('git add .gitignore')
  run('git commit -m "hit: Initial commit"')
}

export function createBranch(branchName) {
  run(`git checkout -b ${branchName}`)
}

export function getDiff() {
  // Stage intent-to-add for untracked files so the AI can review new files
  try {
    run('git add -N .')
  } catch (e) {}

  // Get staged and unstaged changes, explicitly excluding .hit directory
  // We prefer unstaged or all changes against HEAD
  try {
    return run('git diff HEAD -- ":(exclude).hit"')
  } catch (e) {
    // maybe no HEAD yet, just git diff
    return run('git diff -- ":(exclude).hit"')
  }
}

export function status() {
  return run('git status --short')
}
