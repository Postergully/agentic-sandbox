-- Register NetSuite Original Instance
-- Version: 1.0.0
-- Description: Registers the existing NetSuite mock server as netsuite_original in the registry.
--              This makes the existing NetSuite implementation discoverable through the Factory API.

-- ============================================================================
-- REGISTER NETSUITE_ORIGINAL INSTANCE
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
    'netsuite_original',
    'netsuite',
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
            "name": "netsuite",
            "type": "erp",
            "supported": true,
            "entities": [
                {"name": "customer", "estimatedVolume": 100},
                {"name": "invoice", "estimatedVolume": 500},
                {"name": "vendor", "estimatedVolume": 50},
                {"name": "item", "estimatedVolume": 200},
                {"name": "salesorder", "estimatedVolume": 300},
                {"name": "purchaseorder", "estimatedVolume": 150}
            ]
        }],
        "metadata": {
            "industry": "technology",
            "companySize": "enterprise",
            "region": "US"
        }
    }'::jsonb,
    -- Connector Schema (summary from schemas/netsuite.json - 72 entities)
    '{
        "name": "netsuite",
        "version": "2025.2.0",
        "baseUrl": "/api/netsuite",
        "auth": {
            "type": "tba",
            "fields": ["accountId", "consumerKey", "consumerSecret", "tokenId", "tokenSecret"],
            "config": {
                "signatureMethod": "HMAC-SHA256",
                "realm": "account_id"
            }
        },
        "entityCount": 72,
        "coreEntities": [
            "Customer", "Vendor", "Contact", "Employee",
            "Invoice", "Salesorder", "Purchaseorder", "Cashsale",
            "Item", "Inventoryitem", "Serviceitem", "Noninventoryitem",
            "Account", "Department", "Location", "Subsidiary"
        ]
    }'::jsonb,
    -- SSL Config (placeholder for HTTPS setup)
    '{
        "domain": "mockacct.suitetalk.api.netsuite.com",
        "localIp": "127.0.0.1",
        "port": 443,
        "hostsEntryAdded": false,
        "certsGenerated": false
    }'::jsonb,
    -- Access URLs
    'http://localhost:3002',          -- base_url
    '/api/netsuite',                   -- api_base_path
    '/api/auth/token',                 -- auth_endpoint
    -- Mock Credentials
    '{
        "accountId": "MOCK_ACCOUNT_ID",
        "consumerKey": "mock-consumer-key",
        "consumerSecret": "mock-consumer-secret",
        "tokenId": "mock-token-id",
        "tokenSecret": "mock-token-secret"
    }'::jsonb,
    72,                                -- entity_count (72 entities in schema)
    -- Record Counts (from existing seed data in migrations/002_seed_data.sql)
    '{
        "customers": 100,
        "invoices": 500,
        "vendors": 50,
        "items": 200,
        "employees": 25,
        "contacts": 150,
        "salesorders": 300,
        "purchaseorders": 150
    }'::jsonb,
    'schemas/netsuite.json',           -- api_docs_source
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
'Registry of mock server instances. netsuite_original is the base template for NetSuite connectors.';
