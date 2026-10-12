-- Console assistant state per Capgo user:
--  * the "MCP · Capgo Assistant" API key the assistant replays MCP tools with (never kept in the browser),
--  * the ChatGPT account connected with OpenAI "Sign in with ChatGPT" (plan usage), including the
--    client_id issued by dynamic registration and the stable ext_agent_host_id,
--  * the in-flight OAuth transaction (pending_* columns).
-- Secrets (API key, tokens, PKCE verifier) are AES-GCM encrypted with ASSISTANT_TOKEN_SECRET by the
-- backend before they reach the database. Service role only.
CREATE TABLE "public"."assistant_chatgpt_connections" (
  "user_id" uuid NOT NULL,
  "apikey_enc" text,
  "host_id" text,
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
  "pending_client_id" text,
  "pending_redirect_uri" text,
  "pending_return_to" text,
  "pending_expires_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_chatgpt_connections_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "assistant_chatgpt_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."assistant_chatgpt_connections" OWNER TO "postgres";
COMMENT ON TABLE "public"."assistant_chatgpt_connections" IS 'Console assistant: encrypted Capgo assistant API key and ChatGPT account (Sign in with ChatGPT). Secrets are AES-GCM encrypted by the backend. Service role only.';

CREATE UNIQUE INDEX "assistant_chatgpt_connections_pending_state_idx" ON "public"."assistant_chatgpt_connections" ("pending_state_hash") WHERE "pending_state_hash" IS NOT NULL;

ALTER TABLE "public"."assistant_chatgpt_connections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM "anon";
REVOKE ALL ON TABLE "public"."assistant_chatgpt_connections" FROM "authenticated";
GRANT ALL ON TABLE "public"."assistant_chatgpt_connections" TO "service_role";

CREATE POLICY "Deny all direct access"
ON "public"."assistant_chatgpt_connections"
AS RESTRICTIVE
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);
