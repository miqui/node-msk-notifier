/**
 * Health route — used as EKS liveness and readiness probe target.
 * Always returns 200 if the process is alive.
 */
export async function healthRoutes(app) {
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'node-msk-notifier-api',
  }));
}
