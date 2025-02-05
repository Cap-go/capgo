REVOKE ALL PRIVILEGES ON FUNCTION set_mau_exceeded_by_org(UUID, boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION set_mau_exceeded_by_org(UUID, boolean) FROM authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION set_mau_exceeded_by_org(UUID, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_mau_exceeded_by_org(UUID, boolean) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION set_storage_exceeded_by_org(UUID, boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION set_storage_exceeded_by_org(UUID, boolean) FROM authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION set_storage_exceeded_by_org(UUID, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_storage_exceeded_by_org(UUID, boolean) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION set_bandwidth_exceeded_by_org(UUID, boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION set_bandwidth_exceeded_by_org(UUID, boolean) FROM authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION set_bandwidth_exceeded_by_org(UUID, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_bandwidth_exceeded_by_org(UUID, boolean) TO service_role;
