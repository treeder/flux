import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import crypto from 'crypto'
import pc from 'picocolors'
import { isGitInitialized, createShadowWorktree, commitAll, createPullRequest } from '../git.js'
import { ensureGitignore, recordShadow } from '../commands.js'
import { jules } from '@google/jules-sdk'
import { getJulesApiKey } from '../ai.js'

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
      await getJulesApiKey()
      console.log(pc.gray(`> jules.run({ prompt: "[intent]" })`))

      const runner = await jules.run({
        prompt: finalIntent,
        autoPr: true,
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
      const prUrl = await createPullRequest(shadowBranchName, prTitle, shadowPath, options.issue)
      recordShadow(uniqueId, { branch: shadowBranchName, prUrl })
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
