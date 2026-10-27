ALTER TABLE "bookings" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD COLUMN "pickup_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rental_orders" ADD COLUMN "return_reminder_at" timestamp with time zone;