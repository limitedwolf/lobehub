import type { OpenAIChatMessage } from '@lobechat/types';

/**
 * Bump when editing the opening-message prompt or schema below. The caller
 * passes this through tracing so runs can be grouped by prompt iteration.
 */
export const GENERATE_AGENT_OPENING_PROMPT_VERSION = 'v1.0';

export const GENERATE_AGENT_OPENING_SCHEMA_NAME = 'AgentOpeningMessage';

export interface AgentOpeningGeneration {
  openingMessage: string;
  openingQuestions: string[];
}

export interface GenerateAgentOpeningSchema {
  name: typeof GENERATE_AGENT_OPENING_SCHEMA_NAME;
  schema: {
    additionalProperties: false;
    properties: {
      openingMessage: {
        description: string;
        maxLength: number;
        type: 'string';
      };
      openingQuestions: {
        description: string;
        items: {
          maxLength: number;
          type: 'string';
        };
        maxItems: number;
        minItems: number;
        type: 'array';
      };
    };
    required: ['openingMessage', 'openingQuestions'];
    type: 'object';
  };
  strict: true;
}

export interface GenerateAgentOpeningParams {
  contextSummary: string;
  locale?: string;
  questionCount?: number;
  styleHint?: string;
}

export interface GenerateAgentOpeningChainResult {
  messages: OpenAIChatMessage[];
  schema: GenerateAgentOpeningSchema;
}

const clampQuestionCount = (count?: number): number => {
  if (!count || !Number.isFinite(count)) return 3;
  return Math.min(Math.max(Math.trunc(count), 1), 6);
};

const SCHEMA: GenerateAgentOpeningSchema = {
  name: GENERATE_AGENT_OPENING_SCHEMA_NAME,
  schema: {
    additionalProperties: false,
    properties: {
      openingMessage: {
        description:
          'The first message shown to a user when they start a conversation with this configured agent. Speak as the configured agent, not as Agent Builder. Keep it concise, specific, and useful.',
        maxLength: 280,
        type: 'string',
      },
      openingQuestions: {
        description:
          'Short suggested questions a user can click to start a useful conversation with this agent.',
        items: { maxLength: 120, type: 'string' },
        maxItems: 6,
        minItems: 1,
        type: 'array',
      },
    },
    required: ['openingMessage', 'openingQuestions'],
    type: 'object',
  },
  strict: true,
};

const SYSTEM_PROMPT = `You generate the opening experience for a LobeChat agent.

The output is written directly into the agent's configuration:
- openingMessage: the first message a future user sees before they type anything
- openingQuestions: clickable starter questions for that future user

Hard rules:
- Output JSON that matches the schema exactly.
- Speak as the configured agent, not as Agent Builder or a system administrator.
- Make the message specific to the agent's role, system prompt, tools, and purpose.
- Keep the opening message concise. It should introduce what the agent can help with and invite a useful next step.
- Avoid generic filler like "How can I help you today?" unless it is attached to specific capabilities.
- Opening questions must be practical user-facing tasks, not builder/configuration tasks.
- Do not mention hidden configuration, model names, provider names, or implementation details unless the agent's user-facing purpose requires it.
- Match the requested language.`;

export const chainGenerateAgentOpening = ({
  contextSummary,
  locale,
  questionCount,
  styleHint,
}: GenerateAgentOpeningParams): GenerateAgentOpeningChainResult => {
  const count = clampQuestionCount(questionCount);
  const languageInstruction = locale
    ? `Write the opening message and questions in ${locale}.`
    : 'Write in the same language as the agent context and user request.';
  const styleInstruction = styleHint?.trim()
    ? `Additional style direction: ${styleHint.trim()}`
    : '';

  return {
    messages: [
      { content: SYSTEM_PROMPT, role: 'system' },
      {
        content: [
          languageInstruction,
          `Generate exactly ${count} opening question${count > 1 ? 's' : ''}.`,
          styleInstruction,
          '<agent_context>',
          contextSummary,
          '</agent_context>',
        ]
          .filter(Boolean)
          .join('\n\n'),
        role: 'user',
      },
    ],
    schema: {
      ...SCHEMA,
      schema: {
        ...SCHEMA.schema,
        properties: {
          ...SCHEMA.schema.properties,
          openingQuestions: {
            ...SCHEMA.schema.properties.openingQuestions,
            maxItems: count,
            minItems: count,
          },
        },
      },
    },
  };
};
