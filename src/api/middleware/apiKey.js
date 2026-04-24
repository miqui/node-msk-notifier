import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

/**
 * Fastify plugin that enforces X-API-Key header authentication.
 * Skips the /health route so liveness probes are never blocked.
 */
export async function apiKeyMiddleware(app) {
  app.addHook('onRequest', async (request, reply) => {
    // Health endpoint is always public
    if (request.routerPath === '/health') return;

    const providedKey = request.headers['x-api-key'];

    if (!config.API_KEY) {
      logger.warn('api_key_not_configured — all requests allowed');
      return;
    }

    if (!providedKey || providedKey !== config.API_KEY) {
      logger.warn({ ip: request.ip, path: request.url }, 'api_key_rejected');
      reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or missing X-API-Key' });
    }
  });
}
