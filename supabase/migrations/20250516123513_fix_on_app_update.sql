-- This had to be run manually as the migration cannot modify the net schema
-- CREATE INDEX idx_http_response_id ON net._http_response(id);
-- CREATE INDEX ON pgmq.q_on_version_update USING btree (read_ct);

-- CREATE INDEX idx_http_request_queue_id ON net.http_request_queue(id);
-- CREATE INDEX idx_http_request_queue_id_covering ON net.http_request_queue(id) 
-- INCLUDE (method, url, timeout_milliseconds, headers, body);
