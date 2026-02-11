import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { gateway } from "@specific-dev/framework";
import { generateText } from "ai";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

const VALID_LANGUAGES = ['uk', 'ru', 'en', 'pl', 'tr', 'de', 'fr', 'es', 'ar'] as const;

interface CreateScanBody {
  language?: string;
}

interface GetScanParams {
  id: string;
}

interface GenerateResponseBody {
  analysis: Record<string, unknown>;
}

interface GenerateResponseParams {
  id: string;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: CreateScanBody }>(
    '/scans',
    {
      schema: {
        description: 'Create a new scan',
        tags: ['scans'],
        body: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: VALID_LANGUAGES,
              default: 'uk',
              description: 'Language code for the scan',
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              language: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateScanBody }>, reply: FastifyReply) => {
      const { language = 'uk' } = request.body as CreateScanBody;

      app.logger.info({ language }, 'Creating new scan');

      // Validate language
      if (!VALID_LANGUAGES.includes(language as typeof VALID_LANGUAGES[number])) {
        app.logger.warn({ language }, 'Invalid language code provided');
        return reply.status(400).send({
          error: 'Invalid language code',
          validLanguages: VALID_LANGUAGES,
        });
      }

      try {
        const [scan] = await app.db
          .insert(schema.scans)
          .values({
            language: language as typeof VALID_LANGUAGES[number],
          })
          .returning();

        app.logger.info({ scanId: scan.id, language: scan.language }, 'Scan created successfully');

        return reply.status(201).send(scan);
      } catch (error) {
        app.logger.error({ err: error, language }, 'Failed to create scan');
        throw error;
      }
    }
  );

  fastify.get<{ Params: GetScanParams }>(
    '/scans/:id',
    {
      schema: {
        description: 'Get a scan by ID',
        tags: ['scans'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Scan ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              language: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: GetScanParams }>, reply: FastifyReply) => {
      const { id } = request.params as GetScanParams;

      app.logger.info({ scanId: id }, 'Fetching scan');

      try {
        const [scan] = await app.db
          .select()
          .from(schema.scans)
          .where(eq(schema.scans.id, id));

        if (!scan) {
          app.logger.warn({ scanId: id }, 'Scan not found');
          return reply.status(404).send({ error: 'Scan not found' });
        }

        app.logger.info({ scanId: id, language: scan.language }, 'Scan retrieved successfully');

        return scan;
      } catch (error) {
        app.logger.error({ err: error, scanId: id }, 'Failed to retrieve scan');
        throw error;
      }
    }
  );

  fastify.get(
    '/scans',
    {
      schema: {
        description: 'Get all scans',
        tags: ['scans'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                language: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest) => {
      app.logger.info({}, 'Fetching all scans');

      try {
        const scans = await app.db.select().from(schema.scans);

        app.logger.info({ count: scans.length }, 'Scans retrieved successfully');

        return scans;
      } catch (error) {
        app.logger.error({ err: error }, 'Failed to retrieve scans');
        throw error;
      }
    }
  );

  fastify.post<{ Params: GenerateResponseParams; Body: GenerateResponseBody }>(
    '/api/scans/:id/generate-response',
    {
      schema: {
        description: 'Generate a professional response letter in Dutch using AI',
        tags: ['scans'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Scan ID' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            analysis: {
              type: 'object',
              description: 'Full letter analysis containing sender, type, summary, deadline, amount, urgency, etc.',
            },
          },
          required: ['analysis'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              response: { type: 'string' },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: GenerateResponseParams; Body: GenerateResponseBody }>,
      reply: FastifyReply
    ) => {
      const requireAuth = app.requireAuth();
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params as GenerateResponseParams;
      const { analysis } = request.body as GenerateResponseBody;

      app.logger.info({ scanId: id, userId: session.user.id }, 'Generating response letter');

      try {
        // Verify scan exists
        const [scan] = await app.db
          .select()
          .from(schema.scans)
          .where(eq(schema.scans.id, id));

        if (!scan) {
          app.logger.warn({ scanId: id, userId: session.user.id }, 'Scan not found');
          return reply.status(404).send({ error: 'Scan not found' });
        }

        // Build prompt with analysis details
        const analysisText = JSON.stringify(analysis, null, 2);
        const prompt = `Based on this letter analysis: ${analysisText}, generate a professional response letter in correct, formal Dutch. The response should be polite, clear, and address the main points of the original letter.`;

        app.logger.info({ scanId: id, userId: session.user.id }, 'Calling Claude API for response generation');

        // Generate response using Claude
        const { text } = await generateText({
          model: gateway('anthropic/claude-sonnet-4-20250514'),
          prompt,
        });

        app.logger.info(
          { scanId: id, userId: session.user.id, responseLength: text.length },
          'Response letter generated successfully'
        );

        return { response: text };
      } catch (error) {
        app.logger.error(
          { err: error, scanId: id, userId: session.user.id },
          'Failed to generate response letter'
        );
        throw error;
      }
    }
  );
}
