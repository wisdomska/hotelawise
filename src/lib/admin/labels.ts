// Database values → the words the admin shows (Admin.dc.html spelling).
export const BOOKING_STATUS = {
  held: 'Held',
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  checked_in: 'Checked-in',
  checked_out: 'Checked-out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  expired: 'Expired',
} as const;
export type BookingStatus = keyof typeof BOOKING_STATUS;

/** The filter chips on Room bookings, in the prototype's order. */
export const BOOKING_FILTERS: BookingStatus[] = ['pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];

export const SOURCE = { web: 'Web', phone: 'Phone', walk_in: 'Walk-in', whatsapp: 'WhatsApp' } as const;
export type Source = keyof typeof SOURCE;

export const METHOD = {
  cash: 'Cash',
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  airteltigo: 'AirtelTigo Money',
  pos: 'Card (POS)',
  card: 'Card',
} as const;
export type Method = keyof typeof METHOD;

/** What the desk can take: the prototype's PAY_METHODS. Online card is Paystack only. */
export const DESK_METHODS: Method[] = ['cash', 'mtn', 'telecel', 'airteltigo', 'pos'];

export const RENTAL_STATUS = {
  pending_payment: 'Pending payment',
  reserved: 'Reserved',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected',
  returned: 'Returned',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;
export type RentalStatus = keyof typeof RENTAL_STATUS;

export const ENQUIRY_STAGE = { new: 'New', quoted: 'Quoted', deposit_paid: 'Deposit paid', done: 'Done', lost: 'Lost' } as const;
export type EnquiryStage = keyof typeof ENQUIRY_STAGE;

export const ROOM_STATUS = {
  available: 'Available',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  out_of_order: 'Out of order',
  retired: 'Removed',
} as const;
export type RoomStatus = keyof typeof ROOM_STATUS;

export const REFUND_STATUS = {
  pending_approval: 'Pending approval',
  processing: 'Processing',
  refunded: 'Refunded',
  manual_refunded: 'Refunded',
  rejected: 'Rejected',
  failed: 'Failed',
} as const;

export const MESSAGE_STATUS = { new: 'New', assigned: 'Assigned', replied: 'Replied', closed: 'Closed' } as const;
