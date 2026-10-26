import { describe, expect, it } from 'vitest';
import { formatPhone, formatPhoneLocal, parseGhanaPhone, parseInternationalPhone, telHref, whatsappHref } from '@/lib/phone';

describe('phone', () => {
  it.each([
    ['055 555 7090', '+233555557090'],
    ['+233 55 555 7090', '+233555557090'],
    ['233555557090', '+233555557090'],
    ['00233 24 412 3456', '+233244123456'],
    ['244123456', '+233244123456'],
    ['030 222 9810', '+233302229810'],
  ])('normalises %s', (input, e164) => {
    expect(parseGhanaPhone(input)).toEqual({ ok: true, e164 });
  });
  it.each(['12345', '011 111 1111', 'call me', '+233 99 123 4567'])('rejects %s', (input) => {
    expect(parseGhanaPhone(input).ok).toBe(false);
  });
  it('handles other countries', () => {
    expect(parseInternationalPhone('07700 900123', '+44')).toEqual({ ok: true, e164: '+447700900123' });
    expect(parseInternationalPhone('+1 415 555 0100', '+1')).toEqual({ ok: true, e164: '+14155550100' });
    expect(parseInternationalPhone('12', '+44').ok).toBe(false);
    expect(parseInternationalPhone('024 412 3456', '+233')).toEqual({ ok: true, e164: '+233244123456' });
  });
  it('formats', () => {
    expect(formatPhone('+233555557090')).toBe('+233 55 555 7090');
    expect(formatPhoneLocal('+233555557090')).toBe('055 555 7090');
    expect(formatPhone('+447700900123')).toBe('+447700900123');
    expect(formatPhoneLocal('+447700900123')).toBe('+447700900123');
    expect(telHref('+233555557090')).toBe('tel:+233555557090');
    expect(whatsappHref('+233555557090')).toBe('https://wa.me/233555557090');
    expect(whatsappHref('+233555557090', 'Hi there')).toBe('https://wa.me/233555557090?text=Hi%20there');
  });
});
