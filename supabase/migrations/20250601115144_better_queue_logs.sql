-- Create the type for the input array first
CREATE TYPE message_update AS (msg_id bigint, cf_id varchar, queue varchar);

CREATE OR REPLACE FUNCTION mass_edit_queue_messages_cf_ids (updates public.message_update[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  update_record public.message_update;
  current_message jsonb;
  current_cf_ids jsonb;
BEGIN
  FOR update_record IN SELECT * FROM unnest(updates)
  LOOP
    -- Get the current message using dynamic SQL
    EXECUTE format(
      'SELECT message FROM pgmq.q_%I WHERE msg_id = $1',
      update_record.queue
    ) INTO current_message USING update_record.msg_id;

    IF current_message IS NOT NULL THEN
      -- Check if cf_ids exists and is an array
      current_cf_ids := current_message->'cf_ids';
      
      IF current_cf_ids IS NULL OR NOT jsonb_typeof(current_cf_ids) = 'array' THEN
        -- Create new cf_ids array with single element
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          jsonb_build_array(update_record.cf_id)
        );
      ELSE
        -- Append new cf_id to existing array
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          current_cf_ids || jsonb_build_array(update_record.cf_id)
        );
      END IF;

      -- Update the message
      EXECUTE format(
        'UPDATE pgmq.q_%I SET message = $1 WHERE msg_id = $2',
        update_record.queue
      ) USING current_message, update_record.msg_id;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permission to postgres role only
REVOKE ALL ON FUNCTION mass_edit_queue_messages_cf_ids (message_update[])
FROM
  PUBLIC;

GRANT
EXECUTE ON FUNCTION mass_edit_queue_messages_cf_ids (message_update[]) TO postgres;
