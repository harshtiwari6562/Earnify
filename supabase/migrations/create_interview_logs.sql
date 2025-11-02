-- Create interview_logs table for monitoring remote interviews
CREATE TABLE IF NOT EXISTS interview_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_interview_logs_user_id ON interview_logs(user_id);

-- Create index on timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_interview_logs_timestamp ON interview_logs(timestamp);

-- Create index on event_type for filtering
CREATE INDEX IF NOT EXISTS idx_interview_logs_event_type ON interview_logs(event_type);

-- Enable Row Level Security
ALTER TABLE interview_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own interview logs"
  ON interview_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: System can insert logs (via service role)
-- Note: In production, you may want to use service role key for insertions
CREATE POLICY "Users can insert own interview logs"
  ON interview_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

