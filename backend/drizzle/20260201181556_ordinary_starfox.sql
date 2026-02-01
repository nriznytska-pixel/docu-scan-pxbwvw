CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text DEFAULT 'uk',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
