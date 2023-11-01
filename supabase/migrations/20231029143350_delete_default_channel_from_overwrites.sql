DO $$
DECLARE
  app_record RECORD;
  app_channels channels[];
BEGIN
    FOR app_record IN 
      SELECT * FROM apps
    LOOP
      select array(select row (channels.*) from channels where channels.app_id = app_record.app_id and channels.public = true) into app_channels;

      -- Do not run for apps that do not have a clear public channel
      continue when ((array_length(app_channels, 1)) != 1);

      DELETE FROM channel_devices WHERE channel_devices.app_id=app_record.app_id and channel_devices.channel_id=app_channels[1].id;
    END LOOP;
END $$;