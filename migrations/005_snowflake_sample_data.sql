-- Snowflake Mock Server Sample Data
-- Version: 1.0.0
-- Description: Sample data tables and seed data for Snowflake mock server

-- ============================================================================
-- SNOWFLAKE SAMPLE DATA TABLES
-- ============================================================================

-- Sample customers table
CREATE TABLE IF NOT EXISTS snowflake_sample_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    industry VARCHAR(100),
    annual_revenue DECIMAL(15, 2),
    employee_count INTEGER,
    country VARCHAR(100) DEFAULT 'USA',
    state VARCHAR(100),
    city VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample orders table
CREATE TABLE IF NOT EXISTS snowflake_sample_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(20) NOT NULL UNIQUE,
    customer_id VARCHAR(20) NOT NULL REFERENCES snowflake_sample_customers(customer_id) ON DELETE CASCADE,
    order_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    total_amount DECIMAL(15, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    shipping_amount DECIMAL(15, 2) DEFAULT 0,
    shipping_address TEXT,
    billing_address TEXT,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_order_status CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'))
);

-- Sample products table
CREATE TABLE IF NOT EXISTS snowflake_sample_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    price DECIMAL(15, 2) NOT NULL,
    cost DECIMAL(15, 2),
    stock_quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    supplier VARCHAR(255),
    sku VARCHAR(100),
    weight_kg DECIMAL(10, 3),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample order items table
CREATE TABLE IF NOT EXISTS snowflake_sample_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id VARCHAR(20) NOT NULL UNIQUE,
    order_id VARCHAR(20) NOT NULL REFERENCES snowflake_sample_orders(order_id) ON DELETE CASCADE,
    product_id VARCHAR(20) NOT NULL REFERENCES snowflake_sample_products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR SAMPLE DATA TABLES
-- ============================================================================

CREATE INDEX idx_snowflake_customers_email ON snowflake_sample_customers(email);
CREATE INDEX idx_snowflake_customers_company ON snowflake_sample_customers(company);
CREATE INDEX idx_snowflake_customers_industry ON snowflake_sample_customers(industry);
CREATE INDEX idx_snowflake_orders_customer ON snowflake_sample_orders(customer_id);
CREATE INDEX idx_snowflake_orders_date ON snowflake_sample_orders(order_date);
CREATE INDEX idx_snowflake_orders_status ON snowflake_sample_orders(status);
CREATE INDEX idx_snowflake_products_category ON snowflake_sample_products(category);
CREATE INDEX idx_snowflake_products_sku ON snowflake_sample_products(sku);
CREATE INDEX idx_snowflake_order_items_order ON snowflake_sample_order_items(order_id);
CREATE INDEX idx_snowflake_order_items_product ON snowflake_sample_order_items(product_id);

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================================================

CREATE TRIGGER update_snowflake_sample_customers_updated_at BEFORE UPDATE ON snowflake_sample_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snowflake_sample_orders_updated_at BEFORE UPDATE ON snowflake_sample_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snowflake_sample_products_updated_at BEFORE UPDATE ON snowflake_sample_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED SAMPLE CUSTOMERS (20 customers)
-- ============================================================================

INSERT INTO snowflake_sample_customers (customer_id, name, email, phone, company, industry, annual_revenue, employee_count, country, state, city) VALUES
('CUST-001', 'Emily Carter', 'emily.carter@techvision.com', '+1-555-0101', 'TechVision Inc', 'Technology', 5000000.00, 120, 'USA', 'California', 'San Francisco'),
('CUST-002', 'Michael Chen', 'michael.chen@globalretail.com', '+1-555-0102', 'Global Retail Corp', 'Retail', 12000000.00, 450, 'USA', 'New York', 'New York'),
('CUST-003', 'Sarah Johnson', 'sarah.j@healthfirst.com', '+1-555-0103', 'HealthFirst Medical', 'Healthcare', 8500000.00, 280, 'USA', 'Massachusetts', 'Boston'),
('CUST-004', 'David Rodriguez', 'david.r@greenenergy.com', '+1-555-0104', 'Green Energy Solutions', 'Energy', 15000000.00, 350, 'USA', 'Texas', 'Austin'),
('CUST-005', 'Jennifer Williams', 'j.williams@financepro.com', '+1-555-0105', 'FinancePro Services', 'Finance', 25000000.00, 600, 'USA', 'Illinois', 'Chicago'),
('CUST-006', 'Robert Taylor', 'r.taylor@manufacturing.com', '+1-555-0106', 'Advanced Manufacturing Ltd', 'Manufacturing', 18000000.00, 520, 'USA', 'Michigan', 'Detroit'),
('CUST-007', 'Amanda Brown', 'a.brown@edulearn.com', '+1-555-0107', 'EduLearn Academy', 'Education', 3500000.00, 85, 'USA', 'Florida', 'Miami'),
('CUST-008', 'James Miller', 'james.m@logisticshub.com', '+1-555-0108', 'Logistics Hub International', 'Transportation', 22000000.00, 780, 'USA', 'Georgia', 'Atlanta'),
('CUST-009', 'Lisa Anderson', 'lisa.a@mediaglobal.com', '+1-555-0109', 'MediaGlobal Entertainment', 'Media', 9500000.00, 200, 'USA', 'California', 'Los Angeles'),
('CUST-010', 'Christopher Lee', 'c.lee@pharmaresearch.com', '+1-555-0110', 'PharmaResearch Labs', 'Pharmaceutical', 45000000.00, 950, 'USA', 'New Jersey', 'Princeton'),
('CUST-011', 'Michelle Davis', 'm.davis@cloudservices.com', '+1-555-0111', 'CloudServices Pro', 'Technology', 7500000.00, 180, 'USA', 'Washington', 'Seattle'),
('CUST-012', 'Daniel Martinez', 'd.martinez@foodchain.com', '+1-555-0112', 'FoodChain Distribution', 'Food & Beverage', 16000000.00, 420, 'USA', 'California', 'Fresno'),
('CUST-013', 'Jessica Thompson', 'j.thompson@realtygroup.com', '+1-555-0113', 'Realty Group Partners', 'Real Estate', 11000000.00, 150, 'USA', 'Arizona', 'Phoenix'),
('CUST-014', 'Andrew Wilson', 'a.wilson@constructionpro.com', '+1-555-0114', 'ConstructionPro Builders', 'Construction', 28000000.00, 680, 'USA', 'Colorado', 'Denver'),
('CUST-015', 'Nicole Garcia', 'n.garcia@beautybrands.com', '+1-555-0115', 'Beauty Brands International', 'Consumer Goods', 6000000.00, 140, 'USA', 'New York', 'Brooklyn'),
('CUST-016', 'Kevin Moore', 'k.moore@autoparts.com', '+1-555-0116', 'AutoParts Warehouse', 'Automotive', 14000000.00, 380, 'USA', 'Ohio', 'Cleveland'),
('CUST-017', 'Rachel White', 'r.white@legalservices.com', '+1-555-0117', 'LegalServices Associates', 'Legal', 4500000.00, 65, 'USA', 'Pennsylvania', 'Philadelphia'),
('CUST-018', 'Brandon Harris', 'b.harris@sportsgoods.com', '+1-555-0118', 'SportsGoods Direct', 'Retail', 8000000.00, 210, 'USA', 'Oregon', 'Portland'),
('CUST-019', 'Stephanie Clark', 's.clark@travelworld.com', '+1-555-0119', 'TravelWorld Agency', 'Travel', 5500000.00, 95, 'USA', 'Nevada', 'Las Vegas'),
('CUST-020', 'Jason Robinson', 'j.robinson@cybersecurity.com', '+1-555-0120', 'CyberSecurity Solutions', 'Technology', 10000000.00, 240, 'USA', 'Virginia', 'Arlington')
ON CONFLICT (customer_id) DO NOTHING;

