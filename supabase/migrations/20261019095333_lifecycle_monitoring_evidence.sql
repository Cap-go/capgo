-- Private producer evidence. This migration does not enable dispatch, allocate
-- cohorts, alter recipient authorization, or apply a Bento workflow.
CREATE TABLE public.bento_lifecycle_decisions (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    product text NOT NULL CHECK (product IN ('ota', 'builder')),
    purpose text,
    due_at timestamptz,
    evaluated_at timestamptz NOT NULL,
    decision text NOT NULL CHECK (decision IN ('send', 'suppress', 'wait', 'unknown')),
    reason text NOT NULL,
    recipient_id uuid,
    recipient_email text,
    original_creator_id uuid,
    creator_cohort text NOT NULL CHECK (creator_cohort IN ('treatment', 'ineligible')),
    app_incarnation uuid,
    event_name text,
    variant text,
    policy_version text NOT NULL,
    source_healthy boolean NOT NULL,
    source_verified_at timestamptz,
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    context_key text
);
CREATE INDEX bento_lifecycle_decision_identity ON public.bento_lifecycle_decisions
    (org_id, product, purpose, evaluated_at DESC, id DESC);
CREATE INDEX bento_lifecycle_decision_time ON public.bento_lifecycle_decisions(evaluated_at DESC, id);

CREATE TABLE public.bento_lifecycle_evaluation_coverage (
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    product text NOT NULL CHECK (product IN ('ota', 'builder')),
    evaluated_at timestamptz NOT NULL,
    next_evaluation_at timestamptz NOT NULL,
    revision bigint NOT NULL,
    latest_decision_id uuid NOT NULL REFERENCES public.bento_lifecycle_decisions(id) ON DELETE CASCADE,
    sender_ready boolean NOT NULL,
    source_healthy boolean NOT NULL,
    source_verified_at timestamptz,
    PRIMARY KEY(org_id, product)
);

CREATE TABLE public.bento_lifecycle_attempts (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    product text NOT NULL CHECK (product IN ('ota', 'builder')),
    purpose text NOT NULL,
    dispatch_id uuid REFERENCES public.bento_event_dispatches(id) ON DELETE CASCADE,
    attempt_number smallint CHECK (attempt_number BETWEEN 1 AND 5),
    run_id uuid,
    kind text NOT NULL CHECK (kind IN ('claimed', 'deferred', 'provider_request', 'accepted', 'failed', 'released')),
    reason text NOT NULL,
    recipient_id uuid,
    recipient_email text
);
CREATE INDEX bento_lifecycle_attempt_dispatch ON public.bento_lifecycle_attempts(dispatch_id, recorded_at, id);
CREATE INDEX bento_lifecycle_attempt_org ON public.bento_lifecycle_attempts(org_id, product, purpose, recorded_at DESC);

CREATE TABLE public.bento_lifecycle_send_snapshots (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    dispatch_id uuid NOT NULL REFERENCES public.bento_event_dispatches(id) ON DELETE CASCADE,
    attempt_number smallint NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    product text NOT NULL CHECK (product IN ('ota', 'builder')),
    purpose text NOT NULL,
    recipient_id uuid,
    recipient_email text NOT NULL,
    event_name text NOT NULL,
    variant text NOT NULL,
    app_incarnation uuid,
    policy_version text NOT NULL,
    snapshot_checksum text NOT NULL CHECK (snapshot_checksum ~ '^[a-f0-9]{64}$'),
    expected_subject text NOT NULL,
    personalization jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(personalization) = 'object' AND pg_catalog.pg_column_size(personalization) <= 65536),
    UNIQUE(dispatch_id, attempt_number)
);
CREATE INDEX bento_lifecycle_snapshot_org ON public.bento_lifecycle_send_snapshots(org_id, recorded_at DESC);

ALTER TABLE public.bento_lifecycle_decisions OWNER TO postgres;
ALTER TABLE public.bento_lifecycle_evaluation_coverage OWNER TO postgres;
ALTER TABLE public.bento_lifecycle_attempts OWNER TO postgres;
ALTER TABLE public.bento_lifecycle_send_snapshots OWNER TO postgres;
ALTER TABLE public.bento_lifecycle_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bento_lifecycle_evaluation_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bento_lifecycle_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bento_lifecycle_send_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bento_lifecycle_decisions, public.bento_lifecycle_evaluation_coverage,
    public.bento_lifecycle_attempts, public.bento_lifecycle_send_snapshots FROM PUBLIC, anon, authenticated, service_role;
