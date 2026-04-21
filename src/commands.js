import fs from 'fs';
import path from 'path';
import { isGitInitialized, initGit, createBranch, getDiff, status } from './git.js';
import { generateSemanticReview } from './ai.js';

export function initCommand() {
  console.log('Initializing hit Agentic VCS...');
  const hitDir = path.join(process.cwd(), '.hit');
  if (!fs.existsSync(hitDir)) {
    fs.mkdirSync(hitDir);
    const config = { version: "1.0.0", shadows: [] };
    fs.writeFileSync(path.join(hitDir, 'config.json'), JSON.stringify(config, null, 2));
    console.log('Created .hit configuration directory.');
  } else {
    console.log('.hit directory already exists.');
  }

  if (!isGitInitialized()) {
    console.log('No underlying .git repository found. Initializing Git...');
    initGit();
    console.log('Git initialized with initial commit.');
  } else {
    console.log('Underlying .git repository detected.');
  }

  console.log('Ready to trace impacts and shadow intents!');
}

export function shadowStartCommand(intent) {
  if (!isGitInitialized()) {
    console.error('Git is not initialized. Run "hit init" first.');
    process.exit(1);
  }
  
  // Format intent string into a safe branch/shadow name
  const safeIntentName = intent.trim().replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const shadowBranchName = `shadow/${safeIntentName}`;

  console.log(`Spawning shadow workspace for intent: "${intent}"`);
  console.log(`Under the hood, creating isolated shadow namespace: ${shadowBranchName}...`);
  try {
    createBranch(shadowBranchName);
    console.log(`Success! You have now entered the shadow workspace for ${safeIntentName}.`);
    console.log('Changes made here are safe from main state collisions.');
  } catch (error) {
    console.error('Failed to spawn shadow workspace.');
  }
}

export async function reviewCommand() {
  if (!isGitInitialized()) {
    console.error('Git is not initialized. Run "hit init" first.');
    process.exit(1);
  }

  console.log('Checking current workspace changes...');
  const currentDiff = getDiff();
  const currentStatus = status();

  if (!currentDiff && !currentStatus) {
    console.log('No changes detected in the workspace.');
    return;
  }

  console.log(`Raw Changes:\n${currentStatus}`);
  console.log('Requesting Semantic Intent Review from AI Engine...');

  try {
    const reviewData = await generateSemanticReview(currentDiff);

    console.log('\n================================');
    console.log('   SEMANTIC INTENT REVIEW      ');
    console.log('================================\n');

    console.log(`\x1b[32mIntent:\x1b[0m ${reviewData.intent}`);
    console.log('\n\x1b[36mDetails:\x1b[0m');
    reviewData.details.forEach(d => console.log(`  - ${d}`));
    
    console.log('\n\x1b[33mScores:\x1b[0m');
    console.log(`  Complexity: ${reviewData.complexityScore}/100`);
    console.log(`  Confidence: ${reviewData.confidenceScore}/100`);
    
    const approvableStr = reviewData.autoApprovable ? '\x1b[32mYES\x1b[0m' : '\x1b[31mNO (Requires Human Verification)\x1b[0m';
    console.log(`  Auto-Approvable: ${approvableStr}`);
    
    console.log('\n================================');

  } catch (err) {
    console.error('Failed to obtain Semantic Review. Make sure GEMINI_API_KEY is set and valid.');
  }
}
