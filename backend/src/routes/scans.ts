import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

const VALID_LANGUAGES = ['uk', 'ru', 'en', 'pl', 'tr', 'de', 'fr', 'es', 'ar'] as const;

interface CreateScanBody {
  language?: string;
}

interface GetScanParams {
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
}
