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

function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore')
  let content = ''
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8')
  }
  const lines = content.split(/\r?\n/).map((l) => l.trim())
  if (!lines.includes('worktrees/')) {
    fs.appendFileSync(gitignorePath, (content && !content.endsWith('\n') ? '\n' : '') + 'worktrees/\n')
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

export async function shadowStartCommand(intent, options = {}) {
  if (!isGitInitialized()) {
    console.error(pc.red('❌ Git is not initialized. Run "flux init" first.'))
    process.exit(1)
  }

  ensureGitignore()

  let finalIntent = intent || ''
  let issueDetails = null

  if (options.issue) {
    const isUrl = String(options.issue).startsWith('http')
    const issueRef = isUrl ? options.issue : `#${options.issue}`
    try {
      console.log(pc.cyan(`📦 Fetching details for issue ${issueRef}...`))
      const issueOutput = execSync(`gh issue view ${options.issue} --json title,body`, { encoding: 'utf-8' })
      issueDetails = JSON.parse(issueOutput)

      const issuePrompt = `${issueDetails.title}\n\n${issueDetails.body}`
      if (finalIntent) {
        finalIntent = `${finalIntent}\n\n${issuePrompt}`
      } else {
        finalIntent = issuePrompt
      }
    } catch (e) {
      console.error(pc.red(`❌ Failed to fetch issue ${options.issue}. Ensure gh CLI is authenticated.`), e.message)
      process.exit(1)
    }
  }

  if (!finalIntent) {
    console.error(pc.red('❌ Please provide an intent or an issue number via --issue.'))
    process.exit(1)
  }

  if (options.jules) {
    console.log(pc.magenta(`🤖 Executing Jules SDK to implement the feature... (This may take a minute)`))
    try {
      console.log(pc.gray(`> jules.run({ prompt: "[intent]" })`))

      const runner = await jules.run({
        prompt: finalIntent,
        autoPr: false
      })

      console.log(pc.cyan(`Session started with ID: ${runner.id}`))

      for await (const activity of runner.stream()) {
        if (activity.activityType === 'STEP') {
          console.log(pc.gray(`  - ${activity.step.message || 'Processing...'}`))
        }
      }

      const outcome = await runner.result()
      if (outcome.status === 'ERROR') {
        throw new Error(outcome.error?.message || 'Unknown error')
      }

      console.log(pc.green('✅ Done! Jules is working on your request remotely.'))
    } catch (error) {
      console.error(pc.red(`❌ Failed to implement feature using Jules SDK: ${error.message}`))
    }
    return
  }

  let shadowDirName
  let shadowBranchName
  let shadowPath
  let isNew = true
  const uniqueId = options.id || crypto.randomBytes(3).toString('hex')

  if (options.id) {
    const worktreesDir = path.join(process.cwd(), 'worktrees')
    if (fs.existsSync(worktreesDir)) {
      const dirs = fs.readdirSync(worktreesDir)
      shadowDirName = dirs.find((d) => d.startsWith(options.id + '-'))
    }
    if (!shadowDirName) {
      console.error(pc.red(`❌ Could not find existing worktree for id: ${options.id}`))
      return
    }
    shadowBranchName = `flux/${shadowDirName}`
    shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)
    isNew = false
    console.log(pc.cyan(`🔁 Resuming existing shadow workspace: ${pc.bold(shadowDirName)}`))
  } else {
    // Format intent string into a safe branch/shadow name
    const baseName = issueDetails ? issueDetails.title : finalIntent
    const safeIntentName = baseName
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase()
      .substring(0, 30)
      .replace(/-+$/, '')
    shadowDirName = `${uniqueId}-${safeIntentName}`
    shadowBranchName = `flux/${shadowDirName}`
    shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)

    console.log(
      pc.cyan(
        `🌱 Spawning shadow workspace for intent: "${pc.italic(baseName.substring(0, 50))}${baseName.length > 50 ? '...' : ''}"`,
      ),
    )
    console.log(pc.gray(`Under the hood, creating isolated shadow namespace: ${shadowBranchName}...`))
    try {
      createShadowWorktree(shadowBranchName, shadowPath)
      console.log(pc.green(`🎉 Success! You have now entered the shadow workspace for ${pc.bold(shadowDirName)}.`))
      console.log(pc.green('🛡️ Changes made here are safe from main state collisions.'))
    } catch (error) {
      console.error(pc.red('❌ Failed to spawn shadow workspace.'), error)
      return
    }
  }

  console.log(pc.magenta(`🤖 Executing Gemini CLI to implement the feature... (This may take a minute)`))
  try {
    const safePrompt = finalIntent.replace(/"/g, '\\"')
    const argsString = `-y -p "${safePrompt}"`
    const argsDisplay = '-y -p "[intent]"'

    console.log(pc.gray(`> gemini ${argsDisplay}`))
    execSync(`gemini ${argsString}`, { stdio: 'inherit', cwd: shadowPath })

    console.log(pc.blue('💾 Committing changes to the shadow branch...'))
    const isUrl = options.issue && String(options.issue).startsWith('http')
    const issueRef = isUrl ? options.issue : `#${options.issue}`
    const commitMsg = issueDetails
      ? `Implemented feature for issue ${issueRef}: ${issueDetails.title}`
      : `Implemented feature: ${finalIntent.substring(0, 50).replace(/\n/g, ' ')}...`
    commitAll(commitMsg, shadowPath)
    console.log(pc.green('✅ Done! Your shadow branch is ready with the implemented feature.'))

    if (isNew) {
      console.log(pc.magenta('📤 Attempting to create a Pull Request...'))
      const prTitle = issueDetails ? issueDetails.title : finalIntent.substring(0, 50)
      await createPullRequest(shadowBranchName, prTitle, shadowPath, options.issue)
    } else {
      console.log(pc.blue('🔗 Changes added to existing Pull Request/Branch. Pushing...'))
      execSync('git push', { stdio: 'inherit', cwd: shadowPath })
    }
  } catch (error) {
    console.error(pc.red(`❌ Failed to implement feature using Gemini CLI: ${error.message}`))
  }
  console.log(pc.yellow(`💡 To continue making changes, run: ${pc.bold(`flux run --id ${uniqueId} "new changes"`)}`))
  console.log(pc.yellow(`📊 To review the changes, run: ${pc.bold(`flux review --id ${uniqueId}`)}`))
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
      console.error(pc.red(`❌ Could not find existing worktree for id: ${options.id}`))
      return
    }

    branchToMerge = `flux/${shadowDirName}`
    shadowPathToRemove = path.join(process.cwd(), 'worktrees', shadowDirName)
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
    await createPullRequest(shadowBranchName, message, shadowPath)

    console.log(pc.gray('Resetting main workspace to ensure clean state...'))
    execSync('git reset --hard HEAD', { cwd: process.cwd(), stdio: 'inherit' })

    console.log(pc.green('✅ Done! Changes pushed and PR created.'))
    console.log(pc.yellow(`💡 To review or continue working, use the ID: ${pc.bold(uniqueId)}`))
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
