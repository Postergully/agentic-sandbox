#!/usr/bin/env npx ts-node
/**
 * Test NetSuite Large Docs Parser
 *
 * This script runs the LargeDocsParser on NetSuite 2025_2 documentation
 * and saves the output to schemas/netsuite.json
 *
 * Usage: npx ts-node scripts/test-netsuite-parser.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { LargeDocsParser } from '../src/schema/parsers/large-docs-parser';
import { validateSchema } from '../src/schema/connector-schema';

// Configuration
const DOCS_PATH = path.resolve(__dirname, '../docs/2025_2');
const INDEX_PATH = path.resolve(__dirname, '../src/schema/indexes/netsuite-2025_2.json');
const OUTPUT_PATH = path.resolve(__dirname, '../schemas/netsuite.json');

// Records to parse - common business entities
const RECORDS_TO_PARSE = [
  'customer',
  'invoice',
  'vendor',
  'salesorder',
  'purchaseorder',
  'employee',
  'contact',
  'item',
  'inventoryitem',
  'account',
  'creditmemo',
  'customerpayment',
  'vendorbill',
  'vendorpayment',
  'opportunity',
  'estimate',
  'cashsale',
  'journalentry',
  'location',
  'department',
];

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('NetSuite Large Docs Parser Test');
  console.log('='.repeat(60));

  // Verify docs exist
  if (!fs.existsSync(DOCS_PATH)) {
    console.error(`❌ Docs path does not exist: ${DOCS_PATH}`);
    process.exit(1);
  }

  console.log(`\n📂 Docs path: ${DOCS_PATH}`);
  console.log(`📄 Index path: ${INDEX_PATH}`);
  console.log(`💾 Output path: ${OUTPUT_PATH}`);
  console.log(`📋 Records to parse: ${RECORDS_TO_PARSE.length}`);

  // Create parser
  const parser = new LargeDocsParser({
    docsPath: DOCS_PATH,
    indexPath: INDEX_PATH,
    name: 'netsuite',
    baseUrl: '/api/netsuite',
    tablePrefix: 'netsuite',
    verbose: true,
  });

  try {
    // Initialize parser (loads index)
    console.log('\n⏳ Initializing parser...');
    await parser.initialize();

    const stats = await parser.getStats();
    console.log(`\n📊 Index Statistics:`);
    console.log(`   Total records: ${stats.totalRecords}`);
    console.log(`   With schema: ${stats.withSchema}`);
    console.log(`   With script: ${stats.withScript}`);

    // Parse the specified records
    console.log('\n⏳ Parsing records...');
    const result = await parser.parseRecords(RECORDS_TO_PARSE);

    console.log(`\n✅ Parse complete!`);
    console.log(`   Schema name: ${result.schema.name}`);
    console.log(`   Schema version: ${result.schema.version}`);
    console.log(`   Entities parsed: ${result.schema.entities.length}`);
    console.log(`   Relationships: ${result.schema.relationships.length}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Parse time: ${result.metadata?.parseTime}ms`);

    // Display entities
    console.log('\n📦 Entities:');
    for (const entity of result.schema.entities) {
      console.log(`   - ${entity.name}: ${entity.fields.length} fields`);
    }

    // Validate schema with Zod
    console.log('\n⏳ Validating schema...');
    try {
      validateSchema(result.schema);
      console.log('✅ Schema is valid!');
    } catch (validationError) {
      console.error('❌ Schema validation failed:', validationError);
      // Continue anyway to see what we got
    }

    // Save to file
    console.log(`\n💾 Saving to ${OUTPUT_PATH}...`);
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      OUTPUT_PATH,
      JSON.stringify(result.schema, null, 2),
      'utf8'
    );
    console.log('✅ Schema saved successfully!');

    // Display file stats
    const fileStats = fs.statSync(OUTPUT_PATH);
    console.log(`   File size: ${(fileStats.size / 1024).toFixed(2)} KB`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`✅ Successfully parsed ${result.schema.entities.length} entities`);
    console.log(`📄 Output saved to: ${OUTPUT_PATH}`);

    // Show sample of first entity
    if (result.schema.entities.length > 0) {
      const firstEntity = result.schema.entities[0];
      console.log(`\n📋 Sample entity (${firstEntity.name}):`);
      console.log(`   Table: ${firstEntity.tableName}`);
      console.log(`   Fields: ${firstEntity.fields.length}`);
      console.log(`   Required fields: ${firstEntity.fields.filter(f => f.required).length}`);
      console.log(`   Fields with faker: ${firstEntity.fields.filter(f => f.faker).length}`);

      console.log('\n   First 5 fields:');
      for (const field of firstEntity.fields.slice(0, 5)) {
        console.log(`     - ${field.name}: ${field.type}${field.required ? ' (required)' : ''}${field.faker ? ` [faker: ${field.faker}]` : ''}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