-- Even the worker role has no UPDATE on immutable decision/attempt/snapshot rows.
GRANT SELECT, INSERT ON public.bento_lifecycle_decisions, public.bento_lifecycle_attempts,
    public.bento_lifecycle_send_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.bento_lifecycle_evaluation_coverage TO service_role;
CREATE POLICY lifecycle_decisions_deny ON public.bento_lifecycle_decisions AS RESTRICTIVE FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);
CREATE POLICY lifecycle_coverage_deny ON public.bento_lifecycle_evaluation_coverage AS RESTRICTIVE FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);
CREATE POLICY lifecycle_attempts_deny ON public.bento_lifecycle_attempts AS RESTRICTIVE FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);
CREATE POLICY lifecycle_snapshots_deny ON public.bento_lifecycle_send_snapshots AS RESTRICTIVE FOR ALL TO anon, authenticated USING(false) WITH CHECK(false);

-- The producer also connects through a private database role. Enforce immutability
-- independently of that role's inherited privileges. Deletion remains possible
-- for parent-organization erasure; updates can never rewrite historical content.
CREATE FUNCTION public.deny_lifecycle_evidence_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'Lifecycle evidence is append-only' USING ERRCODE = '55000';
END;
$$;
ALTER FUNCTION public.deny_lifecycle_evidence_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.deny_lifecycle_evidence_update() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER lifecycle_decisions_immutable BEFORE UPDATE ON public.bento_lifecycle_decisions
FOR EACH ROW EXECUTE FUNCTION public.deny_lifecycle_evidence_update();
CREATE TRIGGER lifecycle_attempts_immutable BEFORE UPDATE ON public.bento_lifecycle_attempts
FOR EACH ROW EXECUTE FUNCTION public.deny_lifecycle_evidence_update();
CREATE TRIGGER lifecycle_snapshots_immutable BEFORE UPDATE ON public.bento_lifecycle_send_snapshots
FOR EACH ROW EXECUTE FUNCTION public.deny_lifecycle_evidence_update();

-- Latest changed decision for each organization/product/purpose. Older purposes
-- remain inspectable; only is_current is an unresolved current expectation.
-- Provider acceptance is a request acknowledgment, never proof of email delivery.
CREATE VIEW public.bento_lifecycle_monitor_v1 AS
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, d.id AS decision_id,
    d.org_id, d.product, d.purpose, d.due_at, d.evaluated_at, c.evaluated_at AS last_evaluated_at, d.evaluated_at AS decision_changed_at,
    d.decision, d.reason, dispatch.id AS dispatch_id, dispatch.status AS dispatch_status,
    COALESCE(s.recipient_id, d.recipient_id) AS recipient_id,
    COALESCE(s.recipient_email, d.recipient_email) AS recipient_email,
    d.original_creator_id, d.creator_cohort, COALESCE(s.app_incarnation, d.app_incarnation) AS app_incarnation,
    COALESCE(s.event_name, d.event_name) AS event_name, COALESCE(s.variant, d.variant) AS variant,
    d.recipient_id AS intended_recipient_id, d.recipient_email AS intended_recipient_email,
    d.app_incarnation AS intended_app_incarnation, d.event_name AS intended_event_name, d.variant AS intended_variant,
    d.policy_version, s.snapshot_checksum, COALESCE(dispatch.attempt_count, 0)::integer AS attempt_count,
    CASE WHEN dispatch.status = 'accepted' THEN dispatch.event_at END AS accepted_at,
    CASE WHEN c.latest_decision_id = d.id THEN c.source_healthy ELSE d.source_healthy END AS source_healthy,
    CASE WHEN c.latest_decision_id = d.id THEN c.source_verified_at ELSE d.source_verified_at END AS source_verified_at,
    j.next_evaluation_at, c.sender_ready,
    latest_attempt.recorded_at AS last_attempt_at, latest_attempt.kind AS last_attempt_kind,
    latest_attempt.reason AS last_attempt_reason,
    (c.latest_decision_id = d.id AND (d.decision <> 'send' OR COALESCE(j.candidate->>'purpose' = d.purpose,false))) AS is_current
