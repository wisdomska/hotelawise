import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { defaultSiteData } = await import('@/server/content/site-data');
const { hotelJsonLd, ldJson, roomJsonLd, shareImage } = await import('@/server/content/seo');

describe('search and share metadata', () => {
  const data = defaultSiteData();

  it('describes the hotel with the same prices and contact details as the site', () => {
    const ld = hotelJsonLd(data);
    expect(ld['@type']).toBe('Hotel');
    expect(ld.priceRange).toBe('GHS 150–GHS 400 per night');
    expect(ld.telephone).toBe('+233555557090');
    expect(ld.address.addressCountry).toBe('GH');
    expect(ld.checkinTime).toBe('14:00');
  });

  it('lists every rate of a room as an offer in cedis', () => {
    const exe = data.rooms.find((r) => r.code === 'EXE')!;
    const ld = roomJsonLd(data, exe);
    expect(ld.offers.map((o) => [o.name, o.price])).toEqual([
      ['Executive', '200.00'],
      ['Executive Plus', '250.00'],
    ]);
    expect(ld.occupancy.maxValue).toBe(2);
  });

  it('uses a 1200×630 Cloudinary crop when a cloud is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'awise');
    expect(shareImage({ id: 'hotel-a-wise/rooms/vip-room', alt: 'VIP', concept: false }).url).toBe(
      'https://res.cloudinary.com/awise/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/hotel-a-wise/rooms/vip-room',
    );
    vi.unstubAllEnvs();
  });

  it('cannot be used to close the script tag', () => {
    expect(ldJson({ q: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});
