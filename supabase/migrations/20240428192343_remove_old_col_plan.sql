
ALTER TABLE "public"."plans"
    DROP COLUMN "app",
    DROP COLUMN "channel",
    DROP COLUMN "update",
    DROP COLUMN "shared",
    DROP COLUMN "abtest",
    DROP COLUMN "progressive_deploy";
    
