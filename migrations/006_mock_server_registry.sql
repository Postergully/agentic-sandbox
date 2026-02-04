-- Mock Server Registry Schema
-- Version: 1.0.0
-- Description: Registry table for tracking mock server instances created by the Mock Server Factory.
--              Each connector instance (e.g., netsuite_sharechat_331) gets its own isolated
--              PostgreSQL schema and is tracked here for lifecycle management.

-- ============================================================================
-- MOCK SERVER REGISTRY TABLE
-- ============================================================================

-- Core registry table for tracking mock server instances
CREATE TABLE IF NOT EXISTS mock_server_registry (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id VARCHAR(255) UNIQUE NOT NULL,     -- Unique instance identifier (e.g., netsuite_sharechat_331)
    connector VARCHAR(100) NOT NULL,               -- Connector type (e.g., netsuite, snowflake, google_workspace)
    org_id VARCHAR(100) NOT NULL,                  -- Organization identifier (e.g., sharechat)
    job_id VARCHAR(100),                           -- Optional job/request identifier (e.g., 331)

    -- Instance status lifecycle
    status VARCHAR(50) DEFAULT 'creating' NOT NULL,  -- creating, active, stopped, error
    error_message TEXT,                              -- Error details if status = 'error'

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_accessed_at TIMESTAMP,                      -- Track usage for cleanup policies

    -- Configuration (stored as JSONB for flexibility)
    generation_brief JSONB,                        -- Full GenerationBrief used to create instance
    connector_schema JSONB,                        -- Parsed ConnectorSchema (entities, fields, relationships)
    ssl_config JSONB,                              -- SSL/TLS and DNS configuration

    -- Access information for clients
    base_url VARCHAR(500),                         -- Full base URL (e.g., https://mockorg-mockaccount.snowflakecomputing.com)
    api_base_path VARCHAR(255),                    -- API path prefix (e.g., /api/v1)
    auth_endpoint VARCHAR(255),                    -- OAuth token endpoint (e.g., /oauth/token)

    -- Mock credentials (generated for this instance)
    mock_credentials JSONB,                        -- { client_id, client_secret, api_key, etc. }

    -- Data statistics
    entity_count INTEGER DEFAULT 0,                -- Number of entities/tables created
    record_counts JSONB DEFAULT '{}',              -- Per-entity record counts { "customers": 100, "invoices": 500 }

    -- Schema source information
    api_docs_source VARCHAR(500),                  -- URL or path used to infer schema

    -- PostgreSQL isolation
    pg_schema VARCHAR(255) NOT NULL,               -- PostgreSQL schema name for data isolation

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('creating', 'active', 'stopped', 'error')),
    CONSTRAINT unique_org_connector_job UNIQUE (connector, org_id, job_id)
);

-- ============================================================================
-- INDEXES FOR EFFICIENT LOOKUPS
-- ============================================================================

-- Index for filtering by connector type
CREATE INDEX idx_mock_registry_connector ON mock_server_registry(connector);

-- Index for filtering by organization
CREATE INDEX idx_mock_registry_org ON mock_server_registry(org_id);

-- Index for status-based queries (e.g., find all active instances)
CREATE INDEX idx_mock_registry_status ON mock_server_registry(status);

-- Composite index for common lookup pattern
CREATE INDEX idx_mock_registry_connector_org ON mock_server_registry(connector, org_id);

-- Index for cleanup queries (find stale instances)
CREATE INDEX idx_mock_registry_last_accessed ON mock_server_registry(last_accessed_at);

-- ============================================================================
-- TRIGGER FOR UPDATED_AT TIMESTAMP
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mock_registry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invoke the function on updates
CREATE TRIGGER trigger_mock_registry_updated_at
    BEFORE UPDATE ON mock_server_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_mock_registry_timestamp();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE mock_server_registry IS 'Registry of mock server instances created by the Mock Server Factory';
COMMENT ON COLUMN mock_server_registry.instance_id IS 'Unique identifier for the mock server instance (format: connector_org_job)';
COMMENT ON COLUMN mock_server_registry.connector IS 'Type of connector being mocked (netsuite, snowflake, etc.)';
COMMENT ON COLUMN mock_server_registry.org_id IS 'Organization or tenant identifier';
COMMENT ON COLUMN mock_server_registry.job_id IS 'Optional job or request identifier for tracking';
COMMENT ON COLUMN mock_server_registry.status IS 'Instance lifecycle status: creating, active, stopped, error';
COMMENT ON COLUMN mock_server_registry.generation_brief IS 'Full GenerationBrief JSON used to create this instance';
COMMENT ON COLUMN mock_server_registry.connector_schema IS 'Parsed ConnectorSchema with entities and relationships';
COMMENT ON COLUMN mock_server_registry.mock_credentials IS 'Generated mock OAuth/API credentials for this instance';
COMMENT ON COLUMN mock_server_registry.pg_schema IS 'PostgreSQL schema name where instance data is stored (isolation)';
