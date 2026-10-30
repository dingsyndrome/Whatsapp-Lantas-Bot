import { describe, expect, it } from 'vitest';
import {
  isLidJid,
  isProbableLidNumber,
  resolveSenderJid,
  resolveSenderNumber,
  toLidJid
} from '../server/lib/whatsapp-sender.js';

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

describe('deteksi identitas LID', () => {
  it('mengenali JID LID', () => {
    expect(isLidJid('123456789012345@lid')).toBe(true);
    expect(isLidJid('123456789012345@hosted.lid')).toBe(true);
    expect(isLidJid('6281234567890@s.whatsapp.net')).toBe(false);
    expect(isLidJid(null)).toBe(false);
  });

  it('membedakan nomor LID dari nomor HP tersimpan', () => {
    expect(isProbableLidNumber('31357673721888')).toBe(true);
    expect(isProbableLidNumber('64441907433560')).toBe(true);
    expect(isProbableLidNumber('6281234567890')).toBe(false);
    expect(isProbableLidNumber('081234567890')).toBe(false);
    expect(isProbableLidNumber('123')).toBe(false);
    expect(isProbableLidNumber(null)).toBe(false);
  });

  it('membentuk JID LID yang sah', () => {
    expect(toLidJid('31357673721888')).toBe('31357673721888@lid');
    expect(toLidJid('31357673721888@lid')).toBe('31357673721888@lid');
  });
});
