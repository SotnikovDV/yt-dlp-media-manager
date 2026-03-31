/**
 * Умный поиск видео — алгоритм v12 (трёхэтапный каркас):
 * 1) LLM → ключи (модель AI_SEARCH_KEYWORDS_MODEL); JSON-промпт; опционально response_format json_object
 * 2) OR-поиск по title / description / channel.name без учёта регистра (Unicode в JS; см. video-case-insensitive-search)
 * 3) реранк: модель AI_SEARCH_RERANK_MODEL; промпт v12 (id только из входа, канал/усечённые сниппеты); добор пула — AI_SEARCH_SMART_APPEND_KEYWORD_POOL
 */

import {
  parseIdsJson,
  parseKeywordsJson,
  postAiChatCompletionDetailed,
} from '@/lib/ai-openai-common';
import { env } from '@/lib/env';
import { expandQueryNeedlesForCaseInsensitiveSearch } from '@/lib/video-case-insensitive-search';
import { writeQueueLog } from '@/lib/queue-logger';

const DEBUG_QUERY_TRUNC = 240;

/**
 * Промежуточные шаги AI-поиска в queue.log при QUEUE_LOG_LEVEL=debug (префикс с номером версии алгоритма).
 */
export function logSmartSearchV1Debug(
  step: string,
  meta: Record<string, unknown>
): void {
  const safe: Record<string, unknown> = { ...meta };
  for (const k of ['userQuery', 'query'] as const) {
    const v = safe[k];
    if (typeof v === 'string' && v.length > DEBUG_QUERY_TRUNC) {
      safe[k] = `${v.slice(0, DEBUG_QUERY_TRUNC)}…`;
    }
  }
  writeQueueLog(
    'debug',
    `[ai-smart-search-v${SMART_SEARCH_ALGORITHM_VERSION}] ${step}`,
    safe
  );
}

export const SMART_SEARCH_ALGORITHM_VERSION = 12 as const;

const ASSISTANT_PARSE_LOG_HEAD = 500;
const ASSISTANT_PARSE_LOG_TAIL = 300;

/** Для step*_parse_failed: длина ответа + начало и конец (обрезка vs отсутствие JSON). */
function assistantTextParseFailureMeta(raw: string): Record<string, unknown> {
  const n = raw.length;
  return {
    assistantCharCount: n,
    assistantSnippet: raw.slice(0, ASSISTANT_PARSE_LOG_HEAD),
    assistantTailSnippet:
      n > ASSISTANT_PARSE_LOG_TAIL ? raw.slice(-ASSISTANT_PARSE_LOG_TAIL) : raw,
  };
}

const MAX_KEYWORDS = 12;
const MAX_KEYWORD_LEN = 64;
/** Минимальная длина токена после trim (отсекаем мусор вроде «в», «a»). */
const MIN_KEYWORD_LEN = 2;
/** Запас под токенизацию; исходный запрос как единственный ключ. */
const MAX_FALLBACK_QUERY_LEN = 200;

export type RerankItemV1 = {
  id: string;
  title: string;
  description: string | null;
  channelName: string;
};

/**
 * Элементы с пробелами режем на отдельные слова (страховка, если LLM всё же вернула фразу).
 */
function flattenKeywordTokens(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    for (const part of w.trim().split(/\s+/)) {
      if (part) out.push(part);
    }
  }
  return out;
}

