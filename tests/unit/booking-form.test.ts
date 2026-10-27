import { describe, expect, it } from 'vitest';
import { checkGuest, checkMomo } from '@/lib/booking-form';

const base = { name: 'Kofi Mensah', dialCode: '+233', phone: '024 412 3456', email: '', arrival: 'Not sure yet', notes: '' };

describe('booking form', () => {
  it('cleans a good guest and reads the arrival hour', () => {
    expect(checkGuest({ ...base, arrival: '23:00', email: ' Kofi@Mail.com ' })).toEqual({
      ok: true,
      value: { name: 'Kofi Mensah', phoneE164: '+233244123456', email: 'kofi@mail.com', arrivalHour: 23, requests: '' },
    });
    expect(checkGuest(base)).toMatchObject({ ok: true, value: { arrivalHour: null } });
  });

  it('uses the prototype wording', () => {
    expect(checkGuest({ ...base, name: 'K', phone: '123', email: 'x@' })).toEqual({
      ok: false,
      errors: {
        name: 'We’ll need a name for the key.',
        phone: 'Enter a Ghana mobile number, like 0555557090.',
        email: 'Check the email address.',
      },
    });
    expect(checkGuest({ ...base, dialCode: '+44', phone: '12' })).toMatchObject({
      ok: false,
      errors: { phone: 'Enter a valid phone number.' },
    });
  });

  it('wants a Ghana number for the MoMo prompt', () => {
    expect(checkMomo('0244123456')).toEqual({ ok: true, e164: '+233244123456' });
    expect(checkMomo('12')).toEqual({ ok: false, error: 'Enter the MoMo number that should get the prompt.' });
  });

  it('limits name and email length', () => {
    const r = checkGuest({ ...base, name: 'x'.repeat(121), email: `${'a'.repeat(250)}@x.com` });
    expect(r).toEqual({
      ok: false,
      errors: { name: 'That name is a little long. Use 120 characters or fewer.', email: 'Check the email address.' },
    });
  });
});
