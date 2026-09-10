import Fastify, { type FastifyInstance } from 'fastify';

const HEALTH_PATH = '/health';
const NOT_CONFIGURED = 503;
const UNAUTHORIZED = 401;

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url === HEALTH_PATH) return;

    const appToken = process.env.APP_TOKEN;
    if (!appToken) {
      return reply.code(NOT_CONFIGURED).send({ error: 'server not configured' });
    }

    if (request.headers.authorization !== `Bearer ${appToken}`) {
      return reply.code(UNAUTHORIZED).send({ error: 'unauthorized' });
    }
  });

  app.get(HEALTH_PATH, async () => ({ ok: true }));

  return app;
}
