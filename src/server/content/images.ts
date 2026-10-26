// The hotel's real photos, with the renames from Handoff.md (several files in the
// zip are named after the wrong subject). `id` is the Cloudinary public ID the
// import script uploads to; `file` is the source under design/uploads/.
export const CLOUDINARY_FOLDER = 'hotel-a-wise';

export type ImageAsset = {
  id: string;
  file: string;
  alt: string;
  /** Always show the "Concept image" label (not built yet). */
  concept?: boolean;
  /** Flag in the admin: must be replaced before launch. */
  replaceBeforeLaunch?: string;
};

const SRC = 'design/uploads/Hotel-A-Wise-Images-web';

export const IMAGES = {
  // Renamed (Handoff.md › Seed assumptions)
  executiveBedroom: {
    id: 'rooms/executive-bedroom',
    file: `${SRC}/01-hero-and-exterior/hero-front-desk.jpg`,
    alt: 'Executive bedroom with a large double bed, ceiling fan and window onto the trees',
  },
  frontDesk: {
    id: 'spaces/front-desk',
    file: `${SRC}/01-hero-and-exterior/hotel-view-reception.jpg`,
    alt: 'The front desk on the ground floor, staffed day and night',
  },
  groundFloorLounge: {
    id: 'spaces/ground-floor-lounge',
    file: `${SRC}/01-hero-and-exterior/contact-hero.jpg`,
    alt: 'The ground-floor lounge',
  },
  corridor: { id: 'spaces/corridor', file: `${SRC}/01-hero-and-exterior/gallery-events-hero.jpg`, alt: 'Corridor on the first floor' },
  compoundWedding: {
    id: 'events/compound-wedding',
    file: `${SRC}/05-services-and-rentals/private-events.jpg`,
    alt: 'The compound set for a wedding under white canopies',
  },
  // Exterior
  compound: { id: 'spaces/compound', file: `${SRC}/01-hero-and-exterior/hotel-compound.jpg`, alt: 'The outdoor event compound' },
  // Rooms
  standardRoom: { id: 'rooms/standard-room', file: `${SRC}/02-rooms/standard-room.jpg`, alt: 'Standard Room, full view' },
  executiveRoom: { id: 'rooms/executive-room', file: `${SRC}/02-rooms/executive-room-1.jpg`, alt: 'Executive Room with desk and window' },
  executiveLinen: {
    id: 'rooms/executive-linen',
    file: `${SRC}/02-rooms/executive-room-2-customised-sheets.jpg`,
    alt: 'A-Wise customised pillow label',
  },
  vipRoom: { id: 'rooms/vip-room', file: `${SRC}/02-rooms/vip-room-1.jpg`, alt: 'VIP Room with mini fridge' },
  vipRoomDetail: { id: 'rooms/vip-room-detail', file: `${SRC}/02-rooms/vip-room-2.jpg`, alt: 'VIP Room bed and carved door' },
  doubleRoom: { id: 'rooms/double-room', file: `${SRC}/02-rooms/double-bed-room.jpg`, alt: 'Double Room with two beds' },
  // Bathrooms
  standardBathroom: {
    id: 'bathrooms/standard',
    file: `${SRC}/03-bathrooms/standard-bathroom.jpg`,
    alt: 'Standard bathroom with glass shower',
  },
  executiveBathroom: {
    id: 'bathrooms/executive',
    file: `${SRC}/03-bathrooms/executive-bathroom.jpg`,
    alt: 'Executive bathroom, rain shower and LED mirror',
  },
  vipBathroom: { id: 'bathrooms/vip', file: `${SRC}/03-bathrooms/vip-bathroom.jpg`, alt: 'VIP bathroom' },
  vipRainShower: { id: 'bathrooms/vip-rain-shower', file: `${SRC}/03-bathrooms/vvip-bathroom.jpg`, alt: 'VIP bathroom, rain shower' },
  // Spaces
  conferenceRoom1: {
    id: 'spaces/conference-room-1',
    file: `${SRC}/04-spaces/conference-room-angle-1.jpg`,
    alt: 'Conference room, second floor',
  },
  conferenceRoom2: {
    id: 'spaces/conference-room-2',
    file: `${SRC}/04-spaces/conference-room-angle-2.jpg`,
    alt: 'Second-floor conference room with long tables and blue chairs',
  },
  firstFloorPorch: { id: 'spaces/first-floor-porch', file: `${SRC}/04-spaces/first-floor-porch.jpg`, alt: 'First-floor porch' },
  secondFloorPorch: { id: 'spaces/second-floor-porch', file: `${SRC}/04-spaces/second-floor-porch.jpg`, alt: 'Second-floor porch' },
  firstFloorReceptionEvent: {
    id: 'events/first-floor-reception',
    file: `${SRC}/04-spaces/first-floor-reception-event.jpg`,
    alt: 'First-floor reception, event set-up',
  },
  secondFloorReceptionEvent1: {
    id: 'events/second-floor-reception-1',
    file: `${SRC}/04-spaces/second-floor-reception-event-1.jpg`,
    alt: 'Second-floor reception, dressed for dinner',
  },
  secondFloorReceptionEvent2: {
    id: 'events/second-floor-reception-2',
    file: `${SRC}/04-spaces/second-floor-reception-event-2.jpg`,
    alt: 'Second-floor reception, round tables',
  },
  staircase: { id: 'spaces/staircase', file: `${SRC}/04-spaces/staircase.jpg`, alt: 'Staircase' },
  hallway: { id: 'spaces/hallway', file: `${SRC}/04-spaces/spacious-hallway.jpg`, alt: 'The hallway outside the rooms' },
  // Services and rentals
  canopy: { id: 'rentals/canopy', file: `${SRC}/05-services-and-rentals/canopy-rental.jpg`, alt: 'White canopy on a steel frame' },
  table: { id: 'rentals/table', file: `${SRC}/05-services-and-rentals/table-rental.jpg`, alt: 'Foldable event table' },
  foldableChair: {
    id: 'rentals/foldable-chair',
    file: `${SRC}/05-services-and-rentals/plastic-chair-rental.jpg`,
    alt: 'Blue foldable chair with padded seat',
  },
  bedAndBreakfast: {
    id: 'services/breakfast-dish',
    file: `${SRC}/05-services-and-rentals/bed-and-breakfast.jpg`,
    alt: 'Breakfast, served 7 to 10am',
  },
  // Coming soon (concept images)
  breakfastConcept: {
    id: 'coming-soon/breakfast',
    file: `${SRC}/06-coming-soon/breakfast.jpg`,
    alt: 'Concept image: Breakfast, an all-day West African dining concept',
    concept: true,
  },
  summerHutConcept: {
    id: 'coming-soon/summer-hut',
    file: `${SRC}/06-coming-soon/summer-hut.jpg`,
    alt: 'Concept image: Summer Hut, an open-air sundowner lounge',
    concept: true,
    replaceBeforeLaunch: 'This concept image shows a pool. Hotel A-Wise has no pool, so replace it before launch.',
  },
} as const satisfies Record<string, ImageAsset>;

