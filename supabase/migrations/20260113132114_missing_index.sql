create index on public.channel_devices using btree (device_id);

create index on public.notifications using btree (uniq_id);

create index on public.app_versions using btree (cli_version);
