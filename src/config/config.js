//Centralize as configurações e variáveis de ambiente
module.exports = {
  redisUrl: process.env.REDIS_URL,
  keyWebhookMapping: process.env.KEY_WEBHOOK_MAPPING,
  bullmqQueueName: process.env.BULLMQ_QUEUE_NAME || 'webhookQueue',
  successChannel: process.env.SUCCESS_CHANNEL || 'workflow_success',

  // Debug
  debugEnabled: process.env.DEBUG === 'true',

  // Configurações BullMQ
  bullmqAttempts: Number(process.env.BULLMQ_ATTEMPTS) || 5,
  bullmqBackoffType: process.env.BULLMQ_BACKOFF_TYPE || 'fixed', 
  bullmqBackoffDelay: Number(process.env.BULLMQ_BACKOFF_DELAY) || 5000,
  bullmqConcurrency: Number(process.env.BULLMQ_CONCURRENCY) || 1, 
  bullmqRemoveOnComplete: process.env.BULLMQ_REMOVE_ON_COMPLETE === 'true',
  bullmqRemoveOnFail: process.env.BULLMQ_REMOVE_ON_FAIL === 'true',

  // Tempo máximo de espera do worker por callback
  workerCallbackTimeout: Number(process.env.WORKER_CALLBACK_TIMEOUT) || 300000
};
