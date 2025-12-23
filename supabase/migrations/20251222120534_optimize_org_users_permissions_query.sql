/*
 * Organization Email Domain Auto-Join - Permission Query Optimization
 * 
 * PURPOSE:
 * Optimizes database performance for organization permission checks used throughout
 * the auto-join feature and other organization-related API endpoints.
 * 
 * PROBLEM ADDRESSED:
 * The auto-join feature's GET/PUT endpoints query org_users table to verify permissions.
 * 
 * Previous state:
 * - Separate single-column indexes on org_id and user_id
 * - Postgres had to use one index then scan for other column
 * - Required table heap lookup to get user_right, app_id, channel_id
 * - Slower query execution, higher I/O
 * 
 * OPTIMIZATION IMPLEMENTED:
 * Creates composite covering index: idx_org_users_org_user_covering
 * - Composite index on (org_id, user_id) for efficient two-column filtering
 * - INCLUDE clause adds (user_right, app_id, channel_id) to index
 * - Enables index-only scans (no table heap lookup needed)
 * - Significantly faster permission checks
 * 
 * PERFORMANCE BENEFITS:
 * - Faster lookups: Composite index optimizes two-column WHERE clause
 * - Reduced I/O: Covering index eliminates table heap lookups
 * - Lower CPU usage: Simpler execution plan
 * - Better scalability: Performance improves with table size
 * 
 * INDEX STRUCTURE:
 * CREATE INDEX idx_org_users_org_user_covering 
 * ON org_users (org_id, user_id) 
 * INCLUDE (user_right, app_id, channel_id);
 * 
 * Column order rationale:
 * - org_id first (higher cardinality - many organizations)
 * - user_id second (more selective within an org)
 * - Allows efficient range scans if needed in future
 * 
 * USED BY:
 * - /private/organization_domains_get - Read domain configuration
 * - /private/organization_domains_put - Update domain configuration  
 * - Other organization permission checks throughout the application
 * 
 * Related migration: 20251222054835_add_org_email_domain_auto_join.sql
 * Migration created: 2024-12-22
 */

-- Optimize org_users permission queries
-- This composite covering index significantly improves performance of permission check queries
-- that filter by org_id and user_id, which is the primary access pattern for authorization checks

-- Create a composite index on (org_id, user_id) with covering columns
-- INCLUDE clause adds user_right, app_id, channel_id to the index so queries can be satisfied
-- entirely from the index without hitting the table (index-only scan)
CREATE INDEX IF NOT EXISTS idx_org_users_org_user_covering 
ON org_users (org_id, user_id) 
INCLUDE (user_right, app_id, channel_id);

-- Analyze the table to update query planner statistics
ANALYZE org_users;

-- Performance rationale:
-- 1. Composite index (org_id, user_id) optimizes the WHERE clause perfectly
--    Postgres can use both columns for filtering efficiently
--    Much faster than using two separate single-column indexes (no index intersection needed)
--
-- 2. INCLUDE clause creates a "covering index" 
--    Index contains all columns needed by the query (org_id, user_id, user_right, app_id, channel_id)
--    Eliminates table heap lookups entirely (index-only scan)
--    Reduces I/O significantly for frequent permission checks
--
-- 3. Column order (org_id, user_id) is optimal because:
--    org_id is the higher-cardinality column (many orgs)
--    user_id is the more selective filter within an org
--    Allows efficient range scans if needed in the future
--
-- This is used by all permission checks in private API endpoints
