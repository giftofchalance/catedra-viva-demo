/**
 * Clientes HTTP centralizados para Groq y Google Gemini.
 * Todos usan AbortSignal.timeout para evitar cuelgues indefinidos.
 */

import 'dotenv/config';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export function hasApiKeys() {
  return {
    hasGroq: Boolean(GROQ_API_KEY),
    hasGemini: Boolean(GEMINI_API_KEY)
  };
}

export async function callGroqWhisper({ audioBuffer, mimeType = 'audio/mp3', modelName = 'whisper-large-v3', timeoutMs = 15000 }) {
  if (!GROQ_API_KEY) return { ok: false, status: 0, text: '', error: 'GROQ_API_KEY no configurada' };

  const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('mp4') ? 'mp4'
    : 'webm';

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), `live_chunk.${ext}`);
  formData.append('model', modelName);
  formData.append('language', 'es');
  formData.append('response_format', 'json');
  formData.append('temperature', '0');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      return { ok: false, status: res.status, text: '', error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, status: res.status, text: data.text || '', error: null };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.message };
  }
}

export async function callGroqChat({ model, messages, temperature = 0.2, maxTokens = 900, jsonMode = false, timeoutMs = 15000 }) {
  if (!GROQ_API_KEY) return { ok: false, status: 0, text: '', error: 'GROQ_API_KEY no configurada' };

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      return { ok: false, status: res.status, text: '', error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    return { ok: Boolean(content), status: res.status, text: content, error: content ? null : 'Respuesta vacía' };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.message };
  }
}

export async function callGeminiFlashLite({
  promptText,
  temperature = 0.2,
  maxOutputTokens = 900,
  jsonMode = false,
  inlineAudio = null,
  timeoutMs = 15000
}) {
  if (!GEMINI_API_KEY) return { ok: false, status: 0, text: '', error: 'GEMINI_API_KEY no configurada' };

  const parts = [{ text: promptText }];
  if (inlineAudio && inlineAudio.dataBase64) {
    parts.push({
      inline_data: {
        mime_type: inlineAudio.mimeType || 'audio/mp3',
        data: inlineAudio.dataBase64
      }
    });
  }

  const generationConfig = { temperature, maxOutputTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
        signal: AbortSignal.timeout(timeoutMs)
      }
    );

    if (!res.ok) {
      return { ok: false, status: res.status, text: '', error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return { ok: Boolean(content), status: res.status, text: content, error: content ? null : 'Respuesta vacía' };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.message };
  }
}