-- ============================================================================
-- SEED SAMPLE PRODUCTS (30 products)
-- ============================================================================

INSERT INTO snowflake_sample_products (product_id, name, category, subcategory, price, cost, stock_quantity, reorder_level, supplier, sku, weight_kg, description, is_active) VALUES
('PROD-001', 'Enterprise Server Pro', 'Hardware', 'Servers', 4999.99, 3200.00, 25, 5, 'TechSupply Corp', 'HW-SRV-001', 15.500, 'High-performance enterprise server with 64GB RAM', true),
('PROD-002', 'Business Laptop Elite', 'Hardware', 'Laptops', 1899.99, 1200.00, 150, 20, 'ComputerWorld Inc', 'HW-LAP-001', 2.100, '15-inch business laptop with SSD storage', true),
('PROD-003', 'Wireless Mouse Pro', 'Accessories', 'Input Devices', 79.99, 35.00, 500, 100, 'PeripheralPlus', 'ACC-MOU-001', 0.120, 'Ergonomic wireless mouse with precision tracking', true),
('PROD-004', 'Mechanical Keyboard RGB', 'Accessories', 'Input Devices', 149.99, 65.00, 300, 50, 'PeripheralPlus', 'ACC-KEY-001', 0.950, 'Mechanical gaming keyboard with RGB backlight', true),
('PROD-005', '4K Monitor Ultra', 'Hardware', 'Displays', 699.99, 420.00, 75, 15, 'DisplayTech', 'HW-MON-001', 8.200, '32-inch 4K UHD monitor with HDR support', true),
('PROD-006', 'Cloud Storage License', 'Software', 'Cloud Services', 299.99, 50.00, 1000, 100, 'CloudVendor Inc', 'SW-CLD-001', 0.000, 'Annual cloud storage license - 5TB', true),
('PROD-007', 'Security Suite Enterprise', 'Software', 'Security', 499.99, 150.00, 500, 50, 'SecureIT Solutions', 'SW-SEC-001', 0.000, 'Enterprise security software suite - 100 users', true),
('PROD-008', 'Network Switch 48-Port', 'Hardware', 'Networking', 1299.99, 780.00, 40, 10, 'NetworkGear', 'HW-NET-001', 4.500, 'Managed 48-port gigabit network switch', true),
('PROD-009', 'Wireless Access Point', 'Hardware', 'Networking', 249.99, 120.00, 200, 30, 'NetworkGear', 'HW-NET-002', 0.650, 'Enterprise wireless access point - WiFi 6', true),
('PROD-010', 'Office Chair Ergonomic', 'Furniture', 'Seating', 449.99, 200.00, 100, 20, 'OfficeFurniture Co', 'FUR-CHR-001', 18.000, 'Ergonomic office chair with lumbar support', true),
('PROD-011', 'Standing Desk Electric', 'Furniture', 'Desks', 799.99, 380.00, 50, 10, 'OfficeFurniture Co', 'FUR-DSK-001', 45.000, 'Electric height-adjustable standing desk', true),
('PROD-012', 'Webcam 4K Pro', 'Accessories', 'Video', 199.99, 85.00, 250, 40, 'VideoTech', 'ACC-CAM-001', 0.180, '4K webcam with auto-focus and noise cancellation', true),
('PROD-013', 'USB-C Docking Station', 'Accessories', 'Docks', 279.99, 130.00, 180, 25, 'DockMaster', 'ACC-DOC-001', 0.450, 'Universal USB-C docking station - 12 ports', true),
('PROD-014', 'External SSD 2TB', 'Storage', 'External Drives', 199.99, 110.00, 400, 60, 'StoragePro', 'STR-SSD-001', 0.100, 'Portable external SSD - 2TB capacity', true),
('PROD-015', 'Server Rack 42U', 'Hardware', 'Infrastructure', 899.99, 450.00, 20, 5, 'RackSolutions', 'HW-RAK-001', 85.000, '42U server rack with cable management', true),
('PROD-016', 'UPS Battery Backup', 'Hardware', 'Power', 599.99, 320.00, 60, 10, 'PowerGuard', 'HW-UPS-001', 22.000, '1500VA UPS battery backup system', true),
('PROD-017', 'Headset Wireless Pro', 'Accessories', 'Audio', 249.99, 100.00, 350, 50, 'AudioTech', 'ACC-AUD-001', 0.280, 'Wireless headset with active noise cancellation', true),
('PROD-018', 'Presentation Remote', 'Accessories', 'Input Devices', 49.99, 18.00, 600, 100, 'PeripheralPlus', 'ACC-REM-001', 0.050, 'Wireless presentation remote with laser pointer', true),
('PROD-019', 'Project Management Software', 'Software', 'Productivity', 199.99, 40.00, 800, 100, 'SoftwareVendor Inc', 'SW-PRJ-001', 0.000, 'Annual license - team of 25 users', true),
('PROD-020', 'Video Conferencing System', 'Hardware', 'Video', 2499.99, 1500.00, 15, 3, 'VideoTech', 'HW-VID-001', 5.200, 'Complete video conferencing system for boardrooms', true),
('PROD-021', 'Printer Multifunction', 'Hardware', 'Printing', 549.99, 280.00, 80, 15, 'PrintMaster', 'HW-PRT-001', 12.500, 'Color laser multifunction printer with scanner', true),
('PROD-022', 'Paper Shredder Industrial', 'Office Equipment', 'Shredders', 349.99, 160.00, 45, 10, 'OfficeEquip Co', 'OFC-SHR-001', 14.000, 'Cross-cut paper shredder - 20 sheet capacity', true),
('PROD-023', 'Whiteboard Interactive', 'Office Equipment', 'Displays', 1999.99, 1100.00, 25, 5, 'DisplayTech', 'OFC-WBD-001', 35.000, '75-inch interactive whiteboard with touch', true),
('PROD-024', 'Cable Management Kit', 'Accessories', 'Organization', 39.99, 12.00, 800, 150, 'OrganizerPro', 'ACC-CBL-001', 0.350, 'Complete cable management and organization kit', true),
('PROD-025', 'Surge Protector 12-Outlet', 'Accessories', 'Power', 59.99, 22.00, 450, 80, 'PowerGuard', 'ACC-PWR-001', 0.800, '12-outlet surge protector with USB ports', true),
('PROD-026', 'Laptop Stand Adjustable', 'Accessories', 'Ergonomics', 89.99, 35.00, 280, 40, 'ErgoWorks', 'ACC-STD-001', 1.200, 'Adjustable aluminum laptop stand', true),
('PROD-027', 'Backup Software Enterprise', 'Software', 'Data Protection', 799.99, 200.00, 300, 30, 'BackupPro Inc', 'SW-BAK-001', 0.000, 'Enterprise backup solution - unlimited endpoints', true),
('PROD-028', 'Network Cable Cat6 100ft', 'Accessories', 'Networking', 29.99, 8.00, 1000, 200, 'CableCo', 'ACC-CAB-001', 1.500, 'Cat6 ethernet cable - 100 feet', true),
('PROD-029', 'Monitor Arm Dual', 'Accessories', 'Ergonomics', 179.99, 75.00, 150, 25, 'ErgoWorks', 'ACC-ARM-001', 3.500, 'Dual monitor arm with full articulation', true),
('PROD-030', 'Desk Organizer Set', 'Office Equipment', 'Organization', 49.99, 18.00, 400, 70, 'OrganizerPro', 'OFC-ORG-001', 1.800, 'Complete desk organizer set - 5 pieces', true)
ON CONFLICT (product_id) DO NOTHING;

