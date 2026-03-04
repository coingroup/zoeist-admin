-- Phase 9: Compliance Automation - Alert Log table
CREATE TABLE compliance_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deadline_id uuid REFERENCES compliance_deadlines(id) ON DELETE CASCADE,
  alert_days int NOT NULL,
  sent_to text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  sendgrid_status text
);

CREATE INDEX idx_cal_deadline ON compliance_alert_log(deadline_id, alert_days);
ALTER TABLE compliance_alert_log ENABLE ROW LEVEL SECURITY;
