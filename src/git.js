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
  run('git init -b main')
  // Initial commit to avoid issues with branch creation
  fs.writeFileSync('.gitignore', 'node_modules/\n.env\n.flux/\n')
  run('git add .gitignore')
  run('git commit -m "flux: Initial commit"')
}

export function getBaseBranch() {
  try {
    // Try to get default branch from origin
    const remoteHead = run('git rev-parse --abbrev-ref origin/HEAD');
    if (remoteHead) {
      return remoteHead.split('/')[1];
    }
  } catch (e) {}
  
  // Fallback to checking if main or master exist
  try {
    const branches = run('git branch --format="%(refname:short)"').split('\n');
    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';
  } catch(e) {}
  
  return 'main';
}

export function createBranch(branchName) {
  run(`git checkout -b ${branchName}`)
}

export function checkoutBaseAndCreateBranch(branchName) {
  const baseBranch = getBaseBranch();
  try {
    run(`git checkout ${baseBranch}`);
  } catch (e) {
    console.log(`Could not checkout base branch ${baseBranch}, branching from current spot.`);
  }
  run(`git checkout -b ${branchName}`);
}

export function commitAll(message) {
  try {
    run('git add .');
    // Escape double quotes for the commit message
    run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  } catch(e) {
    console.error('Failed to commit changes:', e.message);
  }
}

export function getDiff() {
  // Stage intent-to-add for untracked files so the AI can review new files
  try {
    run('git add -N .')
  } catch (e) {}

  // Get staged and unstaged changes, explicitly excluding .flux directory
  // We prefer unstaged or all changes against HEAD
  try {
    return run('git diff HEAD -- ":(exclude).flux"')
  } catch (e) {
    // maybe no HEAD yet, just git diff
    return run('git diff -- ":(exclude).flux"')
  }
}

export function status() {
  return run('git status --short')
}
