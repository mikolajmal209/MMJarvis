import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { db } from '../db';
import { getSettings, hasGoogleBridge } from '../settings';
import { TOOLS, findTool } from './tools';

const HISTORY_MESSAGES = 30;
const MAX_TOOL_ROUNDS = 8;

export interface AssistantReply {
  text: string;
  model: string;
}

function client() {
  const { geminiApiKey } = getSettings();
  if (!geminiApiKey) throw new Error('Add your free Gemini API key in Settings first.');
  return new GoogleGenAI({ apiKey: geminiApiKey });
}

async function systemPrompt(): Promise<string> {
  const s = getSettings();
  const memories = await db.memories.orderBy('createdAt').toArray();
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    'You are Jarvis, a concise, friendly personal assistant. You answer questions, manage the user\'s tasks,',
    'help plan their day, and help with their job search: tracking applications, reminding them about interviews',
    'and suggesting follow-ups. Use tools to act instead of only describing what you would do.',
    'Replies may be read aloud, so keep them short and conversational unless asked for detail. Reply in the language the user writes in.',
    `Current local time: ${now.toLocaleString('en-GB', { timeZone: tz })} (${tz}). Today is ${now.toLocaleDateString('en-GB', { weekday: 'long' })}.`,
    s.userName ? `The user's name is ${s.userName}.` : '',
    hasGoogleBridge(s)
      ? 'Google is connected: you can read Gmail, read and create Calendar events, and refresh job applications from Gmail.'
      : 'Google is not connected yet: if the user asks about email or calendar, tell them to connect Google in Settings.',
    memories.length
      ? `Things you remember about the user (id: fact):\n${memories.map((m) => `${m.id}: ${m.fact}`).join('\n')}`
      : 'You do not remember anything about the user yet.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function history(): Promise<Content[]> {
  const recent = await db.messages.orderBy('createdAt').reverse().limit(HISTORY_MESSAGES).toArray();
  return recent.reverse().map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));
}

/** Sends the conversation (already including the new user message) and runs any tool calls. */
export async function ask(onToolUse?: (name: string) => void): Promise<AssistantReply> {
  const ai = client();
  const { model } = getSettings();
  const contents = await history();
  const config = {
    systemInstruction: await systemPrompt(),
    tools: [
      {
        functionDeclarations: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ],
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await ai.models.generateContent({ model, contents, config });
    const calls = res.functionCalls ?? [];
    const usedModel = res.modelVersion || model;
    if (!calls.length) {
      return { text: res.text?.trim() || 'Sorry, I have no answer for that.', model: usedModel };
    }
    // Keep the model's turn verbatim: newer models attach signatures that must be sent back.
    const modelTurn = res.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);
    const results: Part[] = [];
    for (const call of calls) {
      const tool = call.name ? findTool(call.name) : undefined;
      onToolUse?.(call.name ?? '');
      let output: unknown;
      try {
        output = tool ? await tool.run(call.args ?? {}) : { error: `Unknown tool ${call.name}` };
      } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) };
      }
      results.push({ functionResponse: { id: call.id, name: call.name, response: { output } } });
    }
    contents.push({ role: 'user', parts: results });
  }
  return { text: 'I got stuck doing that. Please try again in simpler steps.', model };
}

/** Model ids available to this API key, for the Settings picker. */
export async function listModels(): Promise<string[]> {
  const ai = client();
  const names: string[] = [];
  const pager = await ai.models.list();
  for await (const m of pager) {
    if (m.name && m.supportedActions?.includes('generateContent') && m.name.includes('gemini')) {
      names.push(m.name.replace(/^models\//, ''));
    }
  }
  return names.sort();
}
