-- Agentic Sandbox Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Connectors table
CREATE TABLE IF NOT EXISTS connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    auth_type VARCHAR(20) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_connector_type UNIQUE(type)
);

-- Users table (mock users for OAuth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    connector_id UUID REFERENCES connectors(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'user',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OAuth tokens table
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NetSuite customers table
CREATE TABLE IF NOT EXISTS netsuite_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    is_person BOOLEAN DEFAULT false,
    subsidiary VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'USD',
    terms VARCHAR(100),
    balance DECIMAL(15, 2) DEFAULT 0,
    unbilled_orders DECIMAL(15, 2) DEFAULT 0,
    overdue_balance DECIMAL(15, 2) DEFAULT 0,
    billing_address JSONB,
    shipping_address JSONB,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NetSuite invoices table
CREATE TABLE IF NOT EXISTS netsuite_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tran_id VARCHAR(50) NOT NULL UNIQUE,
    entity UUID REFERENCES netsuite_customers(id) ON DELETE CASCADE,
    entity_name VARCHAR(255) NOT NULL,
    tran_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_total DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) NOT NULL,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    amount_remaining DECIMAL(15, 2) NOT NULL,
    items JSONB NOT NULL,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Salesforce accounts table (for future use)
CREATE TABLE IF NOT EXISTS salesforce_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sf_id VARCHAR(18) UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    industry VARCHAR(100),
    annual_revenue DECIMAL(15, 2),
    number_of_employees INTEGER,
    billing_address JSONB,
    phone VARCHAR(50),
    website VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data generation jobs table
CREATE TABLE IF NOT EXISTS data_generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connector_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    count INTEGER NOT NULL,
    industry VARCHAR(100),
    scenario VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    records_generated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_connector ON users(connector_id);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_access ON oauth_tokens(access_token);
CREATE INDEX idx_netsuite_customers_email ON netsuite_customers(email);
CREATE INDEX idx_netsuite_customers_company ON netsuite_customers(company_name);
CREATE INDEX idx_netsuite_invoices_entity ON netsuite_invoices(entity);
CREATE INDEX idx_netsuite_invoices_status ON netsuite_invoices(status);
CREATE INDEX idx_netsuite_invoices_tran_id ON netsuite_invoices(tran_id);
CREATE INDEX idx_data_gen_jobs_status ON data_generation_jobs(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON connectors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_netsuite_customers_updated_at BEFORE UPDATE ON netsuite_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_netsuite_invoices_updated_at BEFORE UPDATE ON netsuite_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_salesforce_accounts_updated_at BEFORE UPDATE ON salesforce_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default connectors
INSERT INTO connectors (name, type, auth_type, base_url, settings) VALUES
    ('NetSuite', 'netsuite', 'oauth1', 'https://tstdrv123456.suitetalk.api.netsuite.com', '{"version": "v1"}'),
    ('Salesforce', 'salesforce', 'oauth2', 'https://na1.salesforce.com', '{"api_version": "v59.0"}'),
    ('HubSpot', 'hubspot', 'oauth2', 'https://api.hubapi.com', '{"api_version": "v3"}'),
    ('QuickBooks', 'quickbooks', 'oauth2', 'https://sandbox-quickbooks.api.intuit.com', '{"api_version": "v3"}')
ON CONFLICT (type) DO NOTHING;