-- ============================================================================
-- SEED SAMPLE ORDERS (50 orders)
-- ============================================================================

INSERT INTO snowflake_sample_orders (order_id, customer_id, order_date, status, total_amount, discount_amount, tax_amount, shipping_amount, shipping_address, payment_method, notes) VALUES
('ORD-001', 'CUST-001', '2024-01-05', 'DELIVERED', 7499.97, 0.00, 562.50, 75.00, '123 Tech Blvd, San Francisco, CA 94105', 'Credit Card', 'Express shipping requested'),
('ORD-002', 'CUST-002', '2024-01-08', 'DELIVERED', 12599.92, 500.00, 907.49, 150.00, '456 Retail Ave, New York, NY 10001', 'Wire Transfer', 'Bulk order discount applied'),
('ORD-003', 'CUST-003', '2024-01-10', 'DELIVERED', 3199.96, 0.00, 239.99, 45.00, '789 Medical Way, Boston, MA 02101', 'Credit Card', NULL),
('ORD-004', 'CUST-004', '2024-01-12', 'DELIVERED', 5899.94, 200.00, 427.49, 85.00, '321 Energy Ln, Austin, TX 78701', 'ACH', 'Government project'),
('ORD-005', 'CUST-005', '2024-01-15', 'DELIVERED', 24999.75, 1000.00, 1799.98, 250.00, '555 Finance St, Chicago, IL 60601', 'Wire Transfer', 'Annual infrastructure upgrade'),
('ORD-006', 'CUST-006', '2024-01-18', 'DELIVERED', 8999.91, 0.00, 674.99, 120.00, '777 Factory Rd, Detroit, MI 48201', 'Credit Card', NULL),
('ORD-007', 'CUST-007', '2024-01-20', 'DELIVERED', 2149.93, 100.00, 153.74, 35.00, '888 Education Dr, Miami, FL 33101', 'Credit Card', 'Educational discount'),
('ORD-008', 'CUST-008', '2024-01-22', 'DELIVERED', 15799.84, 500.00, 1147.49, 200.00, '999 Logistics Pkwy, Atlanta, GA 30301', 'ACH', 'Warehouse expansion'),
('ORD-009', 'CUST-009', '2024-01-25', 'DELIVERED', 4299.95, 0.00, 322.50, 55.00, '111 Media Blvd, Los Angeles, CA 90001', 'Credit Card', NULL),
('ORD-010', 'CUST-010', '2024-01-28', 'DELIVERED', 35999.65, 1500.00, 2587.47, 350.00, '222 Research Dr, Princeton, NJ 08540', 'Wire Transfer', 'Lab equipment order'),
('ORD-011', 'CUST-011', '2024-02-01', 'DELIVERED', 6799.93, 250.00, 491.24, 90.00, '333 Cloud Ave, Seattle, WA 98101', 'Credit Card', NULL),
('ORD-012', 'CUST-012', '2024-02-05', 'DELIVERED', 9499.90, 0.00, 712.49, 125.00, '444 Food Way, Fresno, CA 93650', 'ACH', 'Distribution center setup'),
('ORD-013', 'CUST-013', '2024-02-08', 'DELIVERED', 3599.96, 0.00, 269.99, 50.00, '555 Realty Ln, Phoenix, AZ 85001', 'Credit Card', NULL),
('ORD-014', 'CUST-014', '2024-02-10', 'DELIVERED', 18999.80, 750.00, 1368.73, 225.00, '666 Construction Blvd, Denver, CO 80201', 'Wire Transfer', 'Project site equipment'),
('ORD-015', 'CUST-015', '2024-02-12', 'DELIVERED', 2799.94, 0.00, 209.99, 40.00, '777 Beauty Ave, Brooklyn, NY 11201', 'Credit Card', NULL),
('ORD-016', 'CUST-016', '2024-02-15', 'SHIPPED', 7999.92, 300.00, 577.49, 100.00, '888 Auto Dr, Cleveland, OH 44101', 'ACH', NULL),
('ORD-017', 'CUST-017', '2024-02-18', 'SHIPPED', 1999.95, 0.00, 149.99, 30.00, '999 Legal St, Philadelphia, PA 19101', 'Credit Card', NULL),
('ORD-018', 'CUST-018', '2024-02-20', 'SHIPPED', 5499.93, 200.00, 397.49, 75.00, '123 Sports Blvd, Portland, OR 97201', 'Credit Card', 'Seasonal inventory'),
('ORD-019', 'CUST-019', '2024-02-22', 'SHIPPED', 3299.96, 0.00, 247.49, 45.00, '456 Travel Way, Las Vegas, NV 89101', 'Credit Card', NULL),
('ORD-020', 'CUST-020', '2024-02-25', 'PROCESSING', 11999.88, 500.00, 862.49, 160.00, '789 Cyber Ave, Arlington, VA 22201', 'Wire Transfer', 'Security infrastructure'),
('ORD-021', 'CUST-001', '2024-02-28', 'PROCESSING', 4599.95, 0.00, 344.99, 60.00, '123 Tech Blvd, San Francisco, CA 94105', 'Credit Card', 'Quarterly refresh'),
('ORD-022', 'CUST-002', '2024-03-01', 'PROCESSING', 8799.91, 350.00, 633.74, 115.00, '456 Retail Ave, New York, NY 10001', 'ACH', NULL),
('ORD-023', 'CUST-003', '2024-03-03', 'CONFIRMED', 6299.94, 0.00, 472.49, 85.00, '789 Medical Way, Boston, MA 02101', 'Credit Card', NULL),
('ORD-024', 'CUST-004', '2024-03-05', 'CONFIRMED', 9999.90, 400.00, 719.99, 130.00, '321 Energy Ln, Austin, TX 78701', 'Wire Transfer', NULL),
('ORD-025', 'CUST-005', '2024-03-07', 'CONFIRMED', 15499.85, 600.00, 1117.49, 195.00, '555 Finance St, Chicago, IL 60601', 'ACH', NULL),
('ORD-026', 'CUST-006', '2024-03-08', 'PENDING', 7299.93, 0.00, 547.49, 95.00, '777 Factory Rd, Detroit, MI 48201', 'Credit Card', NULL),
('ORD-027', 'CUST-007', '2024-03-09', 'PENDING', 1849.94, 75.00, 133.12, 28.00, '888 Education Dr, Miami, FL 33101', 'Credit Card', NULL),
('ORD-028', 'CUST-008', '2024-03-10', 'PENDING', 12399.84, 450.00, 896.24, 165.00, '999 Logistics Pkwy, Atlanta, GA 30301', 'Wire Transfer', NULL),
('ORD-029', 'CUST-009', '2024-03-11', 'PENDING', 3799.96, 0.00, 284.99, 52.00, '111 Media Blvd, Los Angeles, CA 90001', 'Credit Card', NULL),
('ORD-030', 'CUST-010', '2024-03-12', 'PENDING', 22999.70, 900.00, 1657.48, 285.00, '222 Research Dr, Princeton, NJ 08540', 'ACH', NULL),
('ORD-031', 'CUST-011', '2024-01-15', 'DELIVERED', 5199.94, 0.00, 389.99, 70.00, '333 Cloud Ave, Seattle, WA 98101', 'Credit Card', NULL),
('ORD-032', 'CUST-012', '2024-01-20', 'DELIVERED', 7899.92, 300.00, 569.99, 105.00, '444 Food Way, Fresno, CA 93650', 'ACH', NULL),
('ORD-033', 'CUST-013', '2024-01-25', 'DELIVERED', 2999.96, 0.00, 224.99, 42.00, '555 Realty Ln, Phoenix, AZ 85001', 'Credit Card', NULL),
('ORD-034', 'CUST-014', '2024-01-30', 'DELIVERED', 14499.85, 550.00, 1046.24, 185.00, '666 Construction Blvd, Denver, CO 80201', 'Wire Transfer', NULL),
('ORD-035', 'CUST-015', '2024-02-05', 'DELIVERED', 4099.95, 150.00, 296.24, 58.00, '777 Beauty Ave, Brooklyn, NY 11201', 'Credit Card', NULL),
('ORD-036', 'CUST-016', '2024-02-10', 'DELIVERED', 6599.93, 0.00, 494.99, 88.00, '888 Auto Dr, Cleveland, OH 44101', 'ACH', NULL),
('ORD-037', 'CUST-017', '2024-02-15', 'DELIVERED', 2499.95, 100.00, 179.99, 35.00, '999 Legal St, Philadelphia, PA 19101', 'Credit Card', NULL),
('ORD-038', 'CUST-018', '2024-02-20', 'DELIVERED', 8299.91, 0.00, 622.49, 110.00, '123 Sports Blvd, Portland, OR 97201', 'Credit Card', NULL),
('ORD-039', 'CUST-019', '2024-02-25', 'DELIVERED', 4799.95, 0.00, 359.99, 65.00, '456 Travel Way, Las Vegas, NV 89101', 'Credit Card', NULL),
('ORD-040', 'CUST-020', '2024-02-28', 'DELIVERED', 16999.83, 650.00, 1226.24, 215.00, '789 Cyber Ave, Arlington, VA 22201', 'Wire Transfer', NULL),
('ORD-041', 'CUST-001', '2024-03-01', 'SHIPPED', 3899.96, 0.00, 292.49, 53.00, '123 Tech Blvd, San Francisco, CA 94105', 'Credit Card', NULL),
('ORD-042', 'CUST-005', '2024-03-02', 'SHIPPED', 19999.80, 800.00, 1439.99, 245.00, '555 Finance St, Chicago, IL 60601', 'ACH', NULL),
('ORD-043', 'CUST-008', '2024-03-03', 'PROCESSING', 10999.89, 400.00, 794.99, 145.00, '999 Logistics Pkwy, Atlanta, GA 30301', 'Wire Transfer', NULL),
('ORD-044', 'CUST-010', '2024-03-04', 'PROCESSING', 27999.72, 1100.00, 2017.48, 340.00, '222 Research Dr, Princeton, NJ 08540', 'ACH', NULL),
('ORD-045', 'CUST-014', '2024-03-05', 'CONFIRMED', 11499.88, 450.00, 828.74, 152.00, '666 Construction Blvd, Denver, CO 80201', 'Wire Transfer', NULL),
('ORD-046', 'CUST-002', '2024-03-06', 'CONFIRMED', 6999.93, 0.00, 524.99, 92.00, '456 Retail Ave, New York, NY 10001', 'Credit Card', NULL),
('ORD-047', 'CUST-006', '2024-03-07', 'PENDING', 13499.86, 500.00, 974.99, 175.00, '777 Factory Rd, Detroit, MI 48201', 'ACH', NULL),
('ORD-048', 'CUST-011', '2024-03-08', 'PENDING', 5799.94, 0.00, 434.99, 78.00, '333 Cloud Ave, Seattle, WA 98101', 'Credit Card', NULL),
('ORD-049', 'CUST-015', '2024-03-09', 'PENDING', 3499.96, 0.00, 262.49, 48.00, '777 Beauty Ave, Brooklyn, NY 11201', 'Credit Card', NULL),
('ORD-050', 'CUST-019', '2024-03-10', 'PENDING', 8599.91, 0.00, 644.99, 115.00, '456 Travel Way, Las Vegas, NV 89101', 'Wire Transfer', NULL)
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================================
-- SEED SAMPLE ORDER ITEMS (100 order items)
-- ============================================================================

