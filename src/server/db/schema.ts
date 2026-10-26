// Database schema (Neon Postgres). Conventions:
// - money: integer pesewas; stay dates: `date`; [check_in, check_out) night ranges
// - timestamps: timestamptz in UTC, shown in Africa/Accra
// - phones: E.164 text
// Constraints Drizzle can't express (EXCLUDE, sequences, partial checks) live in
// drizzle/0001_constraints.sql and are covered by tests/integration.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────── Auth (Better Auth tables, extended) ───────────── */

export const roleEnum = pgEnum('role', ['super_admin', 'staff']);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: roleEnum('role').notNull().default('staff'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
});

export const grantEnum = pgEnum('grant_key', ['content', 'reports', 'inventoryEdit', 'venueQuotes', 'exports']);

export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: grantEnum('key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const loginEvents = pgTable(
  'login_events',
  {
    id: id(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    success: boolean('success').notNull(),
    reason: text('reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    at: createdAt(),
  },
  (t) => [index('login_events_user_idx').on(t.userId, t.at)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    target: text('target'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    at: createdAt(),
  },
  (t) => [index('audit_at_idx').on(t.at), index('audit_entity_idx').on(t.entity, t.entityId)],
);

/* ───────────── Rooms & rates ───────────── */

export const roomStatusEnum = pgEnum('room_status', ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order']);

export const roomTypes = pgTable('room_types', {
  id: id(),
  code: text('code').notNull().unique(), // STD | EXE | VIP | DBL
  name: text('name').notNull(),
  blurb: text('blurb').notNull().default(''),
  beds: text('beds').notNull(),
  sleeps: smallint('sleeps').notNull(),
  bathroom: text('bathroom').notNull(),
  bestFor: text('best_for').notNull().default(''),
  amenities: text('amenities').array().notNull().default(sql`'{}'::text[]`),
  position: smallint('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rateVariants = pgTable(
  'rate_variants',
  {
    id: id(),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    code: text('code').notNull().unique(), // STD | EXE | EXE_PLUS | VIP | DBL
    displayCode: text('display_code').notNull(), // STD | EXE | EXE+ | VIP | DBL (as the prototype prints it)
    name: text('name').notNull(),
    note: text('note'),
    pricePesewas: integer('price_pesewas').notNull(),
    position: smallint('position').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [check('rate_variants_price_ck', sql`${t.pricePesewas} >= 0`)],
);

export const rooms = pgTable('rooms', {
  id: id(),
  number: text('number').notNull().unique(),
  rateVariantId: uuid('rate_variant_id')
    .notNull()
    .references(() => rateVariants.id),
  status: roomStatusEnum('status').notNull().default('available'),
  updatedAt: updatedAt(),
});

export const rateRuleKindEnum = pgEnum('rate_rule_kind', ['range', 'weekend', 'longstay']);

export const rateRules = pgTable(
  'rate_rules',
  {
    id: id(),
    name: text('name').notNull(),
    kind: rateRuleKindEnum('kind').notNull(),
    monthDayFrom: text('month_day_from'), // "MM-DD"
    monthDayTo: text('month_day_to'),
    minNights: smallint('min_nights'),
    appliesTo: text('applies_to').array(), // null = all variants
    direction: text('direction', { enum: ['up', 'down'] }).notNull(),
    unit: text('unit', { enum: ['pct', 'ghs'] }).notNull(),
    amount: integer('amount').notNull(), // percent, or pesewas
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('rate_rules_amount_ck', sql`${t.amount} >= 0`)],
);

export const promoCodes = pgTable('promo_codes', {
  id: id(),
  code: text('code').notNull().unique(),
  type: text('type', { enum: ['pct', 'ghs', 'breakfast'] }).notNull(),
  value: integer('value').notNull().default(0),
  endsOn: date('ends_on'),
  appliesTo: text('applies_to'), // null = all; else a variant code
  minNights: smallint('min_nights'),
  usedCount: integer('used_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const blackoutDates = pgTable(
  'blackout_dates',
  {
    id: id(),
    starts: date('starts').notNull(),
    ends: date('ends').notNull(), // inclusive last blocked night
    roomIds: uuid('room_ids').array(), // null = every room
    reason: text('reason').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [check('blackout_range_ck', sql`${t.ends} >= ${t.starts}`)],
);

/* ───────────── Customers ───────────── */

export const customers = pgTable(
  'customers',
  {
    id: id(),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    email: text('email'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('customers_phone_uq').on(t.phoneE164), index('customers_email_idx').on(t.email)],
);

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: id(),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('footer'),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/* ───────────── Bookings ───────────── */

export const bookingStatusEnum = pgEnum('booking_status', [
  'held',
  'pending_payment',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
  'expired',
]);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'deposit', 'paid', 'partially_refunded', 'refunded']);
export const payModeEnum = pgEnum('pay_mode', ['full', 'deposit', 'at_hotel']);
export const bookingSourceEnum = pgEnum('booking_source', ['web', 'phone', 'walk_in', 'whatsapp']);

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    ref: text('ref').unique(), // null while only a hold
    publicToken: text('public_token').notNull().unique(), // unguessable token for confirmation/.ics links
    customerId: uuid('customer_id').references(() => customers.id),
    rateVariantId: uuid('rate_variant_id')
      .notNull()
      .references(() => rateVariants.id),
    roomId: uuid('room_id').references(() => rooms.id),
    checkIn: date('check_in').notNull(),
    checkOut: date('check_out').notNull(),
    guests: smallint('guests').notNull().default(1),
    arrivalHour: smallint('arrival_hour'),
    requests: text('requests').notNull().default(''),
    status: bookingStatusEnum('status').notNull(),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
    payMode: payModeEnum('pay_mode'),
    source: bookingSourceEnum('source').notNull().default('web'),
    subtotalPesewas: integer('subtotal_pesewas').notNull().default(0),
    discountPesewas: integer('discount_pesewas').notNull().default(0),
    totalPesewas: integer('total_pesewas').notNull().default(0),
    paidPesewas: integer('paid_pesewas').notNull().default(0),
    promoCodeId: uuid('promo_code_id').references(() => promoCodes.id),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    holdSessionId: text('hold_session_id'),
    breakfast: boolean('breakfast').notNull().default(false),
    notes: text('notes').notNull().default(''),
    createdBy: text('created_by').references(() => user.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('bookings_range_ck', sql`${t.checkOut} > ${t.checkIn}`),
    check('bookings_money_ck', sql`${t.totalPesewas} >= 0 and ${t.paidPesewas} >= 0 and ${t.discountPesewas} >= 0`),
    check('bookings_arrival_ck', sql`${t.arrivalHour} is null or ${t.arrivalHour} between 0 and 23`),
    index('bookings_dates_idx').on(t.checkIn, t.checkOut),
    index('bookings_status_idx').on(t.status),
    index('bookings_hold_idx').on(t.holdExpiresAt),
  ],
);

/**
 * One row per booking that occupies a physical room. The EXCLUDE constraint in
 * drizzle/0001_constraints.sql makes double-booking impossible:
 *   EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (active)
 * `stay` is a generated daterange(check_in, check_out) ('[)' — nights).
 */
export const roomAllocations = pgTable(
  'room_allocations',
  {
    bookingId: uuid('booking_id')
      .primaryKey()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    checkIn: date('check_in').notNull(),
    checkOut: date('check_out').notNull(),
    active: boolean('active').notNull().default(true),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  },
  (t) => [index('room_allocations_room_idx').on(t.roomId)],
);

export const bookingCharges = pgTable('booking_charges', {
  id: id(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['room', 'breakfast', 'room_service', 'other'] }).notNull(),
  description: text('description').notNull().default(''),
  qty: integer('qty').notNull().default(1),
  unitPesewas: integer('unit_pesewas').notNull(),
  createdBy: text('created_by').references(() => user.id),
  createdAt: createdAt(),
});

export const guestOtps = pgTable(
  'guest_otps',
  {
    id: id(),
    ref: text('ref').notNull(),
    channel: text('channel', { enum: ['email', 'sms'] }).notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('guest_otps_ref_idx').on(t.ref)],
);

/* ───────────── Rentals ───────────── */

export const rentalItems = pgTable(
  'rental_items',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    spec: text('spec').notNull().default(''),
    imageId: text('image_id'), // Cloudinary public ID
    imageAlt: text('image_alt'),
    pricePerDayPesewas: integer('price_per_day_pesewas').notNull(),
    depositPerUnitPesewas: integer('deposit_per_unit_pesewas').notNull().default(0),
    stockTotal: integer('stock_total').notNull(),
    unitsInRepair: integer('units_in_repair').notNull().default(0),
    lowStockAt: integer('low_stock_at'),
    isCustom: boolean('is_custom').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    position: smallint('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('rental_items_stock_ck', sql`${t.stockTotal} >= 0 and ${t.unitsInRepair} between 0 and ${t.stockTotal}`),
    check('rental_items_price_ck', sql`${t.pricePerDayPesewas} >= 0 and ${t.depositPerUnitPesewas} >= 0`),
  ],
);

export const bundles = pgTable('bundles', {
  id: id(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  pctOff: smallint('pct_off').notNull().default(0),
  active: boolean('active').notNull().default(true),
  position: smallint('position').notNull().default(0),
});

export const bundleItems = pgTable(
  'bundle_items',
  {
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => bundles.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => rentalItems.id),
    qty: integer('qty').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bundleId, t.itemId] })],
);

/** Kept for later; switched off by the rentals.deliveryEnabled setting (DECISIONS D-01). */
export const deliveryZones = pgTable('delivery_zones', {
  id: id(),
  name: text('name').notNull(),
  feePesewas: integer('fee_pesewas').notNull(),
  active: boolean('active').notNull().default(false),
});

export const rentalStatusEnum = pgEnum('rental_status', [
  'pending_payment',
  'reserved',
  'ready_for_pickup',
  'collected',
  'returned',
  'completed',
  'cancelled',
]);

export const rentalOrders = pgTable(
  'rental_orders',
  {
    id: id(),
    ref: text('ref').notNull().unique(),
    publicToken: text('public_token').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    starts: date('starts').notNull(),
    ends: date('ends').notNull(),
    occasion: text('occasion').notNull().default(''),
    payMode: text('pay_mode', { enum: ['online', 'at_pickup'] }).notNull(),
    fulfilment: text('fulfilment', { enum: ['pickup', 'delivery'] }).notNull().default('pickup'),
    deliveryZoneId: uuid('delivery_zone_id').references(() => deliveryZones.id),
    collectorName: text('collector_name').notNull(),
    collectorPhoneE164: text('collector_phone_e164').notNull(),
    status: rentalStatusEnum('status').notNull(),
    holdUntil: timestamp('hold_until', { withTimezone: true }), // pay-at-pickup: released at 10:00 on pickup day
    subtotalPesewas: integer('subtotal_pesewas').notNull(),
    discountPesewas: integer('discount_pesewas').notNull().default(0),
    depositPesewas: integer('deposit_pesewas').notNull(),
    totalPesewas: integer('total_pesewas').notNull(),
    paidPesewas: integer('paid_pesewas').notNull().default(0),
    bundleId: uuid('bundle_id').references(() => bundles.id),
    notes: text('notes').notNull().default(''),
    source: bookingSourceEnum('source').notNull().default('web'),
    createdBy: text('created_by').references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('rental_orders_range_ck', sql`${t.ends} >= ${t.starts}`),
    check('rental_orders_pickup_only_ck', sql`${t.fulfilment} = 'pickup' or ${t.deliveryZoneId} is not null`),
    index('rental_orders_dates_idx').on(t.starts, t.ends),
    index('rental_orders_status_idx').on(t.status),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => rentalOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => rentalItems.id),
    qty: integer('qty').notNull(),
    unitPesewas: integer('unit_pesewas').notNull(),
    depositPesewas: integer('deposit_pesewas').notNull(),
    days: smallint('days').notNull(),
  },
  (t) => [check('order_lines_qty_ck', sql`${t.qty} > 0 and ${t.days} > 0`), index('order_lines_item_idx').on(t.itemId)],
);

export const orderStatusEvents = pgTable('order_status_events', {
  id: id(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => rentalOrders.id, { onDelete: 'cascade' }),
  from: rentalStatusEnum('from'),
  to: rentalStatusEnum('to').notNull(),
  reason: text('reason'),
  byUserId: text('by_user_id').references(() => user.id),
  at: createdAt(),
});

export const returnChecklists = pgTable('return_checklists', {
  id: id(),
  orderId: uuid('order_id')
    .notNull()
    .unique()
    .references(() => rentalOrders.id, { onDelete: 'cascade' }),
  byUserId: text('by_user_id')
    .notNull()
    .references(() => user.id),
  lines: jsonb('lines').notNull(), // [{ itemId, returned, damaged, missing }]
  deductionPesewas: integer('deduction_pesewas').notNull(),
  refundPesewas: integer('refund_pesewas').notNull(),
  approvedBy: text('approved_by').references(() => user.id),
  createdAt: createdAt(),
});

/* ───────────── Venues ───────────── */

export const venues = pgTable('venues', {
  id: id(),
  slug: text('slug').notNull().unique(), // compound | conference
  name: text('name').notNull(),
  label: text('label').notNull().default(''),
  description: text('description').notNull().default(''),
  capacityMin: integer('capacity_min'),
  capacityMax: integer('capacity_max'),
  hirePesewas: integer('hire_pesewas').notNull(),
  imageId: text('image_id'),
  position: smallint('position').notNull().default(0),
});

export const enquiries = pgTable('enquiries', {
  id: id(),
  ref: text('ref').notNull().unique(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  eventDate: date('event_date').notNull(),
  guests: integer('guests').notNull(),
  eventType: text('event_type').notNull().default(''),
  message: text('message').notNull().default(''),
  stage: text('stage', { enum: ['new', 'quoted', 'deposit_paid', 'done', 'lost'] })
    .notNull()
    .default('new'),
  quote: jsonb('quote'), // { lines: [{label, qty, unitPesewas}], totalPesewas, validUntil }
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Payments & refunds ───────────── */

export const paymentMethodEnum = pgEnum('payment_method', ['mtn', 'telecel', 'airteltigo', 'card', 'cash', 'pos']);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    ref: text('ref').notNull().unique(), // our reference sent to Paystack, or a desk receipt number
    bookingId: uuid('booking_id').references(() => bookings.id),
    orderId: uuid('order_id').references(() => rentalOrders.id),
    enquiryId: uuid('enquiry_id').references(() => enquiries.id),
    amountPesewas: integer('amount_pesewas').notNull(),
    currency: text('currency').notNull().default('GHS'),
    method: paymentMethodEnum('method'),
    channel: text('channel', { enum: ['paystack', 'desk'] }).notNull(),
    paystackRef: text('paystack_ref').unique(),
    externalTxnId: text('external_txn_id'),
    status: text('status', { enum: ['pending', 'success', 'failed', 'reversed'] }).notNull(),
    byUserId: text('by_user_id').references(() => user.id),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'payments_one_target_ck',
      sql`num_nonnulls(${t.bookingId}, ${t.orderId}, ${t.enquiryId}) = 1`,
    ),
    check('payments_amount_ck', sql`${t.amountPesewas} > 0`),
    index('payments_created_idx').on(t.createdAt),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    amountPesewas: integer('amount_pesewas').notNull(),
    reason: text('reason').notNull(),
    status: text('status', {
      enum: ['pending_approval', 'processing', 'refunded', 'manual_refunded', 'rejected', 'failed'],
    }).notNull(),
    paystackRefundId: text('paystack_refund_id'),
    manualTxnId: text('manual_txn_id'),
    requestedBy: text('requested_by').references(() => user.id),
    approvedBy: text('approved_by').references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('refunds_amount_ck', sql`${t.amountPesewas} > 0`)],
);

export const paystackEvents = pgTable('paystack_events', {
  id: id(),
  eventKey: text('event_key').notNull().unique(), // event + reference: makes the webhook idempotent
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  signatureOk: boolean('signature_ok').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  receivedAt: createdAt(),
});

/* ───────────── Inbox ───────────── */

export const messages = pgTable('messages', {
  id: id(),
  fromName: text('from_name').notNull(),
  contact: text('contact').notNull(),
  subject: text('subject', { enum: ['Reservation', 'Special request', 'Feedback', 'Events & rentals'] }).notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['new', 'assigned', 'replied', 'closed'] })
    .notNull()
    .default('new'),
  assigneeId: text('assignee_id').references(() => user.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messageReplies = pgTable('message_replies', {
  id: id(),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  byUserId: text('by_user_id').references(() => user.id),
  body: text('body').notNull(),
  channel: text('channel', { enum: ['email', 'sms', 'note'] }).notNull(),
  createdAt: createdAt(),
});

/* ───────────── Content ───────────── */

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

export const contentBlocks = pgTable('content_blocks', {
  key: text('key').primaryKey(), // e.g. home.heroTitle, rooms.blurb.STD
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});

/** The 29 photo slots from Content › Photos, plus room galleries. */
export const imageSlots = pgTable('image_slots', {
  slotKey: text('slot_key').primaryKey(),
  imageId: text('image_id').notNull(), // Cloudinary public ID
  originalImageId: text('original_image_id').notNull(), // for "undo"
  alt: text('alt').notNull(),
  conceptLabel: boolean('concept_label').notNull().default(false),
  replaceBeforeLaunch: boolean('replace_before_launch').notNull().default(false),
  updatedAt: updatedAt(),
});

export const galleryItems = pgTable(
  'gallery_items',
  {
    id: id(),
    imageId: text('image_id').notNull(),
    alt: text('alt').notNull().default(''),
    category: text('category', { enum: ['Rooms', 'Bathrooms', 'Spaces', 'Events'] }).notNull(),
    position: integer('position').notNull().default(0),
    published: boolean('published').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check('gallery_alt_ck', sql`not ${t.published} or length(trim(${t.alt})) > 0`)],
);

export const faqs = pgTable('faqs', {
  id: id(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  position: integer('position').notNull().default(0),
  published: boolean('published').notNull().default(true),
});

export const testimonials = pgTable('testimonials', {
  id: id(),
  quote: text('quote').notNull(),
  attribution: text('attribution').notNull(),
  status: text('status', { enum: ['live', 'draft'] })
    .notNull()
    .default('draft'),
  position: integer('position').notNull().default(0),
});

export const comingSoon = pgTable('coming_soon', {
  key: text('key').primaryKey(), // breakfast | summer_hut
  title: text('title').notNull(),
  description: text('description').notNull(),
  nowOpen: boolean('now_open').notNull().default(false),
});
