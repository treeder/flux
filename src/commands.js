import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import crypto from 'crypto'
import pc from 'picocolors'
import {
  isGitInitialized,
  initGit,
  checkoutBaseAndCreateBranch,
  createShadowWorktree,
  commitAll,
  getDiff,
  status,
  createPullRequest,
  mergePullRequest,
  pullBase,
  removeWorktree,
  getCurrentBranch,
  getBaseBranch,
} from './git.js'
import { generateSemanticReview } from './ai.js'
import { jules } from '@google/jules-sdk'

export function loadFluxConfig() {
  const configPath = path.join(process.cwd(), '.flux', 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (e) {
      // Ignore parse error
    }
  }
  return { version: '1.0.0', shadows: [] }
}

export function saveFluxConfig(config) {
  const fluxDir = path.join(process.cwd(), '.flux')
  if (!fs.existsSync(fluxDir)) {
    fs.mkdirSync(fluxDir, { recursive: true })
  }
  const configPath = path.join(fluxDir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function recordShadow(id, data) {
  const config = loadFluxConfig()
  config.shadows = config.shadows || []
  const existingIndex = config.shadows.findIndex((s) => s.id === id)
  if (existingIndex >= 0) {
    config.shadows[existingIndex] = { ...config.shadows[existingIndex], ...data }
  } else {
    config.shadows.push({ id, ...data })
  }
  saveFluxConfig(config)
}

export function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore')
  let content = ''
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8')
  }
  const lines = content.split(/\r?\n/).map((l) => l.trim())
  let toAppend = ''
  if (!lines.includes('worktrees/')) {
    toAppend += 'worktrees/\n'
  }
  if (!lines.includes('.flux/')) {
    toAppend += '.flux/\n'
  }
  if (toAppend) {
    fs.appendFileSync(gitignorePath, (content && !content.endsWith('\n') ? '\n' : '') + toAppend)
  }
}

export function initCommand() {
  console.log(pc.magenta('✨ Initializing flux Agentic VCS... ✨'))
  const fluxDir = path.join(process.cwd(), '.flux')
  if (!fs.existsSync(fluxDir)) {
    fs.mkdirSync(fluxDir)
    const config = { version: '1.0.0', shadows: [] }
    fs.writeFileSync(path.join(fluxDir, 'config.json'), JSON.stringify(config, null, 2))
    console.log(pc.green('📁 Created .flux configuration directory.'))
  } else {
    console.log(pc.blue('ℹ️ .flux directory already exists.'))
  }

  if (!isGitInitialized()) {
    console.log(pc.yellow('⚠️ No underlying .git repository found. Initializing Git...'))
    initGit()
    console.log(pc.green('✅ Git initialized with initial commit.'))
  } else {
    console.log(pc.blue('ℹ️ Underlying .git repository detected.'))
  }

  ensureGitignore()
  console.log(pc.cyan('🚀 Ready to trace impacts and shadow intents!'))
}

