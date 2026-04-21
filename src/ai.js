import { GoogleGenAI } from '@google/genai'

let genAI

function getAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('Error: GEMINI_API_KEY environment variable is missing.')
      console.error('Please set it using: export GEMINI_API_KEY="your-key"')
      process.exit(1)
    }
    genAI = new GoogleGenAI(apiKey)
  }
  return genAI
}

export async function generateSemanticReview(diffText) {
  const ai = getAI()
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


