import { describe, expect, it } from 'vitest';

import {
  chainGenerateAgentOpening,
  GENERATE_AGENT_OPENING_SCHEMA_NAME,
} from '../generateAgentOpening';

describe('chainGenerateAgentOpening', () => {
  it('builds system and user messages with agent context', () => {
    const { messages, schema } = chainGenerateAgentOpening({
      contextSummary: 'Name: Code Assistant\nSystem prompt: Helps debug TypeScript',
      locale: 'en-US',
      questionCount: 4,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('opening experience');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Code Assistant');
    expect(messages[1].content).toContain('en-US');
    expect(messages[1].content).toContain('Generate exactly 4 opening questions');
    expect(schema.name).toBe(GENERATE_AGENT_OPENING_SCHEMA_NAME);
    expect(schema.schema.properties.openingQuestions.minItems).toBe(4);
    expect(schema.schema.properties.openingQuestions.maxItems).toBe(4);
  });

  it('defaults to three questions and same-language output', () => {
    const { messages, schema } = chainGenerateAgentOpening({ contextSummary: 'x' });

    expect(messages[1].content).toContain('same language');
    expect(schema.schema.properties.openingQuestions.minItems).toBe(3);
    expect(schema.schema.properties.openingQuestions.maxItems).toBe(3);
  });

  it('clamps question count to the supported range', () => {
    const high = chainGenerateAgentOpening({ contextSummary: 'x', questionCount: 99 });
    const low = chainGenerateAgentOpening({ contextSummary: 'x', questionCount: 0 });

    expect(high.schema.schema.properties.openingQuestions.maxItems).toBe(6);
    expect(low.schema.schema.properties.openingQuestions.maxItems).toBe(3);
  });
});
