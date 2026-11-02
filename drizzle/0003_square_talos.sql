ALTER TABLE "announcements" ADD COLUMN "narration_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "start_ms" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_narration_asset_id_assets_id_fk" FOREIGN KEY ("narration_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
