-- Seed sample NetSuite customers
INSERT INTO netsuite_customers (
    id, company_name, first_name, last_name, email, phone, is_person,
    subsidiary, currency, terms, balance, unbilled_orders, overdue_balance,
    billing_address, shipping_address
) VALUES
(
    '550e8400-e29b-41d4-a716-446655440001',
    'Acme Corporation',
    'John',
    'Smith',
    'john.smith@acme.com',
    '+1-555-0101',
    false,
    'Parent Company',
    'USD',
    'Net 30',
    15000.00,
    5000.00,
    2000.00,
    '{"addr1": "123 Main St", "city": "New York", "state": "NY", "zip": "10001", "country": "US"}',
    '{"addr1": "123 Main St", "city": "New York", "state": "NY", "zip": "10001", "country": "US"}'
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    'TechStart Inc',
    'Jane',
    'Doe',
    'jane.doe@techstart.io',
    '+1-555-0102',
    false,
    'Parent Company',
    'USD',
    'Net 15',
    8500.00,
    2000.00,
    500.00,
    '{"addr1": "456 Tech Ave", "city": "San Francisco", "state": "CA", "zip": "94103", "country": "US"}',
    '{"addr1": "456 Tech Ave", "city": "San Francisco", "state": "CA", "zip": "94103", "country": "US"}'
),
(
    '550e8400-e29b-41d4-a716-446655440003',
    'Global Enterprises',
    'Robert',
    'Johnson',
    'robert.j@global-ent.com',
    '+1-555-0103',
    false,
    'Parent Company',
    'USD',
    'Net 45',
    45000.00,
    12000.00,
    8000.00,
    '{"addr1": "789 Business Blvd", "city": "Chicago", "state": "IL", "zip": "60601", "country": "US"}',
    '{"addr1": "789 Business Blvd", "city": "Chicago", "state": "IL", "zip": "60601", "country": "US"}'
),
(
    '550e8400-e29b-41d4-a716-446655440004',
    'Retail Solutions LLC',
    'Mary',
    'Williams',
    'mary.w@retail-solutions.com',
    '+1-555-0104',
    false,
    'Parent Company',
    'USD',
    'Net 30',
    22000.00,
    7000.00,
    3000.00,
    '{"addr1": "321 Commerce Dr", "city": "Seattle", "state": "WA", "zip": "98101", "country": "US"}',
    '{"addr1": "321 Commerce Dr", "city": "Seattle", "state": "WA", "zip": "98101", "country": "US"}'
),
(
    '550e8400-e29b-41d4-a716-446655440005',
    'Healthcare Innovations',
    'David',
    'Brown',
    'david.brown@healthinnovations.com',
    '+1-555-0105',
    false,
    'Parent Company',
    'USD',
    'Net 60',
    67000.00,
    15000.00,
    12000.00,
    '{"addr1": "555 Medical Plaza", "city": "Boston", "state": "MA", "zip": "02101", "country": "US"}',
    '{"addr1": "555 Medical Plaza", "city": "Boston", "state": "MA", "zip": "02101", "country": "US"}'
);

-- Seed sample NetSuite invoices
INSERT INTO netsuite_invoices (
    id, tran_id, entity, entity_name, tran_date, due_date, status,
    currency, subtotal, tax_total, total, amount_paid, amount_remaining,
    items, memo
) VALUES
(
    '660e8400-e29b-41d4-a716-446655440001',
    'INV-2024-0001',
    '550e8400-e29b-41d4-a716-446655440001',
    'Acme Corporation',
    '2024-01-15',
    '2024-02-14',
    'Open',
    'USD',
    10000.00,
    800.00,
    10800.00,
    0.00,
    10800.00,
    '[
        {"item": "PROD-001", "description": "Professional Services", "quantity": 40, "rate": 250.00, "amount": 10000.00, "taxRate": 0.08}
    ]',
    'Q1 2024 Professional Services'
),
(
    '660e8400-e29b-41d4-a716-446655440002',
    'INV-2024-0002',
    '550e8400-e29b-41d4-a716-446655440002',
    'TechStart Inc',
    '2024-01-18',
    '2024-02-02',
    'Paid In Full',
    'USD',
    5000.00,
    400.00,
    5400.00,
    5400.00,
    0.00,
    '[
        {"item": "PROD-002", "description": "Software License", "quantity": 10, "rate": 500.00, "amount": 5000.00, "taxRate": 0.08}
    ]',
    'Annual software license renewal'
),
(
    '660e8400-e29b-41d4-a716-446655440003',
    'INV-2024-0003',
    '550e8400-e29b-41d4-a716-446655440003',
    'Global Enterprises',
    '2024-01-20',
    '2024-03-05',
    'Open',
    'USD',
    25000.00,
    2000.00,
    27000.00,
    10000.00,
    17000.00,
    '[
        {"item": "PROD-003", "description": "Enterprise Support", "quantity": 12, "rate": 2000.00, "amount": 24000.00, "taxRate": 0.08},
        {"item": "PROD-004", "description": "Training Services", "quantity": 2, "rate": 500.00, "amount": 1000.00, "taxRate": 0.08}
    ]',
    'Annual enterprise support contract'
),
(
    '660e8400-e29b-41d4-a716-446655440004',
    'INV-2024-0004',
    '550e8400-e29b-41d4-a716-446655440001',
    'Acme Corporation',
    '2024-01-25',
    '2024-02-24',
    'Open',
    'USD',
    3500.00,
    280.00,
    3780.00,
    0.00,
    3780.00,
    '[
        {"item": "PROD-005", "description": "Consulting Hours", "quantity": 14, "rate": 250.00, "amount": 3500.00, "taxRate": 0.08}
    ]',
    'Additional consulting services'
),
(
    '660e8400-e29b-41d4-a716-446655440005',
    'INV-2024-0005',
    '550e8400-e29b-41d4-a716-446655440004',
    'Retail Solutions LLC',
    '2024-01-28',
    '2024-02-27',
    'Pending Approval',
    'USD',
    15000.00,
    1200.00,
    16200.00,
    0.00,
    16200.00,
    '[
        {"item": "PROD-006", "description": "Implementation Services", "quantity": 60, "rate": 250.00, "amount": 15000.00, "taxRate": 0.08}
    ]',
    'System implementation phase 1'
);
