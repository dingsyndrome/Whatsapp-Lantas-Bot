import { logger } from '../../lib/logger.js';
import { parseJsonLoose } from '../ocr/text-utils.js';

interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface AiMessageContentText {
  type: 'text';
  text: string;
}

interface AiMessageContentImage {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: { message?: string };
}

async function chatCompletion(
  config: AiConfig,
  content: string | Array<AiMessageContentText | AiMessageContentImage>
): Promise<Record<string, unknown> | null> {
  if (!config.enabled) return null;
  const base = config.baseUrl.replace(/\/+$/, '');
  const endpoint = `${base}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Anda adalah parser data yang sangat teliti. Balas hanya dengan JSON valid tanpa markdown atau penjelasan.'
          },
          { role: 'user', content }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body: body.slice(0, 400) }, 'AI request failed');
      return null;
    }

    const json = (await response.json()) as ChatResponse;
    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      logger.warn({ error: json.error?.message }, 'AI response has no content');
      return null;
    }
    return parseJsonLoose<Record<string, unknown>>(text);
  } catch (error) {
    logger.warn({ err: error }, 'AI request error');
    return null;
  }
}

export async function extractTimemarkWithAi(
  config: AiConfig,
  prompt: string,
  imageBase64: string,
  mimeType: string
): Promise<Record<string, unknown> | null> {
  return chatCompletion(config, [
    { type: 'text', text: prompt },
    {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' }
    }
  ]);
}

export async function extractDocumentWithAi(
  config: AiConfig,
  prompt: string,
  documentText: string
): Promise<Record<string, unknown> | null> {
  return chatCompletion(
    config,
    `${prompt}\n\n=== TEKS DOKUMEN ===\n${documentText.slice(0, 120_000)}`
  );
}

export interface AiTestResult {
  ok: boolean;
  baseUrl: string;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

/**
 * Uji cepat kredensial AI: satu request chat kecil ke endpoint OpenAI-compatible.
 * Berbeda dengan chatCompletion, error dikembalikan apa adanya untuk ditampilkan di UI.
 */
export async function testAiConnection(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<AiTestResult> {
  const startedAt = Date.now();
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const result = (patch: Partial<AiTestResult>): AiTestResult => ({
    ok: false,
    baseUrl,
    model: input.model,
    latencyMs: Date.now() - startedAt,
    ...patch
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: 'Balas hanya dengan JSON valid tanpa penjelasan.' },
          { role: 'user', content: 'Balas: {"ok":true}' }
        ]
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      logger.warn({ status: response.status, body }, 'AI test gagal');
      return result({ error: `HTTP ${response.status}: ${body || '(tanpa body)'}` });
    }

    const json = (await response.json()) as ChatResponse;
    const reply = json.choices?.[0]?.message?.content ?? '';
    return result({ ok: true, reply: reply.slice(0, 200) });
  } catch (error) {
    return result({ error: error instanceof Error ? error.message : 'Gagal menghubungi endpoint AI.' });
  }
}
