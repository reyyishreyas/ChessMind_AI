-- Observability: record every LLM call (provider, model, latency, status).
-- Written via the service role from server routes; reads are ops/admin only.
CREATE TABLE IF NOT EXISTS llm_calls (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  parse_count INTEGER,
  error TEXT,
  prompt TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_calls_ts ON llm_calls (ts DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_model ON llm_calls (provider, model);

ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;

-- Inserts are server-side (service role bypasses RLS); the policy keeps
-- anon/authenticated clients out of the table entirely.
CREATE POLICY "llm_calls are server-side only" ON llm_calls
  FOR ALL USING (false) WITH CHECK (false);