import PQueue from 'p-queue';
import { logger } from '../../lib/logger.js';

export interface LinkValidation {
  status: 'valid' | 'invalid' | 'restricted' | 'unchecked';
  httpStatus: number | null;
  verifiedAt: Date | null;
}

const queue = new PQueue({ concurrency: 3 });

async function request(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  return fetch(url, {
    method,
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36 SIGAP-Link-Validator/1.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(7_000)
  });
}

export async function validateLink(url: string): Promise<LinkValidation> {
  return queue.add(async () => {
    try {
      let response: Response;
      try {
        response = await request(url, 'HEAD');
      } catch {
        response = await request(url, 'GET');
      }
      if (response.status === 405 || response.status === 501) {
        response = await request(url, 'GET');
      }
      const status = response.status;
      if (status >= 200 && status < 400) {
        return { status: 'valid', httpStatus: status, verifiedAt: new Date() };
      }
      if (status === 401 || status === 403 || status === 429) {
        return { status: 'restricted', httpStatus: status, verifiedAt: new Date() };
      }
      return { status: 'invalid', httpStatus: status, verifiedAt: new Date() };
    } catch (error) {
      logger.debug({ err: error, url }, 'Link validation failed');
      return { status: 'unchecked', httpStatus: null, verifiedAt: null };
    }
  }) as Promise<LinkValidation>;
}
