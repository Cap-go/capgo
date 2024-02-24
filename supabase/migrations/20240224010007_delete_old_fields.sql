-- remove channel filde from table plans
ALTER TABLE 'app' DROP COLUMN channel;
ALTER TABLE 'channel' DROP COLUMN channel;
ALTER TABLE 'update' DROP COLUMN channel;
ALTER TABLE 'version' DROP COLUMN channel;
ALTER TABLE 'shared' DROP COLUMN channel;
ALTER TABLE 'abtest' DROP COLUMN channel;
ALTER TABLE 'progressive_deploy' DROP COLUMN channel;
