import { describe, expect, it } from 'vitest';
import { collectLidNumbers, toResolvedPhone } from '../server/services/sender-backfill-service.js';

describe('toResolvedPhone', () => {
  it('menerima JID/nomor HP WhatsApp dan menormalkannya', () => {
    expect(toResolvedPhone('6281234567890@s.whatsapp.net')).toBe('6281234567890');
    expect(toResolvedPhone('+62 812-3456-7890')).toBe('6281234567890');
    expect(toResolvedPhone('081234567890')).toBe('6281234567890');
  });

  it('menolak LID dan nilai kosong', () => {
    expect(toResolvedPhone('31357673721888@lid')).toBeNull();
    expect(toResolvedPhone('31357673721888')).toBeNull();
    expect(toResolvedPhone(null)).toBeNull();
    expect(toResolvedPhone('')).toBeNull();
  });
});

describe('collectLidNumbers', () => {
  it('mengambil LID unik dan mengabaikan nomor HP', () => {
    const result = collectLidNumbers([
      '31357673721888',
      '31357673721888',
      '6281234567890',
      '081234567890',
      null,
      undefined,
      '123'
    ]);

    expect(result).toEqual(['31357673721888']);
  });

  it('menerima LID yang tersimpan dengan suffix @lid', () => {
    expect(collectLidNumbers(['64441907433560@lid'])).toEqual(['64441907433560']);
  });
});
