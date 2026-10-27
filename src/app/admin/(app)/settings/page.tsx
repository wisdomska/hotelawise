import { SettingsScreen } from '@/components/admin/settings/screen';
import { paystackKeys, settingsForm } from '@/server/admin/settings';
import { can } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const actor = await requirePage('settings.view');
  const values = await settingsForm(await db());
  return (
    <SettingsScreen
      values={values}
      readOnly={!can(actor, 'settings.edit')}
      canReveal={can(actor, 'settings.keys.reveal')}
      keys={paystackKeys(false)}
    />
  );
}