export type ImageKey = keyof typeof IMAGES;

export function cloudinaryId(key: ImageKey): string {
  return `${CLOUDINARY_FOLDER}/${IMAGES[key].id}`;
}

/** Content › Photos slots (prototype IM() keys) and their default photo. */
export const PHOTO_SLOTS: Record<string, ImageKey> = {
  hero: 'executiveBedroom',
  events: 'compoundWedding',
  testimonial: 'executiveLinen',
  footer: 'hallway',
  'room.STD': 'standardRoom',
  'room.EXE': 'executiveRoom',
  'room.VIP': 'vipRoom',
  'room.DBL': 'doubleRoom',
  'room.STD.0': 'standardRoom',
  'room.STD.1': 'standardBathroom',
  'room.STD.2': 'hallway',
  'room.EXE.0': 'executiveRoom',
  'room.EXE.1': 'executiveLinen',
  'room.EXE.2': 'executiveBathroom',
  'room.VIP.0': 'vipRoom',
  'room.VIP.1': 'vipRoomDetail',
  'room.VIP.2': 'vipBathroom',
  'room.VIP.3': 'vipRainShower',
  'room.DBL.0': 'doubleRoom',
  'room.DBL.1': 'standardBathroom',
  'fac.0': 'frontDesk',
  'fac.1': 'bedAndBreakfast',
  'fac.2': 'vipRoomDetail',
  'fac.3': 'firstFloorPorch',
  'fac.4': 'secondFloorReceptionEvent1',
  'fac.5': 'conferenceRoom1',
  'fac.6': 'compoundWedding',
  'fac.7': 'vipBathroom',
  'rental.canopies': 'canopy',
  'rental.chairs': 'foldableChair',
  'rental.tables': 'table',
  'venue.0': 'compoundWedding',
  'venue.1': 'conferenceRoom2',
  'coming.breakfast': 'breakfastConcept',
  'coming.summer_hut': 'summerHutConcept',
};