FROM public.bento_lifecycle_decisions d
JOIN public.bento_lifecycle_evaluation_coverage c ON c.org_id = d.org_id AND c.product = d.product
JOIN public.bento_lifecycle_journeys j ON j.org_id = d.org_id AND j.product = d.product
LEFT JOIN public.bento_event_dispatches dispatch ON dispatch.flow_key = 'lifecycle:v2:org'
    AND dispatch.context_key = d.org_id::text AND dispatch.recipient_key = 'org:' || d.org_id::text AND dispatch.tag = d.purpose
    AND dispatch.details->'metadata'->>'product' = d.product
LEFT JOIN LATERAL (
    SELECT snapshot.* FROM public.bento_lifecycle_send_snapshots snapshot
    WHERE snapshot.dispatch_id = dispatch.id ORDER BY snapshot.attempt_number DESC LIMIT 1
) s ON true
LEFT JOIN LATERAL (
    SELECT attempt.recorded_at, attempt.kind, attempt.reason FROM public.bento_lifecycle_attempts attempt
    WHERE attempt.org_id = d.org_id AND attempt.product = d.product AND attempt.purpose = d.purpose
        AND attempt.recorded_at >= d.evaluated_at
    ORDER BY attempt.recorded_at DESC, attempt.id DESC LIMIT 1
) latest_attempt ON true
WHERE NOT EXISTS (
    SELECT 1 FROM public.bento_lifecycle_decisions newer
    WHERE newer.org_id = d.org_id AND newer.product = d.product AND newer.purpose IS NOT DISTINCT FROM d.purpose
        AND (newer.evaluated_at, newer.id) > (d.evaluated_at, d.id)
);

-- This source starts from prospective creator provenance and declared product
-- intent, independently of journey enrollment, candidate JSON and the outbox.
-- It reports omitted enrollment/evaluation. It never declares a send eligible.
CREATE VIEW public.bento_lifecycle_due_v1 AS
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, provenance.org_id, p.product,
    provenance.original_creator_id, 'treatment'::text AS creator_cohort,
    CURRENT_TIMESTAMP AS observed_at, j.org_id IS NULL AS journey_missing,
    j.next_evaluation_at, c.evaluated_at AS last_evaluated_at, obs.verified_at AS source_verified_at,
    obs.healthy AS source_healthy, COALESCE(j.next_evaluation_at, provenance.captured_at) AS due_at,
    NULL::text AS purpose, 'evaluation'::text AS due_scope, 'unknown'::text AS send_eligibility,
    CASE WHEN j.org_id IS NULL THEN 'journey_missing' WHEN c.evaluated_at IS NULL THEN 'not_evaluated'
        WHEN j.next_evaluation_at <= CURRENT_TIMESTAMP THEN 'evaluation_due' ELSE 'evaluation_scheduled' END AS reason
FROM public.org_lifecycle_creators provenance
JOIN public.orgs o ON o.id = provenance.org_id
JOIN public.users original ON original.id = provenance.original_creator_id
CROSS JOIN (VALUES('ota'::text),('builder'::text)) AS p(product)
LEFT JOIN public.bento_lifecycle_journeys j ON j.org_id = provenance.org_id AND j.product = p.product
LEFT JOIN public.bento_lifecycle_evaluation_coverage c ON c.org_id = provenance.org_id AND c.product = p.product
LEFT JOIN public.bento_lifecycle_app_observations obs ON obs.org_id = j.org_id AND obs.product = j.product
    AND obs.app_incarnation = j.selected_app_incarnation
WHERE o.onboarding->>'intent' IN (p.product, 'both')
    AND public.lifecycle_v2_user_eligible(original.onboarding, original.created_at, original.created_via_invite);

