import { describe, expect, it } from 'vitest';
import { checkCollector, qtyStep } from '@/lib/rental-form';

const ok = { name: '  Abena   Owusu ', phone: '024 412 3456', email: ' Abena@Example.COM ', occasion: 'Wedding' };

describe('checkCollector', () => {
  it('tidies the name, normalises phone and email, and keeps a known occasion', () => {
    expect(checkCollector(ok)).toEqual({
      ok: true,
      value: { name: 'Abena Owusu', phoneE164: '+233244123456', email: 'abena@example.com', occasion: 'Wedding' },
    });
  });

  it('treats a blank email as none and an unknown occasion as Other', () => {
    const r = checkCollector({ ...ok, email: '   ', occasion: 'Rave' });
    expect(r.ok && r.value).toMatchObject({ email: null, occasion: 'Other' });
  });

  it('explains each problem in the prototype’s words', () => {
    expect(checkCollector({ name: 'A', phone: '12', email: 'not-an-email', occasion: 'Wedding' })).toEqual({
      ok: false,
      errors: {
        name: 'Who will collect? We check the name at the desk.',
        phone: "That doesn't look like a Ghana mobile number. Try 055 555 7090.",
        email: 'Check the email address.',
      },
    });
    const long = checkCollector({ ...ok, name: 'x'.repeat(121) });
    expect(long.ok ? null : long.errors.name).toBe('That name is a little long. Use 120 characters or fewer.');
  });
});

describe('qtyStep', () => {
  it('moves big stock in tens and the rest one at a time', () => {
    expect([qtyStep(12), qtyStep(99), qtyStep(100), qtyStep(400)]).toEqual([1, 1, 10, 10]);
  });
});
