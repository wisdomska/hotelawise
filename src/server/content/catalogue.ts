// The real catalogue (spec facts, prototype copy). Seeds the database and is the
// site's fallback when the database can't be reached (e.g. at build time).
// Prices are in pesewas.
export const GHS = (n: number) => Math.round(n * 100);

// Hotel facts from the spec; descriptions and amenities from the prototype.
export const ROOM_TYPES = [
  {
    code: 'STD',
    name: 'Standard',
    beds: '1 queen bed',
    sleeps: 2,
    bathroom: 'Private shower room',
    bestFor: 'Solo trips, short stays',
    position: 0,
    amenities: [
      'Air-conditioning and ceiling fan',
      'Wi-Fi',
      'Flat-screen TV',
      'Work desk and chair',
      'Private bathroom, hot shower',
      'A-Wise customised linen',
    ],
    variants: [{ code: 'STD', displayCode: 'STD', name: 'Standard', price: 150 }],
    rooms: { STD: ['101', '102', '103', '104', '105', '106'] },
  },
  {
    code: 'EXE',
    name: 'Executive',
    beds: 'Large double bed',
    sleeps: 2,
    bathroom: 'Upgraded rain shower',
    bestFor: 'Business trips, longer stays',
    position: 1,
    amenities: [
      'Air-conditioning and ceiling fan',
      'Wi-Fi',
      'Flat-screen TV',
      'Work desk facing the window',
      'Rain shower, LED mirror',
      'A-Wise customised linen',
    ],
    variants: [
      { code: 'EXE', displayCode: 'EXE', name: 'Executive', price: 200 },
      { code: 'EXE_PLUS', displayCode: 'EXE+', name: 'Executive Plus', price: 250, note: 'More floor space, same upgraded bathroom' },
    ],
    rooms: { EXE: ['201', '202', '205'], EXE_PLUS: ['203', '204'] },
  },
  {
    code: 'VIP',
    name: 'VIP',
    beds: 'Large double bed',
    sleeps: 2,
    bathroom: 'VIP bathroom',
    bestFor: 'Anniversaries, treating yourself',
    position: 2,
    amenities: [
      'Air-conditioning',
      'Wi-Fi',
      'Flat-screen TV',
      'Mini fridge',
      'VIP bathroom, rain shower, LED mirror',
      'A-Wise customised linen',
    ],
    variants: [{ code: 'VIP', displayCode: 'VIP', name: 'VIP', price: 300 }],
    rooms: { VIP: ['206', '207', '208'] },
  },
  {
    code: 'DBL',
    name: 'Double',
    beds: '2 double beds',
    sleeps: 4,
    bathroom: 'Private bathroom',
    bestFor: 'Families, friends sharing',
    position: 3,
    amenities: [
      'Air-conditioning and ceiling fan',
      'Wi-Fi',
      'Flat-screen TV',
      'Two double beds',
      'Desk and two chairs',
      'Private bathroom, hot shower',
    ],
    variants: [{ code: 'DBL', displayCode: 'DBL', name: 'Double', price: 400 }],
    rooms: { DBL: ['107', '108'] },
  },
] as const;

export const RENTAL_ITEMS = [
  { slug: 'canopy', name: 'Canopy', spec: '10 × 10 ft, white, steel frame', price: 250, deposit: 100, stock: 12, image: 'canopy' },
  { slug: 'longtable', name: 'Long table', spec: '6 ft, seats 6–8, foldable', price: 40, deposit: 20, stock: 30, image: 'table' },
  { slug: 'shorttable', name: 'Short table', spec: '4 ft, seats 4, foldable', price: 25, deposit: 15, stock: 40, image: 'table' },
  {
    slug: 'foldchair',
    name: 'Foldable chair',
    spec: 'Padded seat, blue, steel legs',
    price: 5,
    deposit: 2,
    stock: 300,
    image: 'foldableChair',
  },
  { slug: 'chair', name: 'Regular plastic chair', spec: 'Stackable, blue, with arms', price: 3, deposit: 1, stock: 400, image: null },
  { slug: 'cloth', name: 'Tablecloth', spec: 'White, fits long tables', price: 15, deposit: 5, stock: 60, image: null, custom: true },
  {
    slug: 'cover',
    name: 'Chair cover',
    spec: 'White stretch cover with sash',
    price: 4,
    deposit: 1,
    stock: 200,
    image: null,
    custom: true,
  },
] as const;