-- Independent persisted-clock candidates. No mutable candidate JSON or outbox
-- selection is used. A clock boundary requires fresh full eligibility evaluation;
-- holds/caps/telemetry and sibling priority can still intentionally prevent send.
CREATE VIEW public.bento_lifecycle_clock_candidates_v1 AS
WITH phase_definitions AS (
    SELECT * FROM (VALUES
        (0,'trial7'::text,-8,7),(1,'trial3'::text,-3,12),(2,'today'::text,-1,14),
        (3,'expired'::text,0,15),(4,'post_help'::text,3,18),
        (5,'post_value'::text,8,23),(6,'post_feedback'::text,13,28)
    ) AS phases(phase_index, phase_key, offset_days, cumulative_wait)
), source AS (
    SELECT coverage.*, j.state, j.enrolled_at, j.selected_app_incarnation,
        GREATEST(COALESCE(public.lifecycle_v2_parse_timestamp(j.state->>'lastProgressAt'),j.enrolled_at),
            CASE WHEN j.selected_app_incarnation IS NULL
                THEN COALESCE(public.lifecycle_v2_parse_timestamp(j.state->>'appLessSince'),CURRENT_TIMESTAMP)
                ELSE j.enrolled_at END) AS idle_since,
        si.trial_at, si.status::text AS billing_status, si.subscription_id, o.has_usage_credits
    FROM public.bento_lifecycle_due_v1 coverage
    JOIN public.bento_lifecycle_journeys j ON j.org_id = coverage.org_id AND j.product = coverage.product
    JOIN public.orgs o ON o.id = j.org_id
    LEFT JOIN public.stripe_info si ON si.customer_id = o.customer_id
)
SELECT source.contract_version, source.org_id, source.product, clocks.purpose, clocks.due_at,
    clocks.expires_at, 'clock'::text AS due_scope, 'unknown'::text AS send_eligibility,
    source.last_evaluated_at, source.source_verified_at, source.source_healthy,
    'clock_requires_eligibility_evaluation'::text AS reason
FROM source
LEFT JOIN LATERAL (
    SELECT accepted.event_at FROM public.bento_event_dispatches accepted
    WHERE accepted.flow_key = 'lifecycle:v2:org' AND accepted.context_key = source.org_id::text
        AND accepted.recipient_key = 'org:' || source.org_id::text AND accepted.tag = 'reminder:24h'
        AND accepted.status = 'accepted' LIMIT 1
) first_reminder ON true
LEFT JOIN LATERAL (
    SELECT accepted.event_at FROM public.bento_event_dispatches accepted
    WHERE accepted.flow_key = 'lifecycle:v2:org' AND accepted.context_key = source.org_id::text
        AND accepted.recipient_key = 'org:' || source.org_id::text AND accepted.tag = 'reminder:48h'
        AND accepted.status = 'accepted' LIMIT 1
) second_reminder ON true
LEFT JOIN LATERAL (
    SELECT phase.phase_index, phase.cumulative_wait, accepted.event_at
    FROM public.bento_event_dispatches accepted
    JOIN phase_definitions phase ON accepted.tag = 'trial:' || phase.phase_key
    WHERE accepted.flow_key = 'lifecycle:v2:org' AND accepted.context_key = source.org_id::text
        AND accepted.recipient_key = 'org:' || source.org_id::text AND accepted.status = 'accepted'
    ORDER BY phase.phase_index DESC LIMIT 1
) previous_trial ON true
CROSS JOIN LATERAL (
    SELECT 'summary:' || (source.state->'batch'->>'key') AS purpose,
        public.lifecycle_v2_parse_timestamp(source.state->'batch'->>'openedAt') + INTERVAL '15 minutes' AS due_at,
        public.lifecycle_v2_parse_timestamp(source.state->'batch'->>'lastAt') + INTERVAL '1 day' AS expires_at
    WHERE source.state->'batch'->>'key' IS NOT NULL
        AND source.state->'batch'->>'incarnation' = source.selected_app_incarnation::text
    UNION ALL
    SELECT 'reminder:24h'::text, source.idle_since + INTERVAL '1 day', NULL::timestamptz
    WHERE source.state->>'firstValueAt' IS NULL AND first_reminder.event_at IS NULL
    UNION ALL
    SELECT 'reminder:48h'::text,
        GREATEST(source.idle_since + INTERVAL '2 days',first_reminder.event_at + INTERVAL '1 day'),NULL::timestamptz
    WHERE source.state->>'firstValueAt' IS NULL AND first_reminder.event_at IS NOT NULL AND second_reminder.event_at IS NULL
    UNION ALL
    SELECT 'reminder:final'::text,
        GREATEST(source.idle_since + INTERVAL '5 days',second_reminder.event_at + INTERVAL '1 day'),source.idle_since + INTERVAL '7 days'
    WHERE source.state->>'firstValueAt' IS NULL AND source.selected_app_incarnation IS NOT NULL
        AND first_reminder.event_at IS NOT NULL AND second_reminder.event_at IS NOT NULL
    UNION ALL
    SELECT 'trial:' || trial.phase_key, trial.due_at,
        CASE WHEN trial.phase_index < 3 THEN LEAST(trial.due_at + INTERVAL '1 day',source.trial_at)
            ELSE trial.due_at + INTERVAL '1 day' END
    FROM (
        SELECT phase.phase_key, phase.phase_index,
            GREATEST(source.trial_at + phase.offset_days * INTERVAL '1 day',
                CASE WHEN previous_trial.phase_index IS NOT NULL
                    THEN previous_trial.event_at + (phase.cumulative_wait - previous_trial.cumulative_wait) * INTERVAL '1 day'
                    ELSE source.enrolled_at + CASE WHEN phase.phase_index = 0 THEN INTERVAL '7 days' ELSE INTERVAL '0 days' END END) AS due_at
        FROM phase_definitions phase
        WHERE phase.phase_index > COALESCE(previous_trial.phase_index,-1)
    ) trial
    WHERE source.trial_at IS NOT NULL AND source.has_usage_credits IS FALSE
        AND NOT (COALESCE(source.billing_status,'') = 'succeeded' AND source.subscription_id IS NOT NULL)
) clocks
WHERE clocks.due_at IS NOT NULL AND (clocks.expires_at IS NULL OR clocks.due_at < clocks.expires_at)
    AND NOT EXISTS (
    SELECT 1 FROM public.bento_event_dispatches accepted
    WHERE accepted.flow_key = 'lifecycle:v2:org' AND accepted.context_key = source.org_id::text
        AND accepted.recipient_key = 'org:' || source.org_id::text AND accepted.tag = clocks.purpose AND accepted.status = 'accepted'
);

