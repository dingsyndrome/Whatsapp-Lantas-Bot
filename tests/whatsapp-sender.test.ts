import { describe, expect, it } from 'vitest';
import { resolveSenderJid, resolveSenderNumber } from '../server/lib/whatsapp-sender.js';

describe('deteksi nomor HP pengirim WhatsApp', () => {
  it('memakai participantAlt saat participant berupa LID', () => {
    expect(
      resolveSenderNumber('123456789012345@lid', '6281234567890@s.whatsapp.net')
    ).toBe('6281234567890');
  });

  it('memakai participant utama bila justru berisi nomor HP', () => {
    expect(
      resolveSenderNumber('6281234567890@s.whatsapp.net', '123456789012345@lid')
    ).toBe('6281234567890');
  });

  it('menerima JID @c.us dan nomor tanpa suffix', () => {
    expect(resolveSenderNumber('628111111111@c.us')).toBe('628111111111');
    expect(resolveSenderNumber('123@lid', '+62 812-3456-7890')).toBe('6281234567890');
  });

  it('mempertahankan LID bila nomor HP tidak tersedia', () => {
    expect(resolveSenderJid('123456789012345@lid')).toBe('123456789012345@lid');
    expect(resolveSenderNumber('123456789012345@lid')).toBe('123456789012345');
  });
});
