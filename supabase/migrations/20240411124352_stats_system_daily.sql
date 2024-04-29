CREATE TABLE daily_mau (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  mau INTEGER NOT NULL,
  UNIQUE (app_id, date)
);
CREATE INDEX idx_daily_mau_app_id_date ON daily_mau (app_id, date);


CREATE TABLE daily_bandwidth (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  bandwidth BIGINT NOT NULL,
  UNIQUE (app_id, date)
);
CREATE INDEX idx_daily_bandwidth_app_id_date ON daily_bandwidth (app_id, date);


CREATE TABLE daily_storage (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  storage BIGINT NOT NULL,
  UNIQUE (app_id, date)
);
CREATE INDEX idx_daily_storage_app_id_date ON daily_storage (app_id, date);

CREATE TABLE daily_version (
  date DATE,
  app_id VARCHAR(255),
  version_id BIGINT,
  get BIGINT,
  fail BIGINT,
  install BIGINT,
  uninstall BIGINT,
  PRIMARY KEY (date, app_id, version)
);
CREATE INDEX idx_daily_version_date ON daily_version (date);
CREATE INDEX idx_daily_version_app_id ON daily_version (app_id);
CREATE INDEX idx_daily_version_version ON daily_version (version_id);

CREATE TABLE storage_usage (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  app_id VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE version_usage (
  timestamp TIMESTAMP,
  app_id VARCHAR(255),
  version_id BIGINT,
  action VARCHAR(20),
  PRIMARY KEY (timestamp, app_id, version_id, action)
);
CREATE INDEX idx_logs_raw_timestamp ON version_usage (timestamp);
CREATE INDEX idx_logs_raw_app_id ON version_usage (app_id);
CREATE INDEX idx_logs_raw_version ON version_usage (version_id);
CREATE INDEX idx_logs_raw_action ON version_usage (action);


CREATE INDEX idx_device_usage_device_id ON device_usage (device_id);
CREATE INDEX idx_device_usage_app_id ON device_usage (app_id);
CREATE INDEX idx_device_usage_timestamp ON device_usage (timestamp);

CREATE INDEX idx_bandwidth_usage_device_id ON bandwidth_usage (device_id);
CREATE INDEX idx_bandwidth_usage_app_id ON bandwidth_usage (app_id);
CREATE INDEX idx_bandwidth_usage_timestamp ON bandwidth_usage (timestamp);

