#!/usr/bin/env node

import { Command } from 'commander'
import dotenv from 'dotenv'
import { initCommand, shadowStartCommand, reviewCommand, mergeCommand, pushCommand, removeCommand } from '../src/commands.js'

dotenv.config()

const program = new Command()

program.name('flux').description('AI-Native Agentic Version Control System MVP').version('1.0.0')

program.option('--id <id>', 'Unique ID of existing shadow workspace to continue applying changes to')

program.command('init').description('Initialize a new flux repository').action(initCommand)

// Add top-level start command as a convenient alias
program
  .command('start <intent>')
  .description('Start a new shadow workspace for a specific intent (alias for shadow start)')
  .option('--id <id>', 'Unique ID of existing shadow workspace to continue applying changes to')
  .action((intent, options) => shadowStartCommand(intent, { ...program.opts(), ...options }))

program
  .command('run <intent>')
  .description('Run changes in a shadow workspace (optionally use --id to continue)')
  .option('--id <id>', 'Unique ID of existing shadow workspace to continue applying changes to')
  .action((intent, options) => shadowStartCommand(intent, { ...program.opts(), ...options }))

program
  .command('review')
  .description('Generate Semantic Intent Review and Confidence Score via AI for the current changes')
  .option('--id <id>', 'Unique ID of existing shadow workspace to review')
  .action((options) => reviewCommand({ ...program.opts(), ...options }))

program
  .command('merge')
  .description('Merge the pull request for a specific shadow workspace')
  .option('--id <id>', 'Unique ID of existing shadow workspace to merge')
  .action((options) => mergeCommand({ ...program.opts(), ...options }))

program
  .command('push <message>')
  .description('Take current changes, create a worktree, commit, push, and create a PR')
  .option('--id <id>', 'Unique ID for the new shadow workspace (optional)')
  .action((message, options) => pushCommand(message, { ...program.opts(), ...options }))

program
  .command('remove')
  .alias('rm')
  .description('Remove a shadow workspace (worktree) by ID')
  .requiredOption('--id <id>', 'Unique ID of existing shadow workspace to remove')
  .action((options) => removeCommand({ ...program.opts(), ...options }))

program.parse(process.argv)
