import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline/promises'

let genAI

function loadConfig() {
  const oldFluxFile = path.join(os.homedir(), '.flux')
  const oldJulesFile = path.join(os.homedir(), '.flux_jules')
  const fluxDir = path.join(os.homedir(), '.flux')
  const fluxFile = path.join(fluxDir, 'flux.json')

  let config = {}
  let migrated = false

  if (fs.existsSync(oldFluxFile) && fs.statSync(oldFluxFile).isFile()) {
    config.GEMINI_API_KEY = fs.readFileSync(oldFluxFile, 'utf8').trim()
    fs.unlinkSync(oldFluxFile)
    migrated = true
  }

  if (fs.existsSync(oldJulesFile) && fs.statSync(oldJulesFile).isFile()) {
    config.JULES_API_KEY = fs.readFileSync(oldJulesFile, 'utf8').trim()
    fs.unlinkSync(oldJulesFile)
    migrated = true
  }

  if (fs.existsSync(fluxFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fluxFile, 'utf8'))
      config = { ...parsed, ...config }
    } catch (e) {}
  }

  if (migrated) {
    saveConfig(config)
  }

  return config
}

function saveConfig(config) {
  const fluxDir = path.join(os.homedir(), '.flux')
  const fluxFile = path.join(fluxDir, 'flux.json')
  if (!fs.existsSync(fluxDir)) {
    fs.mkdirSync(fluxDir, { recursive: true })
  }
  fs.writeFileSync(fluxFile, JSON.stringify(config, null, 2))
}

async function getAI() {
  if (!genAI) {
    let apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      const config = loadConfig()

      if (config.GEMINI_API_KEY) {
        apiKey = config.GEMINI_API_KEY
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

      apiKey = apiKey.trim()
      config.GEMINI_API_KEY = apiKey
      saveConfig(config)
      console.log(`Saved API Key to ~/.flux/flux.json`)
    }

    apiKey = apiKey.trim()
    console.log(`Using Gemini API Key: ${apiKey}`)

    genAI = new GoogleGenAI({apiKey})
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

export async function getJulesApiKey() {
  let apiKey = process.env.JULES_API_KEY
  if (apiKey) {
    return apiKey
  }

  const config = loadConfig()

  if (config.JULES_API_KEY) {
    apiKey = config.JULES_API_KEY
  }

  if (!apiKey) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    apiKey = await rl.question('Please enter your Jules API Key: ')
    rl.close()

    if (!apiKey || !apiKey.trim()) {
      console.error('Error: Jules API Key is required.')
      process.exit(1)
    }

    apiKey = apiKey.trim()
    config.JULES_API_KEY = apiKey
    saveConfig(config)
    console.log(`Saved Jules API Key to ~/.flux/flux.json`)
  }

  apiKey = apiKey.trim()
  process.env.JULES_API_KEY = apiKey
  console.log(`Using Jules API Key: ${apiKey}`)
  return apiKey
}
