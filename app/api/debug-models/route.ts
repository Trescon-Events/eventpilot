import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function GET() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const models = await genAI.listModels()
    const list: string[] = []
    for await (const m of models) {
      list.push(m.name)
    }
    return NextResponse.json({ models: list })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
