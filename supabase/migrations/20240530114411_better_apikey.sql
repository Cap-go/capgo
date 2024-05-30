ALTER TABLE apikeys
ADD COLUMN name varchar;

UPDATE apikeys
set name=format('Apikey %s', apikeys.id);

ALTER TABLE apikeys
ALTER COLUMN name SET NOT NULL;