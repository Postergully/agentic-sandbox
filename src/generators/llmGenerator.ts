/**
 * LLM Generator
 *
 * Context-aware data generation using Claude API.
 * Used for gap-filling, business context enhancement,
 * and generating data that requires semantic understanding.
 */

import config from '../config';
import logger from '../utils/logger';
import {
  DataGenerator,
  TableGenerationPlan,
  GenerationContext,
  GeneratedTableData,
  FieldGenerationPlan,
  LlmEngineConfig,
} from '../types/dataGeneration';

export class LlmGenerator implements DataGenerator {
  name: 'llm' = 'llm';

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.dataGeneration.anthropicApiKey;
    this.model = 'claude-3-haiku-20240307'; // Use Haiku for cost efficiency
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      logger.debug('Anthropic API key not configured');
      return false;
    }

    // Quick validation - we don't make an API call here to avoid costs
    return this.apiKey.length > 0;
  }

  async generateTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<GeneratedTableData> {
    const startTime = Date.now();

    logger.info('Generating table with LLM', {
      tableName: plan.tableName,
      rowCount: plan.rowCount,
      jobId: context.jobId,
    });

    // Build the prompt for data generation
    const prompt = this.buildTableGenerationPrompt(plan, context);

    try {
      const rows = await this.generateWithLLM(prompt, plan.rowCount);

      const endTime = Date.now();

      return {
        tableName: plan.tableName,
        entityName: plan.entityName,
        columns: plan.fields.map((f) => f.fieldName),
        rows,
        metadata: {
          generatedAt: new Date().toISOString(),
          generator: 'llm',
          rowCount: rows.length,
          generationTimeMs: endTime - startTime,
        },
      };
    } catch (error) {
      logger.error('LLM generation failed', { tableName: plan.tableName, error });
      throw error;
    }
  }

  async generateField(
    fieldPlan: FieldGenerationPlan,
    rowCount: number,
    context: GenerationContext
  ): Promise<unknown[]> {
    logger.debug('Generating single field with LLM', {
      fieldName: fieldPlan.fieldName,
      rowCount,
    });

    const prompt = this.buildFieldGenerationPrompt(fieldPlan, rowCount, context);
    const response = await this.callClaudeAPI(prompt);

    // Parse the response as JSON array
    try {
      const values = JSON.parse(response);
      if (Array.isArray(values)) {
        return values.slice(0, rowCount);
      }
      // If single value, replicate it
      return Array(rowCount).fill(values);
    } catch {
      logger.warn('Could not parse LLM field response as JSON', { response });
      return Array(rowCount).fill(response);
    }
  }

  /**
   * Enhance existing data with business context
   * This is the primary use case for LLM in the pipeline
   */
  async enhanceData(
    data: GeneratedTableData,
    context: GenerationContext
  ): Promise<GeneratedTableData> {
    logger.info('Enhancing data with LLM', {
      tableName: data.tableName,
      rowCount: data.rows.length,
    });

    const prompt = this.buildEnhancementPrompt(data, context);

    try {
      const response = await this.callClaudeAPI(prompt);
      const enhancedRows = JSON.parse(response);

      return {
        ...data,
        rows: enhancedRows,
        metadata: {
          ...data.metadata,
          generator: 'llm',
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.warn('LLM enhancement failed, returning original data', { error });
      return data;
    }
  }

  private buildTableGenerationPrompt(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): string {
    const metadata = context.brief.metadata;

    const fieldDescriptions = plan.fields
      .map((f) => {
        let desc = `- ${f.fieldName}: ${f.fieldType}`;
        if (f.required) desc += ' (required)';
        if (f.unique) desc += ' (unique)';
        if (f.primaryKey) desc += ' (primary key)';
        if (f.foreignKey) {
          desc += ` (references ${f.foreignKey.table}.${f.foreignKey.column})`;
        }
        return desc;
      })
      .join('\n');

    // Get existing FK values if available
    const fkContext = this.buildForeignKeyContext(plan, context);

    return `Generate ${plan.rowCount} realistic records for a ${plan.entityName} table.

Context:
- Industry: ${metadata.industry}
- Company Size: ${metadata.companySize || 'medium'}
- Region: ${metadata.region || 'US'}
${metadata.customContext ? `- Additional Context: ${metadata.customContext}` : ''}

Table Schema:
${fieldDescriptions}

${fkContext}

Requirements:
1. Generate exactly ${plan.rowCount} records
2. Ensure data is realistic for the ${metadata.industry} industry
3. Maintain referential integrity with foreign keys
4. Use appropriate formats (ISO dates, proper UUIDs, etc.)
5. Vary the data - don't repeat the same patterns

Return ONLY a valid JSON array of objects, no explanation or markdown.
Each object should have all the fields listed above.

Example format:
[{"field1": "value1", "field2": 123}, {"field1": "value2", "field2": 456}]`;
  }

  private buildFieldGenerationPrompt(
    fieldPlan: FieldGenerationPlan,
    rowCount: number,
    context: GenerationContext
  ): string {
    const metadata = context.brief.metadata;

    let prompt = `Generate ${rowCount} unique values for a "${fieldPlan.fieldName}" field.

Context:
- Industry: ${metadata.industry}
- Company Size: ${metadata.companySize || 'medium'}
- Field Type: ${fieldPlan.fieldType}
- Required: ${fieldPlan.required}
- Unique: ${fieldPlan.unique}

`;

    // Add custom prompt if provided in LLM config
    if (fieldPlan.engineConfig.type === 'llm') {
      const llmConfig = fieldPlan.engineConfig as LlmEngineConfig;
      if (llmConfig.prompt) {
        prompt += `Specific Instructions: ${llmConfig.prompt}\n\n`;
      }
    }

    prompt += `Return ONLY a valid JSON array of ${rowCount} values, no explanation.
Example: ["value1", "value2", "value3"]`;

    return prompt;
  }

  private buildEnhancementPrompt(
    data: GeneratedTableData,
    context: GenerationContext
  ): string {
    const metadata = context.brief.metadata;

    // Take a sample of rows for the prompt (to avoid token limits)
    const sampleSize = Math.min(data.rows.length, 5);
    const sampleRows = data.rows.slice(0, sampleSize);

    return `Review and enhance this ${data.entityName} data for realism and business consistency.

Context:
- Industry: ${metadata.industry}
- Company Size: ${metadata.companySize || 'medium'}
- Region: ${metadata.region || 'US'}
${metadata.customContext ? `- Additional Context: ${metadata.customContext}` : ''}

Sample Data (${sampleSize} of ${data.rows.length} rows):
${JSON.stringify(sampleRows, null, 2)}

Enhancement Goals:
1. Fix any logical inconsistencies (e.g., ship_date before order_date)
2. Ensure status values match other field values
3. Make names and descriptions more industry-appropriate
4. Ensure amounts and quantities are realistic
5. Maintain all foreign key references unchanged

Return the enhanced data as a valid JSON array.
If data is already good, return it unchanged.
Return ALL ${data.rows.length} rows, not just the sample.

Current full data:
${JSON.stringify(data.rows, null, 2)}`;
  }

  private buildForeignKeyContext(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): string {
    const fkFields = plan.fields.filter((f) => f.foreignKey);
    if (fkFields.length === 0) return '';

    let fkContext = '\nForeign Key Values (use these for referential integrity):\n';

    for (const field of fkFields) {
      const referencedTable = context.generatedTables.get(field.foreignKey!.table);
      if (referencedTable && referencedTable.rows.length > 0) {
        const values = referencedTable.rows
          .slice(0, 10)
          .map((r) => r[field.foreignKey!.column]);
        fkContext += `- ${field.fieldName} must be one of: ${JSON.stringify(values)}\n`;
      }
    }

    return fkContext;
  }

  private async generateWithLLM(
    prompt: string,
    _expectedRows: number
  ): Promise<Record<string, unknown>[]> {
    const response = await this.callClaudeAPI(prompt);

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      logger.warn('LLM response was not an array', { response: response.slice(0, 200) });
      return [];
    } catch (error) {
      logger.error('Failed to parse LLM response as JSON', {
        error,
        response: response.slice(0, 500),
      });

      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // Fall through to empty array
        }
      }

      return [];
    }
  }

  private async callClaudeAPI(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };

    // Extract text from Claude's response format
    if (data.content && Array.isArray(data.content) && data.content.length > 0) {
      return data.content[0].text || '';
    }

    return '';
  }
}

