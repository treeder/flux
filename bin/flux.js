#!/usr/bin/env node

import { Command } from 'commander'
import dotenv from 'dotenv'
import { initCommand, shadowStartCommand, reviewCommand } from '../src/commands.js'

dotenv.config()

const program = new Command()

program.name('flux').description('AI-Native Agentic Version Control System MVP').version('1.0.0')

program.command('init').description('Initialize a new flux repository').action(initCommand)

const shadow = program.command('shadow').description('Manage shadow workspaces for agentic intents')

// Add top-level start command as a convenient alias
program
  .command('start <intent>')
  .description('Start a new shadow workspace for a specific intent (alias for shadow start)')
  .action(shadowStartCommand)

program
  .command('review')
  .description('Generate Semantic Intent Review and Confidence Score via AI for the current changes')
  .action(reviewCommand)

program.parse(process.argv)
