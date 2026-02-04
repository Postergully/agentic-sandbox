-- Register Snowflake Original Instance
-- Version: 1.0.0
-- Description: Registers the existing Snowflake mock server as snowflake_original in the registry.
--              This makes the existing Snowflake implementation discoverable through the Factory API.

-- ============================================================================
-- REGISTER SNOWFLAKE_ORIGINAL INSTANCE
-- ============================================================================

INSERT INTO mock_server_registry (
    id,
    instance_id,
    connector,
    org_id,
    job_id,
    status,
    error_message,
    last_accessed_at,
    generation_brief,
    connector_schema,
    ssl_config,
    base_url,
    api_base_path,
    auth_endpoint,
    mock_credentials,
    entity_count,
    record_counts,
    api_docs_source,
    pg_schema
) VALUES (
    uuid_generate_v4(),
    'snowflake_original',
    'snowflake',
    'original',
    NULL,
    'active',
    NULL,
    CURRENT_TIMESTAMP,
    -- Generation Brief (minimal for original/template instance)
    '{
        "jobId": "original",
        "orgId": "original",
        "sessionId": "bootstrap",
        "connectors": [{
            "name": "snowflake",
            "type": "data_warehouse",
            "supported": true,
            "entities": [
                {"name": "databases", "estimatedVolume": 6},
                {"name": "schemas", "estimatedVolume": 20},
                {"name": "warehouses", "estimatedVolume": 6},
                {"name": "customers", "estimatedVolume": 100},
                {"name": "orders", "estimatedVolume": 500},
                {"name": "products", "estimatedVolume": 50},
                {"name": "order_items", "estimatedVolume": 1500}
            ]
        }],
        "metadata": {
            "industry": "technology",
            "companySize": "enterprise",
            "region": "US"
        }
    }'::jsonb,
    -- Connector Schema (reference to schemas/snowflake.json)
    '{
        "connectorId": "snowflake",
        "connectorName": "Snowflake",
        "connectorType": "data_warehouse",
        "version": "1.0.0",
        "authentication": {
            "type": "oauth2",
            "flows": ["client_credentials", "jwt_bearer"],
            "endpoints": {
                "token": "/oauth/token-request"
            }
        },
        "baseUrl": "/api/v2",
        "entities": ["databases", "schemas", "warehouses", "customers", "orders", "products", "order_items", "query_history", "statements"],
        "tableMapping": {
            "CUSTOMERS": "snowflake_sample_customers",
            "ORDERS": "snowflake_sample_orders",
            "PRODUCTS": "snowflake_sample_products",
            "ORDER_ITEMS": "snowflake_sample_order_items"
        }
    }'::jsonb,
    -- SSL Config (placeholder for HTTPS setup)
    '{
        "domain": "mockorg-mockaccount.snowflakecomputing.com",
        "localIp": "127.0.0.1",
        "port": 443,
        "hostsEntryAdded": false,
        "certsGenerated": false
    }'::jsonb,
    -- Access URLs
    'http://localhost:3002',          -- base_url
    '/api/v2',                         -- api_base_path
    '/oauth/token-request',            -- auth_endpoint
    -- Mock Credentials
    '{
        "clientId": "mock-snowflake-client",
        "clientSecret": "mock-snowflake-secret",
        "accountIdentifier": "mockorg-mockaccount"
    }'::jsonb,
    9,                                 -- entity_count (9 entities in schema)
    -- Record Counts (from existing seed data)
    '{
        "databases": 6,
        "schemas": 20,
        "warehouses": 6,
        "customers": 100,
        "orders": 500,
        "products": 50,
        "order_items": 1500,
        "query_history": 0,
        "statements": 0
    }'::jsonb,
    'schemas/snowflake.json',          -- api_docs_source
    'public'                           -- pg_schema (uses public schema for original)
)
ON CONFLICT (instance_id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = CURRENT_TIMESTAMP,
    connector_schema = EXCLUDED.connector_schema,
    record_counts = EXCLUDED.record_counts;

-- ============================================================================
-- VERIFICATION COMMENT
-- ============================================================================

COMMENT ON TABLE mock_server_registry IS
'Registry of mock server instances. snowflake_original is the base template for Snowflake connectors.';
