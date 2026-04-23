import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import crypto from 'crypto'
import {
  isGitInitialized,
  initGit,
  checkoutBaseAndCreateBranch,
  createShadowWorktree,
  commitAll,
  getDiff,
  status,
  createPullRequest,
} from './git.js'
import { generateSemanticReview } from './ai.js'

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
  console.log('Initializing flux Agentic VCS...')
  const fluxDir = path.join(process.cwd(), '.flux')
  if (!fs.existsSync(fluxDir)) {
    fs.mkdirSync(fluxDir)
    const config = { version: '1.0.0', shadows: [] }
    fs.writeFileSync(path.join(fluxDir, 'config.json'), JSON.stringify(config, null, 2))
    console.log('Created .flux configuration directory.')
  } else {
    console.log('.flux directory already exists.')
  }

  if (!isGitInitialized()) {
    console.log('No underlying .git repository found. Initializing Git...')
    initGit()
    console.log('Git initialized with initial commit.')
  } else {
    console.log('Underlying .git repository detected.')
  }

  ensureGitignore()
  console.log('Ready to trace impacts and shadow intents!')
}

export async function shadowStartCommand(intent, options = {}) {
  if (!isGitInitialized()) {
    console.error('Git is not initialized. Run "flux init" first.')
    process.exit(1)
  }

  ensureGitignore()

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
      console.error(`Could not find existing worktree for id: ${options.id}`)
      return
    }
    shadowBranchName = `flux/${shadowDirName}`
    shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)
    isNew = false
    console.log(`Resuming existing shadow workspace: ${shadowDirName}`)
  } else {
    // Format intent string into a safe branch/shadow name
    const safeIntentName = intent
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase()
      .substring(0, 30)
      .replace(/-+$/, '')
    shadowDirName = `${uniqueId}-${safeIntentName}`
    shadowBranchName = `flux/${shadowDirName}`
    shadowPath = path.join(process.cwd(), 'worktrees', shadowDirName)

    console.log(`Spawning shadow workspace for intent: "${intent}"`)
    console.log(`Under the hood, creating isolated shadow namespace: ${shadowBranchName}...`)
    try {
      createShadowWorktree(shadowBranchName, shadowPath)
      console.log(`Success! You have now entered the shadow workspace for ${shadowDirName}.`)
      console.log('Changes made here are safe from main state collisions.')
    } catch (error) {
      console.error('Failed to spawn shadow workspace.', error)
      return
    }
  }

  console.log('Executing Gemini CLI to implement the feature... (This may take a minute)')
  try {
    const safePrompt = intent.replace(/"/g, '\\"')
    console.log(`> gemini -y -p "${intent}"`)
    execSync(`gemini -y -p "${safePrompt}"`, { stdio: 'inherit', cwd: shadowPath })

    console.log('Committing changes to the shadow branch...')
    commitAll(`Implemented feature: ${intent}`, shadowPath)
    console.log('Done! Your shadow branch is ready with the implemented feature.')

    if (isNew) {
      console.log('Attempting to create a Pull Request...')
      createPullRequest(shadowBranchName, intent, shadowPath)
    } else {
      console.log('Changes added to existing Pull Request/Branch.')
    }
  } catch (error) {
    console.error('Failed to implement feature using Gemini CLI:', error.message)
  }
  console.log(`\x1b[33mTo continue making changes, run: flux run --id ${uniqueId} "new changes" \x1b[0m`)
  console.log(`\x1b[33mTo review the changes, run: flux review --id ${uniqueId}\x1b[0m`)
}

export async function reviewCommand(options = {}) {
  if (!isGitInitialized()) {
    console.error('Git is not initialized. Run "flux init" first.')
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
      console.error(`Could not find existing worktree for id: ${options.id}`)
      return
    }
    reviewPath = path.join(process.cwd(), 'worktrees', shadowDirName)
    console.log(`Reviewing existing shadow workspace: ${shadowDirName}`)
  } else {
    console.log('Checking current workspace changes...')
  }

  const currentDiff = getDiff(reviewPath)
  const currentStatus = status(reviewPath)

  if (!currentDiff && !currentStatus) {
    console.log('No changes detected in the workspace.')
    return
  }

  console.log(`Raw Changes:\n${currentStatus}`)
  console.log('Requesting Semantic Intent Review from AI Engine...')

  try {
    const reviewData = await generateSemanticReview(currentDiff)

    console.log('\n================================')
    console.log('   SEMANTIC INTENT REVIEW      ')
    console.log('================================\n')

    console.log(`\x1b[32mIntent:\x1b[0m ${reviewData.intent}`)
    console.log('\n\x1b[36mDetails:\x1b[0m')
    reviewData.details.forEach((d) => console.log(`  - ${d}`))

    console.log('\n\x1b[33mScores:\x1b[0m')
    console.log(`  Complexity: ${reviewData.complexityScore}/100`)
    console.log(`  Confidence: ${reviewData.confidenceScore}/100`)

    const approvableStr = reviewData.autoApprovable
      ? '\x1b[32mYES\x1b[0m'
      : '\x1b[31mNO (Requires Human Verification)\x1b[0m'
    console.log(`  Auto-Approvable: ${approvableStr}`)

    console.log('\n================================')
  } catch (err) {
    console.error('Failed to obtain Semantic Review. Make sure GEMINI_API_KEY is set and valid.')
  }
}
