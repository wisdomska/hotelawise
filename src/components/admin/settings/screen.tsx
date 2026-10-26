'use client';
// Settings from Admin.dc.html: contact, stay & services, payments (with the
// Paystack keys, shown masked), taxes, the confirmation message and security.
import { useState } from 'react';
import { revealKeysAction, saveSettingsAction } from '@/app/admin/(app)/settings/actions';
import { useAdmin } from '../context';
import { FieldGrid, ModalFrame, Note, PasswordField } from '../modal';
import { PageHeader, Tabs, useTab } from '../page-parts';
import { SettingsForm, type FormField } from '../settings-form';
import { mono, panel } from '../ui';
import { useAction } from '../use-action';

type Values = Record<string, string | boolean>;
type TextExtra = { mono?: boolean; wide?: boolean; hint?: string; placeholder?: string; type?: 'text' | 'email' | 'tel' };
type Keys = { public: string; secret: string; mode: string };

const TABS = ['Contact', 'Stay & services', 'Payments', 'Taxes', 'Messages', 'Security'] as const;

export function SettingsScreen({
  values,
  readOnly,
  canReveal,
  keys,
}: {
  values: Values;
  readOnly: boolean;
  canReveal: boolean;
  keys: Keys;
}) {
  const [t, setT] = useTab(TABS, 'Contact');
  const form = (title: string, note: string, fields: FormField[]) => (
    <SettingsForm
      key={title}
      title={title}
      note={readOnly ? `${note} Read only: ask a Super Admin to change these.`.trim() : note}
      fields={fields}
      values={Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']))}
      readOnly={readOnly}
      save={(patch) => saveSettingsAction(title, patch)}
    />
  );
  const txt = (key: string, label: string, extra: TextExtra = {}): FormField => ({ key, label, kind: 'text', ...extra });
  return (
    <>
      <PageHeader title="Settings" sub="How the hotel runs, and what guests see." />
      <Tabs list={TABS} cur={t} set={setT} label="Settings sections" />
      {t === 'Contact' &&
        form('Contact details', 'Shown across the website, and on confirmations and receipts.', [
          txt('contact.phone', 'Reception phone', { mono: true, type: 'tel' }),
          txt('contact.phone2', 'Second phone', { mono: true, type: 'tel' }),
          txt('contact.phone3', 'Third phone', { mono: true, type: 'tel' }),
          txt('contact.whatsapp', 'WhatsApp number', { mono: true, type: 'tel', hint: 'The number guests message, e.g. 0555 557 090.' }),
          txt('contact.email', 'Email', { type: 'email' }),
          txt('contact.address', 'Address', { wide: true }),
        ])}
      {t === 'Stay & services' &&
        form('Stay & services', 'Breakfast and room service prices update the website and checkout.', [
          txt('hotel.checkIn', 'Check-in from', { mono: true, placeholder: '14:00' }),
          txt('hotel.checkOut', 'Check-out by', { mono: true, placeholder: '12:00' }),
          txt('hotel.breakfastHours', 'Breakfast hours', { mono: true }),
          txt('fees.breakfastPerGuestNightPesewas', 'Breakfast (GHS per guest per day)', { mono: true }),
          txt('fees.roomServicePesewas', 'Room service fee (GHS)', { mono: true }),
        ])}
      {t === 'Payments' && (
        <>
          {form('Payments', 'Turning off “Pay at the hotel” removes that option from online checkout.', [
            { key: 'booking.payAtHotel', label: 'Let guests pay at the hotel', kind: 'toggle' },
            txt('booking.depositPercent', 'Room deposit (%)', {
              mono: true,
              hint: 'What guests pay online to hold a room when they choose a deposit.',
            }),
          ])}
          <PaystackKeys keys={keys} canReveal={canReveal} />
        </>
      )}
      {t === 'Taxes' &&
        form('Taxes & levies', 'Ghana VAT, NHIL, GETFund and Tourism levy.', [
          { key: 'tax.included', label: 'Prices include taxes', kind: 'toggle' },
          txt('tax.vatPercent', 'VAT (%)', { mono: true }),
          txt('tax.nhilPercent', 'NHIL (%)', { mono: true }),
          txt('tax.getfundPercent', 'GETFund (%)', { mono: true }),
          txt('tax.tourismPercent', 'Tourism levy (%)', { mono: true }),
        ])}
      {t === 'Messages' &&
        form('Booking confirmation', 'Sent by SMS and WhatsApp. You can use {first_name} {room} {check_in} {check_out} {ref} {phone}', [
          { key: 'notify.smsTemplate', label: 'Message', kind: 'area', hint: 'Keep it under 160 characters to send as one SMS.' },
        ])}
      {t === 'Security' &&
        form('Security', '', [
          txt('admin.sessionTimeoutMinutes', 'Sign out after (minutes idle)', { mono: true, hint: 'From 5 to 480 minutes.' }),
          {
            key: 'security.requireTwoFactor',
            label: 'Two-step sign-in for Super Admins',
            kind: 'toggle',
            hint: 'When on, Super Admins set up an authenticator app the next time they sign in, and enter a code each time after.',
          },
        ])}
    </>
  );
}

function PaystackKeys({ keys, canReveal }: { keys: Keys; canReveal: boolean }) {
  const { openModal } = useAdmin();
  const [shown, setShown] = useState<Keys | null>(null);
  const k = shown ?? keys;
  const row = (label: string, value: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--mute)' }}>
      {label}
      <input
        readOnly
        value={value}
        style={{
          height: 40,
          padding: '0 10px',
          borderRadius: 8,
          border: '1px solid var(--line2)',
          background: 'var(--lane)',
          color: 'var(--ink)',
          fontFamily: mono,
          fontSize: 13,
        }}
      />
    </label>
  );
  return (
    <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Paystack keys</h2>
          <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--mute)' }}>
            Hidden for security. They’re kept with the hosting settings, so changing them is a job for whoever looks after the website.
          </span>
        </div>
        {canReveal && !shown && (
          <button
            type="button"
            onClick={() => openModal(<RevealModal onShown={setShown} />)}
            style={{
              height: 38,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'transparent',
              fontSize: 13,
            }}
          >
            Reveal
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {row('Mode', k.mode)}
        {row('Public key', k.public)}
        {row('Secret key', k.secret)}
      </div>
    </section>
  );
}

function RevealModal({ onShown }: { onShown: (k: Keys) => void }) {
  const { run, busy, errors } = useAction();
  const [pw, setPw] = useState('');
  return (
    <ModalFrame
      title="Reveal the Paystack keys"
      sub="Enter your password to see them. The reveal is logged."
      confirm="Reveal"
      busy={busy}
      onConfirm={async () => {
        const r = await run(() => revealKeysAction(pw));
        if (r.ok && r.data) onShown(r.data as Keys);
      }}
    >
      <FieldGrid>
        <PasswordField value={pw} onChange={setPw} err={errors.pw} hint="Your own sign-in password." wide />
      </FieldGrid>
      <Note>The secret key never leaves the server in full; you see enough to tell which key is in use.</Note>
    </ModalFrame>
  );
}
