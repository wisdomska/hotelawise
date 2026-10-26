// Default settings and page copy, from the prototype seed (store.js) and the spec.
// They seed the database, and the site falls back to them when an admin field is
// left blank (Handoff: "Blank fields fall back to the default copy").
// Values marked "confirm" are seed assumptions listed in the README.

export const SEED_SETTINGS = {
  // Contact (Settings › Contact) — feeds every tel:, wa.me and mailto link
  'contact.phone': '+233555557090', // confirm
  'contact.phone2': '+233540120400',
  'contact.phone3': '+233555557033', // confirm
  'contact.whatsapp': '+233555557090',
  'contact.email': 'info@hotelawise.com',
  'contact.address': 'No. 1 Wisepak Lane, New Asofan, Accra',
  'contact.mapPin': { lat: 5.6455136, lng: -0.2869356 },
  // Hours and fees
  'hotel.checkIn': '14:00', // confirm
  'hotel.checkOut': '12:00', // confirm
  'hotel.breakfastHours': '07:00–10:00',
  'fees.breakfastPerGuestNightPesewas': 5000, // confirm
  'fees.roomServicePesewas': 2000,
  // Booking and payment policy
  'booking.depositPercent': 30, // confirm
  'booking.payAtHotel': true,
  'booking.freeCancellationHours': 48, // confirm
  'booking.noShowCharge': 'first_night', // confirm
  'booking.holdMinutes': 15,
  'booking.policyText':
    'Free cancellation up to 48 hours before check-in. Inside 48 hours the deposit is kept. No-shows are charged the first night.',
  // Rentals
  'rentals.deliveryEnabled': false, // DECISIONS D-01
  'rentals.pickupFromHour': 7,
  'rentals.returnByHour': 18,
  'rentals.payAtPickupReleaseHour': 10,
  'rentals.setupFeePesewas': 15000, // venues only (D-03); confirm
  // Taxes (Ghana levies, shown as included in prices) — confirm
  'tax.included': true,
  'tax.vatPercent': 15,
  'tax.nhilPercent': 2.5,
  'tax.getfundPercent': 2.5,
  'tax.tourismPercent': 1,
  // Admin
  'admin.sessionTimeoutMinutes': 30,
  // Notifications
  'notify.smsTemplate':
    "Hi {first_name}, you're booked at Hotel A-Wise: {room}, {check_in} to {check_out}. Ref {ref}. We'll leave the light on. {phone}",
  // Site banner: off until the hotel confirms the offer it advertises
  'banner.enabled': false,
  'banner.text': 'Book 3 nights, get breakfast on us. Until 30 November.',
} as const;

export type SettingKey = keyof typeof SEED_SETTINGS;

export const SEED_CONTENT: Record<string, string> = {
  'home.heroTitle': 'Your gateway to unforgettable memories',
  'home.heroSub': 'Comfortable rooms, a front desk that never closes and honest prices, in New Asofan, Accra.',
  'home.roomsHeading': 'Four room standards, tailored for you',
  'home.overviewHeading': 'An overview of Hotel A-Wise',
  'home.rentalsHeading': 'Rentals for all kinds of events',
  'home.rentalsSub': 'Reserve online. Collect here.',
  'home.spacesHeading': 'Spaces for your needs',
  'home.mapHeading': 'Find your way to us',
  'home.fac.0': 'Front desk, 24/7',
  'home.fac.1': 'Breakfast, 7–10am',
  'home.fac.2': 'Room service',
  'home.fac.3': 'Two porches',
  'home.fac.4': 'Two receptions',
  'home.fac.5': 'Conference room',
  'home.fac.6': 'Event compound',
  'home.fac.7': 'Bathrooms & linen',
  'home.facLine.0': 'Staffed every hour, holidays included.',
  'home.facLine.1': 'Served daily. Add it when you book.',
  'home.facLine.2': 'GHS 20 on top. Worth it at midnight.',
  'home.facLine.3': 'First and second floor. Bring a book.',
  'home.facLine.4': 'One per floor. Dressed up for events on request.',
  'home.facLine.5': 'Second floor, big windows, room for a team.',
  'home.facLine.6': '100 to 200 guests, under our canopies.',
  'home.facLine.7': 'Premium fittings. Sheets with our name on.',
  'pages.roomsIntro': 'Per room, per night. No hidden fees.',
  'pages.galleryIntro': 'Real photos. What you see is what you get.',
  'pages.contactIntro': 'Someone picks up, day or night.',
  'pages.rentIntro':
    'Pick your dates, choose what you need, and reserve it like a room. Collect from No. 1 Wisepak Lane, and pay online now or when you pick up.',
  'pages.venueIntro':
    "Two spaces, quoted per event. Tell us the date and the headcount and we'll call back with a price, usually the same day.",
  // One rule per line (room pages › House rules).
  'rooms.houseRules': [
    'Check-in from 2pm, check-out by 12 noon',
    'Arrive any hour. The desk is staffed 24/7',
    'No smoking indoors (porches are fine)',
    'Quiet hours 10pm to 7am',
    'Valid ID at check-in',
  ].join('\n'),
  'rooms.blurb.STD':
    "Everything you need and nothing you'll pay extra for. A proper queen bed, cold AC, a hot shower and our own pressed linen. Most people book it for one night and stay three.",
  'rooms.blurb.EXE':
    'More room to spread out, a desk that faces the window and an upgraded bathroom with a rain shower. Two tiers, same care. Pick the size that suits the trip.',
  'rooms.blurb.VIP':
    'Premium finishes, a mini fridge, and the VIP bathroom with the good shower. For the anniversary, the promotion, or the night you simply deserve it.',
  'rooms.blurb.DBL':
    "Two double beds, one bill. Built for families, cousins in town for a wedding, or friends who'd rather share than split up.",
};

/** Admin value, or the default copy when the admin left it blank. */
export function withFallback(value: string | null | undefined, key: string): string {
  const v = value?.trim();
  return v ? v : (SEED_CONTENT[key] ?? '');
}