export async function reviewCommand(options = {}) {
  if (!isGitInitialized()) {
    console.error(pc.red('❌ Git is not initialized. Run "flux init" first.'))
    process.exit(1)
  }

  let reviewPath = process.cwd()

  if (options.id) {
    const worktreesDir = path.join(process.cwd(), 'worktrees')
    let shadowDirName
    if (fs.existsSync(worktreesDir)) {
      const dirs = fs.readdirSync(worktreesDir)
      shadowDirName = dirs.find((d) => d.startsWith(options.id + '-'))
    }
    if (!shadowDirName) {
      console.error(pc.red(`❌ Could not find existing worktree for id: ${options.id}`))
      return
    }
    reviewPath = path.join(process.cwd(), 'worktrees', shadowDirName)
    console.log(pc.cyan(`🔍 Reviewing existing shadow workspace: ${pc.bold(shadowDirName)}`))
  } else {
    console.log(pc.cyan('🔍 Checking current workspace changes...'))
  }

  const currentDiff = getDiff(reviewPath)
  const currentStatus = status(reviewPath)

  if (!currentDiff && !currentStatus) {
    console.log(pc.yellow('⚠️ No changes detected in the workspace.'))
    return
  }

  console.log(pc.gray(`Raw Changes:\n${currentStatus}`))
  console.log(pc.magenta('🧠 Requesting Semantic Intent Review from AI Engine...'))

  try {
    const reviewData = await generateSemanticReview(currentDiff)

    console.log(pc.bold(pc.magenta('\n================================')))
    console.log(pc.bold(pc.magenta('   ✨ SEMANTIC INTENT REVIEW ✨   ')))
    console.log(pc.bold(pc.magenta('================================\n')))

    console.log(`${pc.bold(pc.green('🎯 Intent:'))} ${reviewData.intent}`)
    console.log(`\n${pc.bold(pc.cyan('📝 Details:'))}`)
    reviewData.details.forEach((d) => console.log(`  ${pc.gray('-')} ${d}`))

    console.log(`\n${pc.bold(pc.yellow('📈 Scores:'))}`)
    console.log(`  Complexity: ${pc.cyan(reviewData.complexityScore)}/100`)
    console.log(`  Confidence: ${pc.cyan(reviewData.confidenceScore)}/100`)

    const approvableStr = reviewData.autoApprovable
      ? pc.green(pc.bold('YES'))
      : pc.red(pc.bold('NO (Requires Human Verification)'))
    console.log(`  Auto-Approvable: ${approvableStr}`)

    console.log(pc.bold(pc.magenta('\n================================')))

    if (options.id) {
      console.log(pc.yellow(`💡 To merge these changes, run: ${pc.bold(`flux merge --id ${options.id}`)}`))
    } else {
      console.log(pc.yellow(`💡 To merge these changes, run: ${pc.bold('flux merge --id <ID>')}`))
    }
  } catch (err) {
    console.error(
      pc.red(`❌ Failed to obtain Semantic Review. Make sure GEMINI_API_KEY is set and valid. Error: ${err.message}`),
    )
  }
}

export async function mergeCommand(options = {}) {
  if (!isGitInitialized()) {
    console.error(pc.red('❌ Git is not initialized. Run "flux init" first.'))
    process.exit(1)
  }

  let branchToMerge
  let shadowPathToRemove = null

  if (options.id) {
    const worktreesDir = path.join(process.cwd(), 'worktrees')
    let shadowDirName
    if (fs.existsSync(worktreesDir)) {
      const dirs = fs.readdirSync(worktreesDir)
      shadowDirName = dirs.find((d) => d.startsWith(options.id + '-'))
    }
    if (!shadowDirName) {
      const config = loadFluxConfig()
      const shadowInfo = config.shadows?.find((s) => s.id === options.id)
      if (shadowInfo && shadowInfo.branch) {
        branchToMerge = shadowInfo.branch
      } else {
        console.error(pc.red(`❌ Could not find existing worktree or configuration for id: ${options.id}`))
        return
      }
    } else {
      branchToMerge = `flux/${shadowDirName}`
      shadowPathToRemove = path.join(process.cwd(), 'worktrees', shadowDirName)
    }
  } else {
    branchToMerge = getCurrentBranch(process.cwd())
    const baseBranch = getBaseBranch(process.cwd())
    if (!branchToMerge || branchToMerge === baseBranch) {
      console.error(
        pc.red(
          '❌ Please provide the workspace ID using --id <id> or run this command from the branch you want to merge.',
        ),
      )
      process.exit(1)
    }
  }

  console.log(pc.cyan(`🔀 Initiating merge for branch: ${pc.bold(branchToMerge)}`))

  if (shadowPathToRemove) {
    removeWorktree(shadowPathToRemove, process.cwd())
  }

  mergePullRequest(branchToMerge, process.cwd())
  pullBase(process.cwd())
}

