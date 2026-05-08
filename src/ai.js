import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline/promises'

let genAI

async function getAI() {
  if (!genAI) {
    let apiKey = process.env.GEMINI_API_KEY
    const fluxFile = path.join(os.homedir(), '.flux')

    if (!apiKey && fs.existsSync(fluxFile)) {
      apiKey = fs.readFileSync(fluxFile, 'utf8').trim()
    }

    if (!apiKey) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      apiKey = await rl.question('Please enter your Gemini API Key: ')
      rl.close()

      if (!apiKey || !apiKey.trim()) {
        console.error('Error: Gemini API Key is required.')
        process.exit(1)
      }

      fs.writeFileSync(fluxFile, apiKey.trim())
      console.log(`Saved API Key to ${fluxFile}`)
    }
    genAI = new GoogleGenAI(apiKey.trim())
  }
  return genAI
}

export async function generateSemanticReview(diffText) {
  const ai = await getAI()
  // We use gemini-2.5-flash as default, or whatever fast model is suitable.
  // We can use gemini-1.5-pro for better analysis if needed.

  const prompt = `
You are the AI core of an Agentic Version Control System. 
The user has made the following code modifications (provided as a git diff).
Analyze the changes to determine the high-level semantic "Intent" of these changes, and score the Complexity and Confidence.

{
  "intent": "A clear, concise summary of the high-level goal of these changes",
  "details": ["Bullet 1", "Bullet 2", "Detailed explanation of AST-level changes here"],
  "complexityScore": 0-100, // How complex are these changes?
  "confidenceScore": 0-100, // How confident are you that these changes won't break things?
  "autoApprovable": true or false // Based on the confidence and complexity, can this be auto-merged?
}

Here is the diff:
${diffText}
`

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } },
            complexityScore: { type: 'number' },
            confidenceScore: { type: 'number' },
            autoApprovable: { type: 'boolean' },
          },
          required: ['intent', 'details', 'complexityScore', 'confidenceScore', 'autoApprovable'],
        },
      },
    })
    return JSON.parse(response.text)
  } catch (error) {
    console.error('AI Generation failed:', error.message)
    throw error
  }
}
