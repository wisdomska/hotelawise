'use server';
// Settings › every tab, and revealing the Paystack keys.
import { done } from '@/lib/admin/result';
import { act } from '@/server/admin/act';
import { paystackKeys, saveSettings } from '@/server/admin/settings';
import type { SettingKey } from '@/server/content/defaults';
import { audit } from '@/server/services/audit';

const SECTION_KEYS: Record<string, SettingKey[]> = {
  'Contact details': ['contact.phone', 'contact.phone2', 'contact.phone3', 'contact.whatsapp', 'contact.email', 'contact.address'],
  'Stay & services': [
    'hotel.checkIn',
    'hotel.checkOut',
    'hotel.breakfastHours',
    'fees.breakfastPerGuestNightPesewas',
    'fees.roomServicePesewas',
  ],
  Payments: ['booking.payAtHotel', 'booking.depositPercent'],
  'Taxes & levies': ['tax.included', 'tax.vatPercent', 'tax.nhilPercent', 'tax.getfundPercent', 'tax.tourismPercent'],
  'Booking confirmation': ['notify.smsTemplate'],
  Security: ['admin.sessionTimeoutMinutes', 'security.requireTwoFactor'],
};

export async function saveSettingsAction(section: string, patch: Record<string, string | boolean>) {
  const keys = SECTION_KEYS[section];
  if (!keys) return { ok: false as const, error: 'That form doesn’t exist.' };
  const site = keys.some((k) => !k.startsWith('admin.') && !k.startsWith('security.'));
  return act(
    'settings.edit',
    async (tx, who) => {
      await saveSettings(tx, who, section, patch, keys);
      const twoFa = patch['security.requireTwoFactor'];
      return done(
        `${section} saved.`,
        twoFa === true
          ? 'Super Admins set up two-step sign-in the next time they sign in.'
          : 'admin.sessionTimeoutMinutes' in patch
            ? 'Applies from the next page load.'
            : site
              ? 'Live on the website now.'
              : undefined,
      );
    },
    { site },
  );
}

export async function revealKeysAction(password: string) {
  return act(
    'settings.keys.reveal',
    async (tx, who) => {
      await audit(tx, { actor: who, action: 'Revealed keys', entity: 'settings', target: 'Paystack keys' });
      return done('Keys shown.', 'They hide again when you leave the page.', paystackKeys(true));
    },
    { password },
  );
}