function dedupeKeywords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of flattenKeywordTokens(words)) {
    const t = w.trim().slice(0, MAX_KEYWORD_LEN);
    if (t.length < MIN_KEYWORD_LEN) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * Нормализация списка от LLM; при пустом результате — один ключ из исходного запроса.
 */
export function normalizeKeywordsForSearch(
  raw: string[] | null,
  userQuery: string
): string[] {
  const q = userQuery.trim();
  const fromLlm = raw ? dedupeKeywords(raw) : [];
  if (fromLlm.length > 0) return fromLlm;
  const fallback = q.slice(0, MAX_FALLBACK_QUERY_LEN);
  if (!fallback) return [];
  return dedupeKeywords(expandQueryNeedlesForCaseInsensitiveSearch(fallback));
}

/**
 * Этап 1: ключевые слова для текстового поиска. При ошибке API — `null` (вызывающий использует normalizeKeywordsForSearch).
 */
export async function extractSearchKeywords(
  userQuery: string,
  signal?: AbortSignal
): Promise<string[] | null> {
  const q = userQuery.trim().slice(0, MAX_FALLBACK_QUERY_LEN);
  if (!q) return null;

  const system = `You are a strict JSON emitter for a video-library search indexer. You must NOT answer the user's question, define terms, use markdown, bullet lists, code fences, or citations.

Your entire reply must be ONE raw JSON object and nothing else — no text before or after it.

Required shape: {"keywords":["word1","word2",...]}

Keyword rules:
- At most ${MAX_KEYWORDS} items. Each value is exactly ONE word (no spaces inside a token).
- Substring search only (no stemming). For Russian use several surface forms (e.g. война, войны, войне). For toponyms from the query use typical cases (Иран, Иране).
- For English, singular/plural one-word variants when helpful.
- Synonyms as separate single words only.
- Skip articles, prepositions, pronouns, filler (video, tutorial, review, guide, how, …) unless they are the core topic.
- Dedupe by lowercasing.`;

  const completion = await postAiChatCompletionDetailed(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `The user typed this for searching their downloaded videos (titles/descriptions). Do not explain what it means. Output ONLY the JSON object with "keywords".

Query: ${q}`,
      },
    ],
    {
      model: env.aiSearchKeywordsModel(),
      temperature: Math.min(0.2, env.aiSearchVideoTemperature()),
      maxTokens: env.aiSearchKeywordsMaxTokens(),
      signal,
      responseFormatJsonObject: env.aiSearchKeywordsResponseJson(),
    }
  );

  if (!completion.content) {
    logSmartSearchV1Debug('step1_llm_failure', {
      userQuery: q,
      failureStage: completion.failureStage,
      httpStatus: completion.httpStatus,
      detail: completion.detail,
      responseSnippet: completion.responseSnippet,
    });
    return null;
  }

  const parsed = parseKeywordsJson(completion.content);
  if (!parsed) {
    logSmartSearchV1Debug('step1_keywords_parse_failed', {
      userQuery: q,
      ...assistantTextParseFailureMeta(completion.content),
    });
    return null;
  }
  if (parsed.length === 0) {
    logSmartSearchV1Debug('step1_keywords_empty_array', {
      userQuery: q,
      assistantSnippet: completion.content.slice(0, 500),
    });
    return null;
  }

  const out = dedupeKeywords(parsed);
  if (out.length === 0) {
    logSmartSearchV1Debug('step1_keywords_dedupe_empty', {
      userQuery: q,
      parsedFromJson: parsed,
    });
    return null;
  }
  return out;
}

/**
 * Итоговый порядок id после реранга (этап 3).
 * - `ranked === null` — сбой API/разбора → порядок пула этапа 2 по дате, до `cap`.
 * - `ranked.length === 0` — LLM вернула пустой список релевантных: при `appendFromPool` показываем пул этапа 2; иначе `[]`.
 * - Иначе — порядок LLM; при `appendFromPool` добор из `poolOrderIds` до `cap` (см. AI_SEARCH_SMART_APPEND_KEYWORD_POOL).
 */