export async function pushCommand(message, options = {}) {
  if (!isGitInitialized()) {
    console.error(pc.red('❌ Git is not initialized. Run "flux init" first.'))
    process.exit(1)
  }

  ensureGitignore()

  const currentStatus = status(process.cwd())
  if (!currentStatus) {
    console.log(pc.yellow('⚠️ No changes detected in the workspace to push.'))
    return
  }

  if (!message) {
    console.error(pc.red('❌ Please provide a commit/PR message.'))
    process.exit(1)
  }

  const uniqueId = options.id || crypto.randomBytes(3).toString('hex')
  const safeIntentName = message
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .substring(0, 30)
    .replace(/-+$/, '')
  const shadowDirName = `${uniqueId}-${safeIntentName}`
  const shadowBranchName = `flux/${shadowDirName}`
  const shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)

  console.log(pc.cyan(`📦 Packaging current changes into shadow workspace: ${pc.bold(shadowDirName)}`))

  try {
    console.log(pc.gray('Stashing current changes...'))
    execSync('git stash push -u -m "flux-push-temp"', { cwd: process.cwd(), stdio: 'inherit' })

    createShadowWorktree(shadowBranchName, shadowPath)

    console.log(pc.gray('Applying changes to shadow workspace...'))
    try {
      execSync('git stash pop', { cwd: shadowPath, stdio: 'inherit' })
    } catch (stashError) {
      console.error(pc.yellow('⚠️ Note: git stash pop had some output/warnings, but changes should be applied.'))
    }

    console.log(pc.blue('💾 Committing changes...'))
    commitAll(message, shadowPath)

    console.log(pc.magenta('📤 Creating Pull Request...'))
    const prUrl = await createPullRequest(shadowBranchName, message, shadowPath)
    recordShadow(uniqueId, { branch: shadowBranchName, prUrl })

    console.log(pc.gray('Resetting main workspace to ensure clean state...'))
    execSync('git reset --hard HEAD', { cwd: process.cwd(), stdio: 'inherit' })

    console.log(pc.gray('🧹 Cleaning up shadow worktree...'))
    removeWorktree(shadowPath, process.cwd())

    try {
      execSync(`git branch -D ${shadowBranchName}`, { cwd: process.cwd(), stdio: 'ignore' })
      console.log(pc.gray(`🧹 Deleted branch ${shadowBranchName}`))
    } catch (e) {
      // Ignore error if branch deletion fails
    }

    console.log(pc.green('✅ Done! Changes pushed and PR created.'))
    console.log(pc.yellow(`💡 To merge these changes, run: flux merge --id ${pc.bold(uniqueId)}`))
  } catch (error) {
    console.error(pc.red('❌ Failed to push changes.'), error)
  }
}

export async function removeCommand(options = {}) {
  if (!isGitInitialized()) {
    console.error(pc.red('❌ Git is not initialized. Run "flux init" first.'))
    process.exit(1)
  }

  if (!options.id) {
    console.error(pc.red('❌ Please provide the workspace ID using --id <id> to remove.'))
    process.exit(1)
  }

  const worktreesDir = path.join(process.cwd(), 'worktrees')
  let shadowDirName
  if (fs.existsSync(worktreesDir)) {
    const dirs = fs.readdirSync(worktreesDir)
    shadowDirName = dirs.find((d) => d.startsWith(options.id + '-'))
  }
  if (!shadowDirName) {
    console.error(pc.red(`❌ Could not find existing worktree for id: ${options.id}`))
    return
  }

  const shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)
  const shadowBranchName = `flux/${shadowDirName}`

  console.log(pc.cyan(`🗑️  Removing shadow workspace: ${pc.bold(shadowDirName)}`))

  removeWorktree(shadowPath, process.cwd())

  try {
    execSync(`git branch -D ${shadowBranchName}`, { cwd: process.cwd(), stdio: 'ignore' })
    console.log(pc.gray(`🧹 Deleted branch ${shadowBranchName}`))
  } catch (e) {
    // Ignore error if branch deletion fails
  }

  console.log(pc.green('✅ Workspace removed successfully!'))
}