CREATE VIEW public.bento_lifecycle_timeline_v1 AS
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, d.id AS evidence_id, d.id AS decision_id,
    d.org_id, d.product, d.purpose, d.evaluated_at AS recorded_at, 'decision'::text AS kind,
    d.reason, NULL::uuid AS dispatch_id, NULL::smallint AS attempt_number, d.recipient_id, d.recipient_email
FROM public.bento_lifecycle_decisions d
UNION ALL
SELECT 'bento-lifecycle-monitor-v1'::text, a.id, NULL::uuid, a.org_id, a.product, a.purpose,
    a.recorded_at, a.kind, a.reason, a.dispatch_id, a.attempt_number, a.recipient_id, a.recipient_email
FROM public.bento_lifecycle_attempts a;

CREATE VIEW public.bento_lifecycle_snapshots_v1 AS
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, s.id AS snapshot_id, s.recorded_at,
    s.dispatch_id, s.attempt_number, s.org_id, s.product, s.purpose, s.recipient_id, s.recipient_email,
    s.event_name, s.variant, s.app_incarnation, s.policy_version, s.snapshot_checksum,
    s.expected_subject, s.personalization, 'expected_send_request'::text AS content_evidence
FROM public.bento_lifecycle_send_snapshots s;

-- Exact v2 policy claims only. Other lifecycle/legacy/transactional messages
-- contribute to recipient burden but are outside this rolling claim budget.
CREATE VIEW public.bento_lifecycle_claims_v1 AS
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, d.id AS dispatch_id,
    CASE WHEN d.details->'metadata'->>'orgId' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
        THEN (d.details->'metadata'->>'orgId')::uuid END AS org_id,
    CASE WHEN d.details->'metadata'->>'recipientId' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
        THEN (d.details->'metadata'->>'recipientId')::uuid END AS recipient_id,
    d.details->'metadata'->>'product' AS product, d.tag AS purpose,
    CASE WHEN d.status = 'accepted' THEN d.event_at ELSE d.last_attempt_at END AS claim_at,
    COALESCE(d.details->'metadata'->>'commercialOffer' = 'true'
        OR d.details->'metadata'->>'branch' IN ('subscription_proposition','checklist_complete_purchase'),false) AS commercial_offer,
    d.status AS claim_status, d.claim_until
FROM public.bento_event_dispatches d
WHERE d.flow_key LIKE 'lifecycle:v2:%'
    AND (d.status = 'accepted' OR (d.status = 'sending' AND d.claim_until > CURRENT_TIMESTAMP));

