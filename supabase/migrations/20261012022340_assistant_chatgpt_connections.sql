-- "Continue with ChatGPT" for the in-console assistant (OpenAI Sign in with ChatGPT, plan usage).
-- One row per Capgo user. The pending_* columns hold the in-flight OAuth transaction; the token
-- columns hold the connected ChatGPT account. Tokens and the PKCE verifier are AES-GCM encrypted
-- with ASSISTANT_TOKEN_SECRET before they reach the database. Service role only.
CREATE TABLE "public"."assistant_chatgpt_connections" (
  "user_id" uuid NOT NULL,
  "client_id" text,
  "subject" text,
  "email" text,
  "scopes" text,
  "plan_usage" boolean NOT NULL DEFAULT false,
  "access_token_enc" text,
  "refresh_token_enc" text,
  "access_expires_at" timestamp with time zone,
  "pending_state_hash" text,
  "pending_verifier_enc" text,
  "pending_nonce" text,
  "pending_return_to" text,
  "pending_expires_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_chatgpt_connections_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "assistant_chatgpt_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."assistant_chatgpt_connections" OWNER TO "postgres";
COMMENT ON TABLE "public"."assistant_chatgpt_connections" IS 'ChatGPT account connected to the Capgo console assistant (Sign in with ChatGPT). Tokens are AES-GCM encrypted by the backend. Service role only.';

CREATE UNIQUE INDEX "assistant_chatgpt_connections_pending_state_idx" ON "public"."assistant_chatgpt_connections" ("pending_state_hash") WHERE "pending_state_hash" IS NOT NULL;

ALTER TABLE "public"."assistant_chatgpt_connections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM "anon";
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM "authenticated";
GRANT ALL ON TABLE "public"."assistant_chatgpt_connections" TO "service_role";
