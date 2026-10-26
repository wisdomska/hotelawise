// Contact details as every call, WhatsApp and email link on the site uses them
// (Settings › Contact feeds them all).
import { formatPhone } from '@/lib/phone';
import { setting, type SiteData } from './site-data';

export type Contact = {
  phone: string;
  tel: string;
  phone2: string;
  tel2: string;
  phone3: string;
  tel3: string;
  waNum: string;
  wa: string;
  email: string;
  mail: string;
  address: string;
  mapsSearch: string;
  mapsDirections: string;
};

export function contactFrom(data: SiteData): Contact {
  const phone = setting<string>(data, 'contact.phone');
  const phone2 = setting<string>(data, 'contact.phone2');
  const phone3 = setting<string>(data, 'contact.phone3');
  const wa = setting<string>(data, 'contact.whatsapp').replace(/^\+/, '');
  const email = setting<string>(data, 'contact.email');
  const pin = setting<{ lat: number; lng: number }>(data, 'contact.mapPin');
  return {
    phone: formatPhone(phone),
    tel: `tel:${phone}`,
    phone2: formatPhone(phone2),
    tel2: `tel:${phone2}`,
    phone3: formatPhone(phone3),
    tel3: `tel:${phone3}`,
    waNum: wa,
    wa: `https://wa.me/${wa}`,
    email,
    mail: `mailto:${email}`,
    address: setting<string>(data, 'contact.address'),
    mapsSearch: `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`,
    mapsDirections: `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`,
  };
}
