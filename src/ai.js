import { jules } from '@google/jules-sdk'
import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline/promises'

let julesClient

async function getAI() {
  if (!julesClient) {
    let apiKey = process.env.JULES_API_KEY || process.env.GEMINI_API_KEY
    const fluxFile = path.join(os.homedir(), '.flux')

    if (!apiKey && fs.existsSync(fluxFile)) {
      apiKey = fs.readFileSync(fluxFile, 'utf8').trim()
    }

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      apiKey = await rl.question('Please enter your API Key: ')
      rl.close()

      if (!apiKey || !apiKey.trim()) {
        console.error('Error: API Key is required.')
        process.exit(1)
      }

      fs.writeFileSync(fluxFile, apiKey.trim())
      console.log(`Saved API Key to ${fluxFile}`)
    }

    apiKey = apiKey.trim()
    console.log(`Using API Key: ${apiKey}`)

    julesClient = jules.with({ apiKey })
  }
  return julesClient
}

export async function generateSemanticReview(diffText) {
  const client = await getAI()

  const prompt = `
You are the AI core of an Agentic Version Control System. 
The user has made the following code modifications (provided as a git diff).
Analyze the changes to determine the high-level semantic "Intent" of these changes, and score the Complexity and Confidence.

Create a json file named result.json with the following format:
{
  "intent": "A clear, concise summary of the high-level goal of these changes",
  "details": ["Bullet 1", "Bullet 2", "Detailed explanation of AST-level changes here"],
  "complexityScore": 0-100,
  "confidenceScore": 0-100,
  "autoApprovable": true or false
}

Here is the diff:
${diffText}
`

  try {
    const session = await client.session({ prompt })
    const result = await session.result()
    const files = result.generatedFiles()
    const answer = files.get('result.json')
    
    if (!answer || !answer.content) {
      throw new Error('AI did not return the expected result.json file.')
    }
    
    let rawContent = answer.content.trim()
    if (rawContent.startsWith('\`\`\`json')) {
      rawContent = rawContent.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim()
    } else if (rawContent.startsWith('\`\`\`')) {
      rawContent = rawContent.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim()
    }

    return JSON.parse(rawContent)
  } catch (error) {
    console.error('AI Generation failed:', error.message)
    throw error
  }
}
