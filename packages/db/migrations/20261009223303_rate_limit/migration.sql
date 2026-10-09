CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer NOT NULL
);
