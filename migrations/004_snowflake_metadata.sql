-- Snowflake Mock Server Metadata Schema
-- Version: 1.0.0
-- Description: Metadata tables for Snowflake mock server (isolated from netsuite_* tables)

-- ============================================================================
-- SNOWFLAKE METADATA TABLES
-- ============================================================================

-- Snowflake databases table
CREATE TABLE IF NOT EXISTS snowflake_databases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    owner VARCHAR(255) NOT NULL DEFAULT 'ACCOUNTADMIN',
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Snowflake schemas table
CREATE TABLE IF NOT EXISTS snowflake_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    database_id UUID NOT NULL REFERENCES snowflake_databases(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL DEFAULT 'ACCOUNTADMIN',
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_schema_per_database UNIQUE(database_id, name)
);

-- Snowflake tables metadata table
CREATE TABLE IF NOT EXISTS snowflake_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES snowflake_schemas(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    table_type VARCHAR(50) NOT NULL DEFAULT 'TABLE',
    row_count BIGINT DEFAULT 0,
    bytes BIGINT DEFAULT 0,
    retention_time INTEGER DEFAULT 1,
    cluster_by TEXT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_table_per_schema UNIQUE(schema_id, name)
);

-- Snowflake columns metadata table
CREATE TABLE IF NOT EXISTS snowflake_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID NOT NULL REFERENCES snowflake_tables(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(100) NOT NULL,
    nullable BOOLEAN DEFAULT true,
    ordinal_position INTEGER NOT NULL,
    default_value TEXT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_column_per_table UNIQUE(table_id, name),
    CONSTRAINT unique_ordinal_per_table UNIQUE(table_id, ordinal_position)
);

-- Snowflake warehouses table
CREATE TABLE IF NOT EXISTS snowflake_warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    size VARCHAR(20) NOT NULL DEFAULT 'X-Small',
    state VARCHAR(20) NOT NULL DEFAULT 'SUSPENDED',
    type VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    min_cluster_count INTEGER DEFAULT 1,
    max_cluster_count INTEGER DEFAULT 1,
    auto_suspend_seconds INTEGER DEFAULT 600,
    auto_resume BOOLEAN DEFAULT true,
    owner VARCHAR(255) NOT NULL DEFAULT 'ACCOUNTADMIN',
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_size CHECK (size IN ('X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2X-Large', '3X-Large', '4X-Large', '5X-Large', '6X-Large')),
    CONSTRAINT valid_state CHECK (state IN ('STARTED', 'SUSPENDED', 'RESIZING'))
);

-- Snowflake query history table
CREATE TABLE IF NOT EXISTS snowflake_query_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement_handle UUID NOT NULL DEFAULT uuid_generate_v4(),
    warehouse_id UUID REFERENCES snowflake_warehouses(id) ON DELETE SET NULL,
    database_name VARCHAR(255),
    schema_name VARCHAR(255),
    sql_text TEXT NOT NULL,
    query_type VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    error_code VARCHAR(20),
    error_message TEXT,
    rows_produced INTEGER DEFAULT 0,
    rows_affected INTEGER DEFAULT 0,
    bytes_scanned BIGINT DEFAULT 0,
    execution_time_ms INTEGER DEFAULT 0,
    compilation_time_ms INTEGER DEFAULT 0,
    queued_time_ms INTEGER DEFAULT 0,
    user_name VARCHAR(255) DEFAULT 'MOCK_USER',
    role_name VARCHAR(255) DEFAULT 'PUBLIC',
    session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'BLOCKED'))
);

-- ============================================================================
-- INDEXES FOR SNOWFLAKE METADATA
-- ============================================================================

CREATE INDEX idx_snowflake_schemas_database ON snowflake_schemas(database_id);
CREATE INDEX idx_snowflake_tables_schema ON snowflake_tables(schema_id);
CREATE INDEX idx_snowflake_columns_table ON snowflake_columns(table_id);
CREATE INDEX idx_snowflake_query_history_warehouse ON snowflake_query_history(warehouse_id);
CREATE INDEX idx_snowflake_query_history_status ON snowflake_query_history(status);
CREATE INDEX idx_snowflake_query_history_created ON snowflake_query_history(created_at DESC);
CREATE INDEX idx_snowflake_query_history_statement ON snowflake_query_history(statement_handle);

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================================================

CREATE TRIGGER update_snowflake_databases_updated_at BEFORE UPDATE ON snowflake_databases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snowflake_schemas_updated_at BEFORE UPDATE ON snowflake_schemas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snowflake_tables_updated_at BEFORE UPDATE ON snowflake_tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snowflake_warehouses_updated_at BEFORE UPDATE ON snowflake_warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DEFAULT METADATA
-- ============================================================================

-- Insert default database: MOCK_DB
INSERT INTO snowflake_databases (id, name, owner, comment)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'MOCK_DB',
    'ACCOUNTADMIN',
    'Default mock database for Snowflake simulation'
) ON CONFLICT (name) DO NOTHING;

-- Insert default schemas: PUBLIC and ANALYTICS
INSERT INTO snowflake_schemas (id, database_id, name, owner, comment)
VALUES
(
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'PUBLIC',
    'ACCOUNTADMIN',
    'Default public schema'
),
(
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'ANALYTICS',
    'ACCOUNTADMIN',
    'Analytics schema for business intelligence data'
) ON CONFLICT (database_id, name) DO NOTHING;

-- Insert default warehouse: COMPUTE_WH
INSERT INTO snowflake_warehouses (id, name, size, state, auto_suspend_seconds, auto_resume, owner, comment)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'COMPUTE_WH',
    'Small',
    'STARTED',
    300,
    true,
    'ACCOUNTADMIN',
    'Default compute warehouse for query execution'
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- REGISTER SNOWFLAKE CONNECTOR
-- ============================================================================

INSERT INTO connectors (name, type, auth_type, base_url, settings)
VALUES (
    'Snowflake',
    'snowflake',
    'oauth2',
    'https://mock-account.snowflakecomputing.com',
    '{"api_version": "v1", "account": "MOCK_ACCOUNT", "region": "us-west-2"}'
) ON CONFLICT (type) DO NOTHING;
