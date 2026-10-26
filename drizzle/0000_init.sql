CREATE TYPE "public"."booking_source" AS ENUM('web', 'phone', 'walk_in', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('held', 'pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'expired');--> statement-breakpoint
CREATE TYPE "public"."grant_key" AS ENUM('content', 'reports', 'inventoryEdit', 'venueQuotes', 'exports');--> statement-breakpoint
CREATE TYPE "public"."pay_mode" AS ENUM('full', 'deposit', 'at_hotel');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('mtn', 'telecel', 'airteltigo', 'card', 'cash', 'pos');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'deposit', 'paid', 'partially_refunded', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."rate_rule_kind" AS ENUM('range', 'weekend', 'longstay');--> statement-breakpoint
CREATE TYPE "public"."rental_status" AS ENUM('pending_payment', 'reserved', 'ready_for_pickup', 'collected', 'returned', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('super_admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'occupied', 'cleaning', 'maintenance', 'out_of_order');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"target" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts" date NOT NULL,
	"ends" date NOT NULL,
	"room_ids" uuid[],
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackout_range_ck" CHECK ("blackout_dates"."ends" >= "blackout_dates"."starts")
);
--> statement-breakpoint
CREATE TABLE "booking_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_pesewas" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text,
	"public_token" text NOT NULL,
	"customer_id" uuid,
	"rate_variant_id" uuid NOT NULL,
	"room_id" uuid,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guests" smallint DEFAULT 1 NOT NULL,
	"arrival_hour" smallint,
	"requests" text DEFAULT '' NOT NULL,
	"status" "booking_status" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"pay_mode" "pay_mode",
	"source" "booking_source" DEFAULT 'web' NOT NULL,
	"subtotal_pesewas" integer DEFAULT 0 NOT NULL,
	"discount_pesewas" integer DEFAULT 0 NOT NULL,
	"total_pesewas" integer DEFAULT 0 NOT NULL,
	"paid_pesewas" integer DEFAULT 0 NOT NULL,
	"promo_code_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"hold_session_id" text,
	"breakfast" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ref_unique" UNIQUE("ref"),
	CONSTRAINT "bookings_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "bookings_range_ck" CHECK ("bookings"."check_out" > "bookings"."check_in"),
	CONSTRAINT "bookings_money_ck" CHECK ("bookings"."total_pesewas" >= 0 and "bookings"."paid_pesewas" >= 0 and "bookings"."discount_pesewas" >= 0),
	CONSTRAINT "bookings_arrival_ck" CHECK ("bookings"."arrival_hour" is null or "bookings"."arrival_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"bundle_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "bundle_items_bundle_id_item_id_pk" PRIMARY KEY("bundle_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"pct_off" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coming_soon" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"now_open" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_blocks" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"email" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fee_pesewas" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"venue_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"guests" integer NOT NULL,
	"event_type" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"quote" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_id" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_alt_ck" CHECK (not "gallery_items"."published" or length(trim("gallery_items"."alt")) > 0)
);
--> statement-breakpoint
CREATE TABLE "guest_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_slots" (
	"slot_key" text PRIMARY KEY NOT NULL,
	"image_id" text NOT NULL,
	"original_image_id" text NOT NULL,
	"alt" text NOT NULL,
	"concept_label" boolean DEFAULT false NOT NULL,
	"replace_before_launch" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"success" boolean NOT NULL,
	"reason" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"by_user_id" text,
	"body" text NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_name" text NOT NULL,
	"contact" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assignee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'footer' NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_pesewas" integer NOT NULL,
	"deposit_pesewas" integer NOT NULL,
	"days" smallint NOT NULL,
	CONSTRAINT "order_lines_qty_ck" CHECK ("order_lines"."qty" > 0 and "order_lines"."days" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from" "rental_status",
	"to" "rental_status" NOT NULL,
	"reason" text,
	"by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"booking_id" uuid,
	"order_id" uuid,
	"enquiry_id" uuid,
	"amount_pesewas" integer NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"method" "payment_method",
	"channel" text NOT NULL,
	"paystack_ref" text,
	"external_txn_id" text,
	"status" text NOT NULL,
	"by_user_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_ref_unique" UNIQUE("ref"),
	CONSTRAINT "payments_paystack_ref_unique" UNIQUE("paystack_ref"),
	CONSTRAINT "payments_one_target_ck" CHECK (num_nonnulls("payments"."booking_id", "payments"."order_id", "payments"."enquiry_id") = 1),
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount_pesewas" > 0)
);
--> statement-breakpoint
CREATE TABLE "paystack_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_ok" boolean NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paystack_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"ends_on" date,
	"applies_to" text,
	"min_nights" smallint,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rate_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "rate_rule_kind" NOT NULL,
	"month_day_from" text,
	"month_day_to" text,
	"min_nights" smallint,
	"applies_to" text[],
	"direction" text NOT NULL,
	"unit" text NOT NULL,
	"amount" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_rules_amount_ck" CHECK ("rate_rules"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_code" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"price_pesewas" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_variants_code_unique" UNIQUE("code"),
	CONSTRAINT "rate_variants_price_ck" CHECK ("rate_variants"."price_pesewas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_pesewas" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"paystack_refund_id" text,
	"manual_txn_id" text,
	"requested_by" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_ck" CHECK ("refunds"."amount_pesewas" > 0)
);
--> statement-breakpoint
CREATE TABLE "rental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"image_id" text,
	"image_alt" text,
	"price_per_day_pesewas" integer NOT NULL,
	"deposit_per_unit_pesewas" integer DEFAULT 0 NOT NULL,
	"stock_total" integer NOT NULL,
	"units_in_repair" integer DEFAULT 0 NOT NULL,
	"low_stock_at" integer,
	"is_custom" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "rental_items_stock_ck" CHECK ("rental_items"."stock_total" >= 0 and "rental_items"."units_in_repair" between 0 and "rental_items"."stock_total"),
	CONSTRAINT "rental_items_price_ck" CHECK ("rental_items"."price_per_day_pesewas" >= 0 and "rental_items"."deposit_per_unit_pesewas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rental_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"public_token" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"starts" date NOT NULL,
	"ends" date NOT NULL,
	"occasion" text DEFAULT '' NOT NULL,
	"pay_mode" text NOT NULL,
	"fulfilment" text DEFAULT 'pickup' NOT NULL,
	"delivery_zone_id" uuid,
	"collector_name" text NOT NULL,
	"collector_phone_e164" text NOT NULL,
	"status" "rental_status" NOT NULL,
	"hold_until" timestamp with time zone,
	"subtotal_pesewas" integer NOT NULL,
	"discount_pesewas" integer DEFAULT 0 NOT NULL,
	"deposit_pesewas" integer NOT NULL,
	"total_pesewas" integer NOT NULL,
	"paid_pesewas" integer DEFAULT 0 NOT NULL,
	"bundle_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"source" "booking_source" DEFAULT 'web' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_orders_ref_unique" UNIQUE("ref"),
	CONSTRAINT "rental_orders_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "rental_orders_range_ck" CHECK ("rental_orders"."ends" >= "rental_orders"."starts"),
	CONSTRAINT "rental_orders_pickup_only_ck" CHECK ("rental_orders"."fulfilment" = 'pickup' or "rental_orders"."delivery_zone_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "return_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"by_user_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"deduction_pesewas" integer NOT NULL,
	"refund_pesewas" integer NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_checklists_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "room_allocations" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"hold_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"beds" text NOT NULL,
	"sleeps" smallint NOT NULL,
	"bathroom" text NOT NULL,
	"best_for" text DEFAULT '' NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"rate_variant_id" uuid NOT NULL,
	"status" "room_status" DEFAULT 'available' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote" text NOT NULL,
	"attribution" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" text NOT NULL,
	"key" "grant_key" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_permissions_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capacity_min" integer,
	"capacity_max" integer,
	"hire_pesewas" integer NOT NULL,
	"image_id" text,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "venues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_variant_id_rate_variants_id_fk" FOREIGN KEY ("rate_variant_id") REFERENCES "public"."rate_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_item_id_rental_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_rental_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."rental_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_rental_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_rental_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."rental_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_rental_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."rental_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_variants" ADD CONSTRAINT "rate_variants_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_checklists" ADD CONSTRAINT "return_checklists_order_id_rental_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."rental_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_checklists" ADD CONSTRAINT "return_checklists_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_checklists" ADD CONSTRAINT "return_checklists_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_rate_variant_id_rate_variants_id_fk" FOREIGN KEY ("rate_variant_id") REFERENCES "public"."rate_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "bookings_dates_idx" ON "bookings" USING btree ("check_in","check_out");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_hold_idx" ON "bookings" USING btree ("hold_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_uq" ON "customers" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "guest_otps_ref_idx" ON "guest_otps" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "login_events_user_idx" ON "login_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "order_lines_item_idx" ON "order_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rental_orders_dates_idx" ON "rental_orders" USING btree ("starts","ends");--> statement-breakpoint
CREATE INDEX "rental_orders_status_idx" ON "rental_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "room_allocations_room_idx" ON "room_allocations" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");