/** Gallery order and categories, from the prototype seed (store.js). */
export const GALLERY: { key: ImageKey; category: 'Rooms' | 'Bathrooms' | 'Spaces' | 'Events'; alt?: string; published?: false }[] = [
  { key: 'standardRoom', category: 'Rooms', alt: 'Standard Room' },
  { key: 'vipBathroom', category: 'Bathrooms', alt: 'VIP bathroom' },
  { key: 'secondFloorPorch', category: 'Spaces', alt: 'Second-floor porch' },
  { key: 'secondFloorReceptionEvent1', category: 'Events', alt: 'Second-floor reception, dressed for dinner' },
  { key: 'vipRoom', category: 'Rooms', alt: 'VIP Room' },
  { key: 'hallway', category: 'Spaces', alt: 'The hallway' },
  { key: 'compoundWedding', category: 'Events', alt: 'Wedding in the compound' },
  { key: 'executiveRoom', category: 'Rooms', alt: 'Executive Room' },
  { key: 'executiveBathroom', category: 'Bathrooms', alt: 'Executive bathroom' },
  { key: 'firstFloorPorch', category: 'Spaces', alt: 'First-floor porch' },
  { key: 'conferenceRoom1', category: 'Spaces', alt: 'Conference room' },
  { key: 'doubleRoom', category: 'Rooms', alt: 'Double Room' },
  { key: 'firstFloorReceptionEvent', category: 'Events', alt: 'First-floor reception, event set-up' },
  { key: 'standardBathroom', category: 'Bathrooms', alt: 'Standard bathroom' },
  { key: 'staircase', category: 'Spaces', alt: 'Staircase' },
  { key: 'vipRoomDetail', category: 'Rooms', alt: 'VIP Room, detail' },
  { key: 'secondFloorReceptionEvent2', category: 'Events', alt: 'Second-floor reception, round tables' },
  { key: 'vipRainShower', category: 'Bathrooms', alt: 'VIP rain shower' },
  { key: 'compound', category: 'Spaces', alt: 'The compound' },
  // Seeded without a caption, so it stays unpublished until one is written (prototype store.js).
  { key: 'conferenceRoom2', category: 'Spaces', alt: '', published: false },
  { key: 'executiveLinen', category: 'Rooms', alt: 'Our customised linen' },
  { key: 'frontDesk', category: 'Spaces', alt: 'Front desk' },
  { key: 'corridor', category: 'Spaces', alt: 'Corridor, first floor' },
  { key: 'executiveBedroom', category: 'Rooms', alt: 'Executive Room, morning light' },
];
