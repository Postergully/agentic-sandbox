# Agentic Sandbox - Project Spec

## Overview
A connector service that mocks real enterprise connectors (NetSuite, Salesforce, etc.) for AI agent testing and demos.

## Problem Statement
AI agent companies need to demo their products with realistic data, but:
- Can't use real customer data (privacy/security)
- Need industry-specific scenarios
- Want to test edge cases and difficult scenarios
- Need authentic auth flows

## Solution
Mock connector service that:
1. **Mimics real connector auth flows** (OAuth, API keys, etc.)
2. **Serves synthetic data** based on industry/function/context
3. **Uses platforms like Gretel.ai or Tonic.ai Fabricate** for data generation
4. **Supports scenario planning** (moderate, difficult, edge cases)

## Core Features

### 1. Connector Catalog
- Visual UI showing all available connectors (NetSuite, Salesforce, HubSpot, etc.)
- Each connector mimics real auth flow
- Redirects to mock server instead of real service

### 2. Mock Server Architecture
- API that mimics real connector APIs
- Pre-generated synthetic data
- Industry/function-specific schemas

### 3. Data Generation
- Use Gretel.ai or Tonic.ai Fabricate
- Generate based on:
  - Industry (healthcare, finance, retail, etc.)
  - Function (sales, finance, operations)
  - Business context (startup, enterprise, SMB)
  - API structure of each service

### 4. Scenario Planning
- Ability to configure data scenarios:
  - **Moderate**: Normal business operations
  - **Difficult**: Complex edge cases
  - **Edge cases**: Unusual data patterns
- Help test AI agent robustness

## Technical Requirements

### Auth Flow
- Mimic OAuth 2.0, API keys, SAML
- Store mock tokens
- Session management

### Mock Server
- REST/GraphQL APIs matching real connectors
- Schema validation
- Rate limiting (optional, for realism)

### Data Schema
- Understand each connector's API structure (NetSuite, Salesforce, etc.)
- Generate realistic mock data matching schemas
- Support custom schemas (user-provided)

## Use Cases
1. **AI Agent Companies**: Give personalized demos to prospects
2. **Developers**: Test integrations without real credentials
3. **Sales Teams**: Show industry-specific use cases
4. **QA Teams**: Test edge cases and failure modes

## Questions to Answer
1. Which connectors to support first? (Priority list)
2. Tech stack? (Node.js/Python, FastAPI/Express, DB choice)
3. Data generation: Gretel.ai vs Tonic.ai vs custom?
4. Hosting: Cloud (AWS/GCP) or self-hosted?
5. Auth: How to handle different OAuth providers?
6. UI: Separate frontend or embedded in agent platforms?