export const BUNDLES: { name: string; pctOff: number; description: string; items: Record<string, number> }[] = [
  {
    name: 'Wedding pack',
    pctOff: 10,
    description: '4 canopies, 100 foldable chairs, 10 long tables.',
    items: { canopy: 4, foldchair: 100, longtable: 10 },
  },
  {
    name: 'Funeral pack',
    pctOff: 10,
    description: '6 canopies, 200 regular chairs, 10 long tables.',
    items: { canopy: 6, chair: 200, longtable: 10 },
  },
  {
    name: 'Party pack',
    pctOff: 8,
    description: '2 canopies, 50 regular chairs, 6 short tables.',
    items: { canopy: 2, chair: 50, shorttable: 6 },
  },
];

export const VENUES = [
  {
    slug: 'compound',
    name: 'Event compound',
    label: '100–200 guests',
    capacityMin: 100,
    capacityMax: 200,
    hire: 2500,
    image: 'compoundWedding' as const,
    position: 0,
    description:
      "Gated, on our own grounds, with the hotel right there for guests who'd rather not drive home. Pair it with our canopies and chairs.",
  },
  {
    slug: 'conference',
    name: 'Conference room',
    label: '2nd floor',
    capacityMin: 10,
    capacityMax: 60,
    hire: 800,
    image: 'conferenceRoom2' as const,
    position: 1,
    description: 'Big windows, ceiling fans, AC and tables you can arrange how you like. Meetings, trainings, small receptions.',
  },
];

export const FAQS: [string, string][] = [
  [
    'Can I really check in at 3am?',
    "Yes. The front desk is staffed 24 hours a day, 7 days a week, holidays included. If you know you'll land late, add your arrival time when you book so we have the room ready and the light on.",
  ],
  [
    'What are check-in and check-out times?',
    "Rooms are ready from 2pm and check-out is by 12 noon. Need it earlier or later? Ask the desk. If the room is free, we'll usually make it work.",
  ],
  [
    'Is breakfast included?',
    'Breakfast is served 7 to 10am daily and can be added to any booking for GHS 50 per guest per day. Tick the box when you book, or ask at the desk.',
  ],
  ['Do you do room service?', 'Yes, for an extra GHS 20 on top of whatever you order.'],
  [
    'How do I pay?',
    'Online with Mobile Money (MTN, Telecel, AirtelTigo) or Visa and Mastercard through Paystack. You can pay in full or pay a deposit. Cash and MoMo are also fine at the desk.',
  ],
  [
    'What is the cancellation policy?',
    'Cancel free of charge up to 48 hours before check-in for a full refund. Inside 48 hours we keep the deposit. No-shows are charged the first night.',
  ],
  [
    'Can I rent chairs and canopies without staying?',
    "Absolutely. Reserve online for your dates and collect from Wisepak Lane. Pay online, or at the desk when you pick up. We don't deliver yet.",
  ],
  [
    'Can I host my event at A-Wise?',
    "Yes. The outdoor compound takes 100 to 200 guests and the second-floor conference room suits meetings and small receptions. Send an enquiry and we'll call you back with a quote.",
  ],
];

// Offers from the prototype, seeded paused until the hotel confirms them.
export const RATE_RULES = [
  {
    name: 'Christmas & New Year',
    kind: 'range' as const,
    monthDayFrom: '12-20',
    monthDayTo: '01-02',
    appliesTo: null,
    direction: 'up' as const,
    unit: 'pct' as const,
    amount: 15,
  },
  { name: 'Weekend nights', kind: 'weekend' as const, appliesTo: ['DBL'], direction: 'up' as const, unit: 'ghs' as const, amount: GHS(30) },
  {
    name: 'Long stay',
    kind: 'longstay' as const,
    minNights: 7,
    appliesTo: null,
    direction: 'down' as const,
    unit: 'pct' as const,
    amount: 10,
  },
  {
    name: 'Independence Day',
    kind: 'range' as const,
    monthDayFrom: '03-06',
    monthDayTo: '03-06',
    appliesTo: null,
    direction: 'up' as const,
    unit: 'pct' as const,
    amount: 10,
  },
];
export const PROMOS = [
  { code: 'AWISE3', type: 'breakfast' as const, value: 0, minNights: 3 },
  { code: 'NIGHTOWL', type: 'ghs' as const, value: GHS(20) },
];
