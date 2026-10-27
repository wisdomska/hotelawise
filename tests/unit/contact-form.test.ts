import { describe, expect, it } from 'vitest';
import { checkContact } from '@/lib/contact-form';

const base = { subject: 'Reservation', name: 'Ama Owusu', dialCode: '+233', phone: '055 555 7090', email: '', message: 'We land at 2am.' };

describe('contact form rules', () => {
  it('accepts a complete message and normalises the phone', () => {
    const r = checkContact(base);
    expect(r).toEqual({
      ok: true,
      value: { subject: 'Reservation', name: 'Ama Owusu', phone: '+233555557090', email: null, message: 'We land at 2am.' },
    });
  });

  it('uses the prototype’s wording for each mistake', () => {
    const r = checkContact({ subject: 'Spam', name: ' ', dialCode: '+233', phone: '12', email: 'nope', message: 'hi' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      subject: 'Pick a subject.',
      name: 'We’d like to know who we’re talking to.',
      phone: 'Enter a Ghana mobile number, like 0555557090.',
      email: 'Check the email address.',
      message: 'A few more words, please.',
    });
  });

  it('checks other countries loosely and rejects unknown dial codes', () => {
    expect(checkContact({ ...base, dialCode: '+44', phone: '07700 900123' }).ok).toBe(true);
    const r = checkContact({ ...base, dialCode: '+999', phone: '12345678' });
    expect(r.ok ? null : r.errors.phone).toBe('Enter a valid phone number.');
  });

  it('keeps an optional email, lower-cased', () => {
    const r = checkContact({ ...base, email: ' Ama@Example.COM ' });
    expect(r.ok && r.value.email).toBe('ama@example.com');
  });

  it('limits name, email and message length', () => {
    expect(checkContact({ ...base, name: 'x'.repeat(121), email: `${'a'.repeat(250)}@x.com`, message: 'y'.repeat(4001) })).toEqual({
      ok: false,
      errors: {
        name: 'That name is a little long. Use 120 characters or fewer.',
        email: 'Check the email address.',
        message: 'That’s a long one. Keep it under 4,000 characters, or call us.',
      },
    });
  });
});
