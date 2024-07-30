CREATE OR REPLACE FUNCTION upsert_notification(
  p_event TEXT,
  p_uniq_id TEXT,
  p_owner_org TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO notifications (event, uniq_id, owner_org, last_send_at, total_send)
  VALUES (p_event, p_uniq_id, p_owner_org, NOW(), 1)
  ON CONFLICT (event, uniq_id, owner_org)
  DO UPDATE SET
    last_send_at = NOW(),
    total_send = notifications.total_send + 1;
END;
$$ LANGUAGE plpgsql;