INSERT INTO snowflake_sample_order_items (order_item_id, order_id, product_id, quantity, unit_price, discount_percent, total_price) VALUES
-- Order 1 items
('ITEM-001', 'ORD-001', 'PROD-001', 1, 4999.99, 0.00, 4999.99),
('ITEM-002', 'ORD-001', 'PROD-003', 5, 79.99, 0.00, 399.95),
('ITEM-003', 'ORD-001', 'PROD-018', 10, 49.99, 0.00, 499.90),
-- Order 2 items
('ITEM-004', 'ORD-002', 'PROD-002', 5, 1899.99, 5.00, 9024.95),
('ITEM-005', 'ORD-002', 'PROD-013', 10, 279.99, 0.00, 2799.90),
-- Order 3 items
('ITEM-006', 'ORD-003', 'PROD-005', 3, 699.99, 0.00, 2099.97),
('ITEM-007', 'ORD-003', 'PROD-012', 5, 199.99, 0.00, 999.95),
-- Order 4 items
('ITEM-008', 'ORD-004', 'PROD-008', 3, 1299.99, 0.00, 3899.97),
('ITEM-009', 'ORD-004', 'PROD-009', 8, 249.99, 0.00, 1999.92),
-- Order 5 items
('ITEM-010', 'ORD-005', 'PROD-001', 3, 4999.99, 0.00, 14999.97),
('ITEM-011', 'ORD-005', 'PROD-015', 5, 899.99, 0.00, 4499.95),
('ITEM-012', 'ORD-005', 'PROD-016', 8, 599.99, 0.00, 4799.92),
-- Order 6 items
('ITEM-013', 'ORD-006', 'PROD-002', 3, 1899.99, 0.00, 5699.97),
('ITEM-014', 'ORD-006', 'PROD-017', 10, 249.99, 0.00, 2499.90),
-- Order 7 items
('ITEM-015', 'ORD-007', 'PROD-002', 1, 1899.99, 5.00, 1804.99),
('ITEM-016', 'ORD-007', 'PROD-026', 3, 89.99, 0.00, 269.97),
-- Order 8 items
('ITEM-017', 'ORD-008', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-018', 'ORD-008', 'PROD-008', 3, 1299.99, 0.00, 3899.97),
('ITEM-019', 'ORD-008', 'PROD-028', 50, 29.99, 0.00, 1499.50),
-- Order 9 items
('ITEM-020', 'ORD-009', 'PROD-020', 1, 2499.99, 0.00, 2499.99),
('ITEM-021', 'ORD-009', 'PROD-012', 8, 199.99, 0.00, 1599.92),
-- Order 10 items
('ITEM-022', 'ORD-010', 'PROD-001', 5, 4999.99, 0.00, 24999.95),
('ITEM-023', 'ORD-010', 'PROD-007', 20, 499.99, 0.00, 9999.80),
-- Order 11 items
('ITEM-024', 'ORD-011', 'PROD-006', 15, 299.99, 0.00, 4499.85),
('ITEM-025', 'ORD-011', 'PROD-019', 10, 199.99, 0.00, 1999.90),
-- Order 12 items
('ITEM-026', 'ORD-012', 'PROD-008', 5, 1299.99, 0.00, 6499.95),
('ITEM-027', 'ORD-012', 'PROD-009', 12, 249.99, 0.00, 2999.88),
-- Order 13 items
('ITEM-028', 'ORD-013', 'PROD-002', 1, 1899.99, 0.00, 1899.99),
('ITEM-029', 'ORD-013', 'PROD-005', 2, 699.99, 0.00, 1399.98),
-- Order 14 items
('ITEM-030', 'ORD-014', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-031', 'ORD-014', 'PROD-015', 5, 899.99, 0.00, 4499.95),
('ITEM-032', 'ORD-014', 'PROD-016', 6, 599.99, 0.00, 3599.94),
-- Order 15 items
('ITEM-033', 'ORD-015', 'PROD-002', 1, 1899.99, 0.00, 1899.99),
('ITEM-034', 'ORD-015', 'PROD-029', 5, 179.99, 0.00, 899.95),
-- Order 16 items
('ITEM-035', 'ORD-016', 'PROD-001', 1, 4999.99, 0.00, 4999.99),
('ITEM-036', 'ORD-016', 'PROD-014', 15, 199.99, 0.00, 2999.85),
-- Order 17 items
('ITEM-037', 'ORD-017', 'PROD-006', 5, 299.99, 0.00, 1499.95),
('ITEM-038', 'ORD-017', 'PROD-030', 10, 49.99, 0.00, 499.90),
-- Order 18 items
('ITEM-039', 'ORD-018', 'PROD-002', 2, 1899.99, 0.00, 3799.98),
('ITEM-040', 'ORD-018', 'PROD-017', 6, 249.99, 0.00, 1499.94),
-- Order 19 items
('ITEM-041', 'ORD-019', 'PROD-005', 3, 699.99, 0.00, 2099.97),
('ITEM-042', 'ORD-019', 'PROD-012', 6, 199.99, 0.00, 1199.94),
-- Order 20 items
('ITEM-043', 'ORD-020', 'PROD-007', 15, 499.99, 0.00, 7499.85),
('ITEM-044', 'ORD-020', 'PROD-027', 5, 799.99, 0.00, 3999.95),
-- Order 21 items
('ITEM-045', 'ORD-021', 'PROD-002', 2, 1899.99, 0.00, 3799.98),
('ITEM-046', 'ORD-021', 'PROD-003', 10, 79.99, 0.00, 799.90),
-- Order 22 items
('ITEM-047', 'ORD-022', 'PROD-008', 5, 1299.99, 0.00, 6499.95),
('ITEM-048', 'ORD-022', 'PROD-024', 50, 39.99, 0.00, 1999.50),
-- Order 23 items
('ITEM-049', 'ORD-023', 'PROD-001', 1, 4999.99, 0.00, 4999.99),
('ITEM-050', 'ORD-023', 'PROD-013', 4, 279.99, 0.00, 1119.96),
-- Order 24 items
('ITEM-051', 'ORD-024', 'PROD-020', 3, 2499.99, 0.00, 7499.97),
('ITEM-052', 'ORD-024', 'PROD-023', 1, 1999.99, 0.00, 1999.99),
-- Order 25 items
('ITEM-053', 'ORD-025', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-054', 'ORD-025', 'PROD-008', 3, 1299.99, 0.00, 3899.97),
-- Order 26 items
('ITEM-055', 'ORD-026', 'PROD-002', 3, 1899.99, 0.00, 5699.97),
('ITEM-056', 'ORD-026', 'PROD-014', 8, 199.99, 0.00, 1599.92),
-- Order 27 items
('ITEM-057', 'ORD-027', 'PROD-002', 1, 1899.99, 5.00, 1804.99),
('ITEM-058', 'ORD-027', 'PROD-018', 5, 49.99, 0.00, 249.95),
-- Order 28 items
('ITEM-059', 'ORD-028', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-060', 'ORD-028', 'PROD-016', 4, 599.99, 0.00, 2399.96),
-- Order 29 items
('ITEM-061', 'ORD-029', 'PROD-005', 4, 699.99, 0.00, 2799.96),
('ITEM-062', 'ORD-029', 'PROD-029', 5, 179.99, 0.00, 899.95),
-- Order 30 items
('ITEM-063', 'ORD-030', 'PROD-001', 3, 4999.99, 0.00, 14999.97),
('ITEM-064', 'ORD-030', 'PROD-007', 15, 499.99, 0.00, 7499.85),
-- Order 31 items
('ITEM-065', 'ORD-031', 'PROD-006', 10, 299.99, 0.00, 2999.90),
('ITEM-066', 'ORD-031', 'PROD-019', 10, 199.99, 0.00, 1999.90),
-- Order 32 items
('ITEM-067', 'ORD-032', 'PROD-008', 4, 1299.99, 0.00, 5199.96),
('ITEM-068', 'ORD-032', 'PROD-009', 10, 249.99, 0.00, 2499.90),
-- Order 33 items
('ITEM-069', 'ORD-033', 'PROD-002', 1, 1899.99, 0.00, 1899.99),
('ITEM-070', 'ORD-033', 'PROD-012', 5, 199.99, 0.00, 999.95),
-- Order 34 items
('ITEM-071', 'ORD-034', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-072', 'ORD-034', 'PROD-016', 6, 599.99, 0.00, 3599.94),
-- Order 35 items
('ITEM-073', 'ORD-035', 'PROD-002', 2, 1899.99, 5.00, 3609.98),
('ITEM-074', 'ORD-035', 'PROD-026', 5, 89.99, 0.00, 449.95),
-- Order 36 items
('ITEM-075', 'ORD-036', 'PROD-001', 1, 4999.99, 0.00, 4999.99),
('ITEM-076', 'ORD-036', 'PROD-014', 8, 199.99, 0.00, 1599.92),
-- Order 37 items
('ITEM-077', 'ORD-037', 'PROD-006', 5, 299.99, 0.00, 1499.95),
('ITEM-078', 'ORD-037', 'PROD-019', 5, 199.99, 0.00, 999.95),
-- Order 38 items
('ITEM-079', 'ORD-038', 'PROD-002', 3, 1899.99, 0.00, 5699.97),
('ITEM-080', 'ORD-038', 'PROD-017', 10, 249.99, 0.00, 2499.90),
-- Order 39 items
('ITEM-081', 'ORD-039', 'PROD-005', 5, 699.99, 0.00, 3499.95),
('ITEM-082', 'ORD-039', 'PROD-012', 6, 199.99, 0.00, 1199.94),
-- Order 40 items
('ITEM-083', 'ORD-040', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-084', 'ORD-040', 'PROD-007', 12, 499.99, 0.00, 5999.88),
-- Order 41 items
('ITEM-085', 'ORD-041', 'PROD-005', 4, 699.99, 0.00, 2799.96),
('ITEM-086', 'ORD-041', 'PROD-012', 5, 199.99, 0.00, 999.95),
-- Order 42 items
('ITEM-087', 'ORD-042', 'PROD-001', 3, 4999.99, 0.00, 14999.97),
('ITEM-088', 'ORD-042', 'PROD-016', 8, 599.99, 0.00, 4799.92),
-- Order 43 items
('ITEM-089', 'ORD-043', 'PROD-008', 6, 1299.99, 0.00, 7799.94),
('ITEM-090', 'ORD-043', 'PROD-009', 12, 249.99, 0.00, 2999.88),
-- Order 44 items
('ITEM-091', 'ORD-044', 'PROD-001', 4, 4999.99, 0.00, 19999.96),
('ITEM-092', 'ORD-044', 'PROD-007', 15, 499.99, 0.00, 7499.85),
-- Order 45 items
('ITEM-093', 'ORD-045', 'PROD-008', 6, 1299.99, 0.00, 7799.94),
('ITEM-094', 'ORD-045', 'PROD-009', 15, 249.99, 0.00, 3749.85),
-- Order 46 items
('ITEM-095', 'ORD-046', 'PROD-002', 3, 1899.99, 0.00, 5699.97),
('ITEM-096', 'ORD-046', 'PROD-013', 4, 279.99, 0.00, 1119.96),
-- Order 47 items
('ITEM-097', 'ORD-047', 'PROD-001', 2, 4999.99, 0.00, 9999.98),
('ITEM-098', 'ORD-047', 'PROD-015', 3, 899.99, 0.00, 2699.97),
-- Order 48 items
('ITEM-099', 'ORD-048', 'PROD-002', 2, 1899.99, 0.00, 3799.98),
('ITEM-100', 'ORD-048', 'PROD-006', 6, 299.99, 0.00, 1799.94)
ON CONFLICT (order_item_id) DO NOTHING;

-- ============================================================================
-- REGISTER SAMPLE DATA TABLES IN SNOWFLAKE METADATA
-- ============================================================================

-- Register snowflake_sample_customers table
INSERT INTO snowflake_tables (id, schema_id, name, table_type, row_count, bytes, comment)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'SAMPLE_CUSTOMERS',
    'TABLE',
    20,
    8192,
    'Sample customer data for mock queries'
) ON CONFLICT (schema_id, name) DO UPDATE SET row_count = 20;

-- Register snowflake_sample_orders table
INSERT INTO snowflake_tables (id, schema_id, name, table_type, row_count, bytes, comment)
VALUES (
    'd0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'SAMPLE_ORDERS',
    'TABLE',
    50,
    20480,
    'Sample order data for mock queries'
) ON CONFLICT (schema_id, name) DO UPDATE SET row_count = 50;

-- Register snowflake_sample_products table
INSERT INTO snowflake_tables (id, schema_id, name, table_type, row_count, bytes, comment)
VALUES (
    'd0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000001',
    'SAMPLE_PRODUCTS',
    'TABLE',
    30,
    12288,
    'Sample product catalog for mock queries'
) ON CONFLICT (schema_id, name) DO UPDATE SET row_count = 30;

-- Register snowflake_sample_order_items table
INSERT INTO snowflake_tables (id, schema_id, name, table_type, row_count, bytes, comment)
VALUES (
    'd0000000-0000-0000-0000-000000000004',
    'b0000000-0000-0000-0000-000000000001',
    'SAMPLE_ORDER_ITEMS',
    'TABLE',
    100,
    16384,
    'Sample order line items for mock queries'
) ON CONFLICT (schema_id, name) DO UPDATE SET row_count = 100;

-- ============================================================================
-- REGISTER COLUMNS FOR SAMPLE DATA TABLES
-- ============================================================================

-- Columns for SAMPLE_CUSTOMERS
INSERT INTO snowflake_columns (table_id, name, data_type, nullable, ordinal_position) VALUES
('d0000000-0000-0000-0000-000000000001', 'ID', 'UUID', false, 1),
('d0000000-0000-0000-0000-000000000001', 'CUSTOMER_ID', 'VARCHAR(20)', false, 2),
('d0000000-0000-0000-0000-000000000001', 'NAME', 'VARCHAR(255)', false, 3),
('d0000000-0000-0000-0000-000000000001', 'EMAIL', 'VARCHAR(255)', true, 4),
('d0000000-0000-0000-0000-000000000001', 'PHONE', 'VARCHAR(50)', true, 5),
('d0000000-0000-0000-0000-000000000001', 'COMPANY', 'VARCHAR(255)', true, 6),
('d0000000-0000-0000-0000-000000000001', 'INDUSTRY', 'VARCHAR(100)', true, 7),
('d0000000-0000-0000-0000-000000000001', 'ANNUAL_REVENUE', 'DECIMAL(15,2)', true, 8),
('d0000000-0000-0000-0000-000000000001', 'EMPLOYEE_COUNT', 'INTEGER', true, 9),
('d0000000-0000-0000-0000-000000000001', 'COUNTRY', 'VARCHAR(100)', true, 10),
('d0000000-0000-0000-0000-000000000001', 'STATE', 'VARCHAR(100)', true, 11),
('d0000000-0000-0000-0000-000000000001', 'CITY', 'VARCHAR(100)', true, 12),
('d0000000-0000-0000-0000-000000000001', 'CREATED_AT', 'TIMESTAMP', true, 13),
('d0000000-0000-0000-0000-000000000001', 'UPDATED_AT', 'TIMESTAMP', true, 14)
ON CONFLICT (table_id, name) DO NOTHING;

-- Columns for SAMPLE_ORDERS
INSERT INTO snowflake_columns (table_id, name, data_type, nullable, ordinal_position) VALUES
('d0000000-0000-0000-0000-000000000002', 'ID', 'UUID', false, 1),
('d0000000-0000-0000-0000-000000000002', 'ORDER_ID', 'VARCHAR(20)', false, 2),
('d0000000-0000-0000-0000-000000000002', 'CUSTOMER_ID', 'VARCHAR(20)', false, 3),
('d0000000-0000-0000-0000-000000000002', 'ORDER_DATE', 'DATE', false, 4),
('d0000000-0000-0000-0000-000000000002', 'STATUS', 'VARCHAR(50)', false, 5),
('d0000000-0000-0000-0000-000000000002', 'TOTAL_AMOUNT', 'DECIMAL(15,2)', false, 6),
('d0000000-0000-0000-0000-000000000002', 'DISCOUNT_AMOUNT', 'DECIMAL(15,2)', true, 7),
('d0000000-0000-0000-0000-000000000002', 'TAX_AMOUNT', 'DECIMAL(15,2)', true, 8),
('d0000000-0000-0000-0000-000000000002', 'SHIPPING_AMOUNT', 'DECIMAL(15,2)', true, 9),
('d0000000-0000-0000-0000-000000000002', 'SHIPPING_ADDRESS', 'TEXT', true, 10),
('d0000000-0000-0000-0000-000000000002', 'BILLING_ADDRESS', 'TEXT', true, 11),
('d0000000-0000-0000-0000-000000000002', 'PAYMENT_METHOD', 'VARCHAR(50)', true, 12),
('d0000000-0000-0000-0000-000000000002', 'NOTES', 'TEXT', true, 13),
('d0000000-0000-0000-0000-000000000002', 'CREATED_AT', 'TIMESTAMP', true, 14),
('d0000000-0000-0000-0000-000000000002', 'UPDATED_AT', 'TIMESTAMP', true, 15)
ON CONFLICT (table_id, name) DO NOTHING;

-- Columns for SAMPLE_PRODUCTS
INSERT INTO snowflake_columns (table_id, name, data_type, nullable, ordinal_position) VALUES
('d0000000-0000-0000-0000-000000000003', 'ID', 'UUID', false, 1),
('d0000000-0000-0000-0000-000000000003', 'PRODUCT_ID', 'VARCHAR(20)', false, 2),
('d0000000-0000-0000-0000-000000000003', 'NAME', 'VARCHAR(255)', false, 3),
('d0000000-0000-0000-0000-000000000003', 'CATEGORY', 'VARCHAR(100)', false, 4),
('d0000000-0000-0000-0000-000000000003', 'SUBCATEGORY', 'VARCHAR(100)', true, 5),
('d0000000-0000-0000-0000-000000000003', 'PRICE', 'DECIMAL(15,2)', false, 6),
('d0000000-0000-0000-0000-000000000003', 'COST', 'DECIMAL(15,2)', true, 7),
('d0000000-0000-0000-0000-000000000003', 'STOCK_QUANTITY', 'INTEGER', true, 8),
('d0000000-0000-0000-0000-000000000003', 'REORDER_LEVEL', 'INTEGER', true, 9),
('d0000000-0000-0000-0000-000000000003', 'SUPPLIER', 'VARCHAR(255)', true, 10),
('d0000000-0000-0000-0000-000000000003', 'SKU', 'VARCHAR(100)', true, 11),
('d0000000-0000-0000-0000-000000000003', 'WEIGHT_KG', 'DECIMAL(10,3)', true, 12),
('d0000000-0000-0000-0000-000000000003', 'DESCRIPTION', 'TEXT', true, 13),
('d0000000-0000-0000-0000-000000000003', 'IS_ACTIVE', 'BOOLEAN', true, 14),
('d0000000-0000-0000-0000-000000000003', 'CREATED_AT', 'TIMESTAMP', true, 15),
('d0000000-0000-0000-0000-000000000003', 'UPDATED_AT', 'TIMESTAMP', true, 16)
ON CONFLICT (table_id, name) DO NOTHING;

-- Columns for SAMPLE_ORDER_ITEMS
INSERT INTO snowflake_columns (table_id, name, data_type, nullable, ordinal_position) VALUES
('d0000000-0000-0000-0000-000000000004', 'ID', 'UUID', false, 1),
('d0000000-0000-0000-0000-000000000004', 'ORDER_ITEM_ID', 'VARCHAR(20)', false, 2),
('d0000000-0000-0000-0000-000000000004', 'ORDER_ID', 'VARCHAR(20)', false, 3),
('d0000000-0000-0000-0000-000000000004', 'PRODUCT_ID', 'VARCHAR(20)', false, 4),
('d0000000-0000-0000-0000-000000000004', 'QUANTITY', 'INTEGER', false, 5),
('d0000000-0000-0000-0000-000000000004', 'UNIT_PRICE', 'DECIMAL(15,2)', false, 6),
('d0000000-0000-0000-0000-000000000004', 'DISCOUNT_PERCENT', 'DECIMAL(5,2)', true, 7),
('d0000000-0000-0000-0000-000000000004', 'TOTAL_PRICE', 'DECIMAL(15,2)', false, 8),
('d0000000-0000-0000-0000-000000000004', 'CREATED_AT', 'TIMESTAMP', true, 9)
ON CONFLICT (table_id, name) DO NOTHING;

-- ============================================================================
-- SEED SAMPLE QUERY HISTORY
-- ============================================================================

INSERT INTO snowflake_query_history (
    id, statement_handle, warehouse_id, database_name, schema_name,
    sql_text, query_type, status, rows_produced, bytes_scanned,
    execution_time_ms, compilation_time_ms, user_name, role_name, created_at, completed_at
) VALUES
(
    'e0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'MOCK_DB', 'PUBLIC',
    'SELECT * FROM SAMPLE_CUSTOMERS LIMIT 100',
    'SELECT', 'SUCCESS', 20, 8192, 145, 25, 'MOCK_USER', 'PUBLIC',
    CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours' + INTERVAL '145 milliseconds'
),
(
    'e0000000-0000-0000-0000-000000000002',
    'f0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'MOCK_DB', 'PUBLIC',
    'SELECT c.NAME, COUNT(o.ORDER_ID) as order_count, SUM(o.TOTAL_AMOUNT) as total_spent FROM SAMPLE_CUSTOMERS c JOIN SAMPLE_ORDERS o ON c.CUSTOMER_ID = o.CUSTOMER_ID GROUP BY c.NAME ORDER BY total_spent DESC',
    'SELECT', 'SUCCESS', 20, 28672, 320, 45, 'MOCK_USER', 'PUBLIC',
    CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP - INTERVAL '1 hour' + INTERVAL '320 milliseconds'
),
(
    'e0000000-0000-0000-0000-000000000003',
    'f0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000001',
    'MOCK_DB', 'PUBLIC',
    'SELECT p.CATEGORY, SUM(oi.QUANTITY) as units_sold, SUM(oi.TOTAL_PRICE) as revenue FROM SAMPLE_PRODUCTS p JOIN SAMPLE_ORDER_ITEMS oi ON p.PRODUCT_ID = oi.PRODUCT_ID GROUP BY p.CATEGORY',
    'SELECT', 'SUCCESS', 8, 28672, 280, 40, 'MOCK_USER', 'PUBLIC',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes', CURRENT_TIMESTAMP - INTERVAL '30 minutes' + INTERVAL '280 milliseconds'
)
ON CONFLICT DO NOTHING;