/**
 * Specialized prompts for different data types
 */
export class LlmPromptBuilder {
  /**
   * Build a prompt for generating industry-specific company names
   */
  static companyNames(industry: string, count: number): string {
    return `Generate ${count} realistic company names for the ${industry} industry.
These should sound like real companies - a mix of:
- Industry-specific names (using relevant terminology)
- Generic professional names
- Modern startup-style names
- Traditional corporate names

Return as JSON array: ["Company A", "Company B", ...]`;
  }

  /**
   * Build a prompt for generating realistic email threads
   */
  static emailThread(context: {
    industry: string;
    topic: string;
    participants: number;
    messageCount: number;
  }): string {
    return `Generate a realistic email thread for a ${context.industry} company.

Topic: ${context.topic}
Participants: ${context.participants} people
Messages: ${context.messageCount}

Include:
- Realistic subject line
- Professional but natural language
- Industry-specific terminology where appropriate
- Typical email signatures

Return as JSON:
{
  "subject": "...",
  "messages": [
    {
      "from": "name@company.com",
      "to": ["recipient@company.com"],
      "timestamp": "ISO date",
      "body": "message content"
    }
  ]
}`;
  }

  /**
   * Build a prompt for generating chat/Slack-style messages
   */
  static chatMessages(context: {
    industry: string;
    channel: string;
    messageCount: number;
  }): string {
    return `Generate ${context.messageCount} realistic Slack/chat messages for a ${context.industry} company.

Channel: #${context.channel}

Include:
- Casual but professional tone
- Some messages with replies/threads
- Occasional emoji usage
- Industry-relevant discussions

Return as JSON array:
[
  {
    "user": "username",
    "timestamp": "ISO date",
    "text": "message content",
    "thread_ts": null or "parent_timestamp"
  }
]`;
  }

  /**
   * Build a prompt for generating document content
   */
  static documentContent(context: {
    industry: string;
    documentType: string;
    topic: string;
  }): string {
    return `Generate a realistic ${context.documentType} for a ${context.industry} company.

Topic: ${context.topic}

The document should:
- Use appropriate formatting (headers, bullet points)
- Include industry-specific terminology
- Be professional in tone
- Be realistic in length (not too short, not too long)

Return as JSON:
{
  "title": "...",
  "content": "markdown formatted content",
  "metadata": {
    "author": "...",
    "createdAt": "ISO date",
    "lastModified": "ISO date",
    "tags": ["tag1", "tag2"]
  }
}`;
  }
}

// Export singleton instance
export const llmGenerator = new LlmGenerator();
export default llmGenerator;