-- Positive-only milestone association, one first accepted cohort per org/product.
-- Overwritten lastProgressAt cannot establish a complete historical 48h absence.
-- Current subscription state/period anchors cannot establish a 7d conversion.
CREATE VIEW public.bento_lifecycle_outcomes_v1 AS
WITH first_accepted AS (
    SELECT DISTINCT ON (snapshot.org_id,snapshot.product)
        dispatch.id AS dispatch_id, dispatch.event_at AS accepted_at,
        snapshot.org_id,snapshot.product,snapshot.app_incarnation
    FROM public.bento_event_dispatches dispatch
    JOIN public.bento_lifecycle_send_snapshots snapshot ON snapshot.dispatch_id = dispatch.id
        AND snapshot.attempt_number = dispatch.attempt_count
    WHERE dispatch.flow_key = 'lifecycle:v2:org' AND dispatch.status = 'accepted'
    ORDER BY snapshot.org_id,snapshot.product,dispatch.event_at,dispatch.id
), milestones AS (
    SELECT first_accepted.*, provenance.original_creator_id,
        j.selected_app_incarnation,
        public.lifecycle_v2_parse_timestamp(j.state->>'checklistCompleteAt') AS checklist_complete_at,
        CASE WHEN first_accepted.product = 'ota'
            THEN public.lifecycle_v2_parse_timestamp(obs.verified->>'otaAppliedAt')
            ELSE public.lifecycle_v2_parse_timestamp(obs.verified->>'builderSucceededAt') END AS first_value_at,
        obs.verified_at AS source_verified_at, coverage.evaluated_at AS last_evaluated_at
    FROM first_accepted
    JOIN public.org_lifecycle_creators provenance ON provenance.org_id = first_accepted.org_id
    JOIN public.bento_lifecycle_journeys j ON j.org_id = first_accepted.org_id AND j.product = first_accepted.product
    LEFT JOIN public.bento_lifecycle_app_observations obs ON obs.org_id = first_accepted.org_id
        AND obs.product = first_accepted.product AND obs.app_incarnation = first_accepted.app_incarnation
    LEFT JOIN public.bento_lifecycle_evaluation_coverage coverage ON coverage.org_id = j.org_id AND coverage.product = j.product
)
SELECT 'bento-lifecycle-monitor-v1'::text AS contract_version, milestones.org_id,milestones.product,
    milestones.original_creator_id,'treatment'::text AS creator_cohort,milestones.dispatch_id,
    milestones.accepted_at,'provider_acceptance'::text AS anchor_evidence,milestones.app_incarnation,
    CASE WHEN milestones.app_incarnation IS NOT NULL
        THEN milestones.app_incarnation = milestones.selected_app_incarnation END AS incarnation_matches,
    milestones.accepted_at + INTERVAL '48 hours' <= CURRENT_TIMESTAMP AS setup48h_mature,
    milestones.checklist_complete_at,'organization_first_readiness'::text AS checklist_scope,
    milestones.first_value_at,milestones.source_verified_at,milestones.last_evaluated_at,
    CASE WHEN milestones.accepted_at + INTERVAL '48 hours' > CURRENT_TIMESTAMP THEN 'maturing'
        WHEN milestones.first_value_at > milestones.accepted_at AND milestones.first_value_at <= milestones.accepted_at + INTERVAL '48 hours' THEN 'verified_value_observed'
        WHEN milestones.checklist_complete_at > milestones.accepted_at AND milestones.checklist_complete_at <= milestones.accepted_at + INTERVAL '48 hours' THEN 'organization_readiness_observed'
        ELSE 'unknown' END AS setup48h_status,
    'unknown'::text AS subscription7d_status,'first_milestone_association'::text AS evidence_scope
FROM milestones;

ALTER VIEW public.bento_lifecycle_monitor_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_due_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_clock_candidates_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_timeline_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_snapshots_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_claims_v1 OWNER TO postgres;
ALTER VIEW public.bento_lifecycle_outcomes_v1 OWNER TO postgres;
REVOKE ALL ON public.bento_lifecycle_monitor_v1, public.bento_lifecycle_due_v1,
    public.bento_lifecycle_clock_candidates_v1, public.bento_lifecycle_timeline_v1,
    public.bento_lifecycle_snapshots_v1, public.bento_lifecycle_claims_v1, public.bento_lifecycle_outcomes_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bento_lifecycle_monitor_v1, public.bento_lifecycle_due_v1,
    public.bento_lifecycle_clock_candidates_v1, public.bento_lifecycle_timeline_v1,
    public.bento_lifecycle_snapshots_v1, public.bento_lifecycle_claims_v1, public.bento_lifecycle_outcomes_v1 TO service_role;
COMMENT ON VIEW public.bento_lifecycle_snapshots_v1 IS 'Restricted expected resolved request content. Never archived rendered HTML, inbox delivery or proof of exact template execution.';