export function smartSearchOrderedIdsAfterRerank(
  ranked: string[] | null,
  poolOrderIds: string[],
  cap: number,
  appendFromPool: boolean
): string[] {
  if (ranked === null) {
    return poolOrderIds.slice(0, Math.min(cap, poolOrderIds.length));
  }
  if (ranked.length === 0) {
    if (appendFromPool) {
      return poolOrderIds.slice(0, Math.min(cap, poolOrderIds.length));
    }
    return [];
  }
  const head = ranked.slice(0, Math.min(cap, ranked.length));
  if (!appendFromPool) {
    return head;
  }
  const seen = new Set(head);
  const orderedIds = [...head];
  for (const id of poolOrderIds) {
    if (orderedIds.length >= cap) break;
    if (!seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }
  return orderedIds;
}

/**
 * Этап 3: реранжирование подмножества видео (длины сниппетов — env AI_SEARCH_RERANK_*_CHARS).
 * @returns Упорядоченные id или `null` при сбое API/парсинга; `[]` — валидный ответ «нет релевантных» (см. {@link smartSearchOrderedIdsAfterRerank}).
 */
export async function rerankVideoIdsForQuery(
  userQuery: string,
  items: RerankItemV1[],
  signal?: AbortSignal
): Promise<string[] | null> {
  if (items.length === 0) return [];

  const key = env.aiApiKey().trim();
  if (!key) return null;

  const allowed = new Set(items.map((i) => i.id));
  const payload = items.map((i) => ({
    id: i.id,
    title: i.title.slice(0, env.aiSearchRerankTitleChars()),
    description: (i.description ?? '').slice(0, env.aiSearchRerankDescriptionChars()),
    channel: i.channelName.slice(0, env.aiSearchRerankChannelChars()),
  }));

  const userMsg = `User query: ${userQuery.trim()}\n\nVideos JSON:\n${JSON.stringify(payload)}`;
  logSmartSearchV1Debug('step3_rerank_request', {
    userQuery: userQuery.trim(),
    payloadCharCount: userMsg.length,
    videoCount: items.length,
  });

const system = `You are a strict JSON emitter for re-ranking a fixed list of videos by relevance to the user's search query.

You must NOT answer the user's question, explain topics, use markdown, code fences, bullet lists, or any text outside JSON.

Your entire reply must be ONE raw JSON object and nothing else.

Input:
- A user search query (text).
- A JSON array of video records, each with fields: "id", "title", "description", "channel".
- Field values may be truncated snippets for length; do not treat a short or cut-off text alone as proof that a video is irrelevant.

Task:
- Select ONLY videos that are clearly relevant to the user's query.
- A video is relevant only if its title, description, or (when it supports the query intent) channel name clearly matches the main intent and key entities of the query.
- Ignore videos that match only by a couple of loose keywords but do not match the user's intent.
- If there is any doubt about relevance, treat the video as NOT relevant and exclude it.
- Order the remaining videos from most relevant to least relevant.

Output format (must stay EXACTLY as follows):
- One JSON object: {"ids":["id1","id2",...]}
- The "ids" array must list only ids that appear in the input records; copy each id string exactly (do not invent or alter ids).
- Include only ids whose videos are relevant under the rules above; omit all others.
- If no videos are relevant, return {"ids":[]}.

You must NOT output anything except this JSON object.
`;

  const completion = await postAiChatCompletionDetailed(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Do not answer the query — only output the JSON object with "ids" in relevance order.

${userMsg}`,
      },
    ],
    {
      model: env.aiSearchRerankModel(),
      temperature: Math.min(0.3, env.aiSearchVideoTemperature()),
      maxTokens: env.aiSearchRerankMaxTokens(),
      signal,
      responseFormatJsonObject: env.aiSearchRerankResponseJson(),
    }
  );

  if (!completion.content) {
    logSmartSearchV1Debug('step3_rerank_llm_failure', {
      userQuery: userQuery.trim(),
      failureStage: completion.failureStage,
      httpStatus: completion.httpStatus,
      detail: completion.detail,
      responseSnippet: completion.responseSnippet,
    });
    return null;
  }

  const parsed = parseIdsJson(completion.content, allowed);
  if (parsed === null) {
    logSmartSearchV1Debug('step3_rerank_parse_failed', {
      userQuery: userQuery.trim(),
      payloadCharCount: userMsg.length,
      ...assistantTextParseFailureMeta(completion.content),
    });
    return null;
  }

  if (parsed.length === 0) {
    logSmartSearchV1Debug('step3_rerank_empty_ids', {
      userQuery: userQuery.trim(),
      assistantSnippet: completion.content.slice(0, 500),
      payloadCharCount: userMsg.length,
    });
  }

  return parsed;
}
