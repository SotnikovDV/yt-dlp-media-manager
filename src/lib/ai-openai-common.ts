/**
 * Общие утилиты для OpenAI-совместимых вызовов chat/completions.
 */

import { env } from '@/lib/env';

export function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const full = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (full) return full[1].trim();
  const anyFence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (anyFence) return anyFence[1].trim();
  return t;
}

/** Вырезать первый JSON-объект `{...}` из текста (если модель добавила пояснения). Учитывает строки в двойных кавычках. */
export function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseIdsFromObject(parsed: unknown, allowed: Set<string>): string[] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const ids = (parsed as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return null;
  const out: string[] = [];
  for (const x of ids) {
    if (typeof x !== 'string' || !allowed.has(x)) continue;
    if (!out.includes(x)) out.push(x);
  }
  return out.length > 0 ? out : [];
}

export function parseIdsJson(content: string, allowed: Set<string>): string[] | null {
  const candidates: string[] = [];
  const fence = stripJsonFence(content);
  candidates.push(fence);
  const extracted = extractFirstJsonObject(content);
  if (extracted && extracted !== fence) candidates.push(extracted);
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const out = parseIdsFromObject(parsed, allowed);
    if (out !== null) return out;
  }
  return null;
}

function parseKeywordsFromObject(parsed: unknown): string[] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const kw = (parsed as { keywords?: unknown }).keywords;
  if (!Array.isArray(kw)) return null;
  const out: string[] = [];
  for (const x of kw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (t) out.push(t);
  }
  return out;
}

export function parseKeywordsJson(content: string): string[] | null {
  const candidates: string[] = [];
  const fence = stripJsonFence(content);
  candidates.push(fence);
  const extracted = extractFirstJsonObject(content);
  if (extracted && extracted !== fence) candidates.push(extracted);
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const out = parseKeywordsFromObject(parsed);
    if (out !== null) return out;
  }
  return null;
}

export type AiChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Результат chat/completions для отладки и устойчивого разбора ответа. */
export type AiChatCompletionDetail = {
  content: string | null;
  httpStatus: number | null;
  failureStage: 'ok' | 'no_key' | 'network' | 'http' | 'bad_response_shape' | 'empty_assistant';
  /** Человекочитаемая причина при failureStage !== ok */
  detail?: string;
  /** Фрагмент сырого тела ответа (ошибка API или нестандартный JSON) */
  responseSnippet?: string;
};

/** Текст из message.content / message.reasoning: строка или массив частей (OpenAI-совместимый формат). */
function openAiMessagePartToText(part: unknown): string | null {
  if (typeof part === 'string') {
    const t = part.trim();
    return t ? part : null;
  }
  if (part && typeof part === 'object') {
    const p = part as { type?: unknown; text?: unknown };
    if (p.type === 'text' && typeof p.text === 'string') {
      const t = p.text.trim();
      return t ? p.text : null;
    }
  }
  return null;
}

function messageFieldToText(field: unknown): string | null {
  if (typeof field === 'string') {
    const t = field.trim();
    return t ? field : null;
  }
  if (Array.isArray(field)) {
    const parts: string[] = [];
    for (const part of field) {
      const chunk = openAiMessagePartToText(part);
      if (chunk) parts.push(chunk);
    }
    const s = parts.join('');
    return s.trim() ? s : null;
  }
  return null;
}

function assistantMessageToText(message: unknown): { text: string | null; refusal?: string } {
  if (!message || typeof message !== 'object') return { text: null };
  const m = message as Record<string, unknown>;
  const refusal = m.refusal;
  if (typeof refusal === 'string' && refusal.trim()) {
    return { text: null, refusal: refusal.trim() };
  }
  const fromContent = messageFieldToText(m.content);
  if (fromContent) return { text: fromContent };
  // Groq gpt-oss и часть reasoning-моделей оставляют content пустым и пишут в reasoning.
  const fromReasoning = messageFieldToText(m.reasoning);
  if (fromReasoning) return { text: fromReasoning };
  const fromReasoningAlt = messageFieldToText(m.reasoning_content);
  if (fromReasoningAlt) return { text: fromReasoningAlt };
  return { text: null };
}

export async function postAiChatCompletionDetailed(
  messages: AiChatMessage[],
  opts: {
    model: string;
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
    /** OpenAI-совместимый режим: ответ строго JSON-объект (если провайдер поддерживает). */
    responseFormatJsonObject?: boolean;
  }
): Promise<AiChatCompletionDetail> {
  const fail = (
    stage: AiChatCompletionDetail['failureStage'],
    partial: Omit<Partial<AiChatCompletionDetail>, 'failureStage'> = {}
  ): AiChatCompletionDetail => ({
    content: null,
    httpStatus: partial.httpStatus ?? null,
    failureStage: stage,
    ...partial,
  });

  const key = env.aiApiKey().trim();
  if (!key) return fail('no_key', { detail: 'AI_API_KEY пустой' });

  const url = `${env.aiBaseUrl()}/chat/completions`;
  const timeoutMs = env.aiHttpTimeoutSec() * 1000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages,
        ...(opts.responseFormatJsonObject
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    const httpStatus = res.status;
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      return fail('bad_response_shape', {
        httpStatus,
        detail: 'Ответ не JSON',
        responseSnippet: rawText.slice(0, 500),
      });
    }

    if (!res.ok) {
      const errObj = data as { error?: { message?: string } };
      const msg =
        typeof errObj.error?.message === 'string'
          ? errObj.error.message
          : rawText.slice(0, 400);
      return fail('http', {
        httpStatus,
        detail: msg,
        responseSnippet: rawText.slice(0, 500),
      });
    }

    const choices = (data as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return fail('bad_response_shape', {
        httpStatus,
        detail: 'Пустой или неверный choices[]',
        responseSnippet: rawText.slice(0, 500),
      });
    }

    const message = (choices[0] as { message?: unknown }).message;
    const { text, refusal } = assistantMessageToText(message);
    if (text) {
      return { content: text, httpStatus, failureStage: 'ok' };
    }
    return fail('empty_assistant', {
      httpStatus,
      detail: refusal ?? 'Нет текста в message.content (возможен неподдерживаемый формат)',
      responseSnippet: rawText.slice(0, 500),
    });
  } catch (e) {
    const err = e as Error;
    const name = err?.name ?? 'Error';
    const msg = err?.message ?? String(e);
    const aborted = name === 'AbortError';
    return fail('network', {
      detail: aborted ? `Таймаут или отмена (~${timeoutMs} ms)` : `${name}: ${msg}`,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function postAiChatCompletion(
  messages: AiChatMessage[],
  opts: {
    model: string;
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
  }
): Promise<string | null> {
  const r = await postAiChatCompletionDetailed(messages, opts);
  return r.content;
}
