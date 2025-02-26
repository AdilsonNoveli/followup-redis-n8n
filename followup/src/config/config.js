/**
 * Configuration file for the FollowUp application.
 * This file centralizes all environment variables and configuration parameters.
 * All values are expected to be provided via environment variables.
 */
module.exports = {
    redisUrl: process.env.REDIS_URL,
    keyWebhookMapping: process.env.KEY_WEBHOOK_MAPPING,
    bullmqQueueName: process.env.BULLMQ_QUEUE_NAME || 'webhookQueue',
    callbackChannel: process.env.CALLBACK_CHANNEL || 'workflow_success',
  
    // Debug mode
    debugEnabled: process.env.DEBUG === 'true',
  
    // BullMQ configurations
    bullmqAttempts: Number(process.env.BULLMQ_ATTEMPTS) || 5,
    bullmqBackoffType: process.env.BULLMQ_BACKOFF_TYPE || 'fixed',
    bullmqBackoffDelay: Number(process.env.BULLMQ_BACKOFF_DELAY) || 5000,
    bullmqConcurrency: Number(process.env.BULLMQ_CONCURRENCY) || 1,
    bullmqRemoveOnComplete: process.env.BULLMQ_REMOVE_ON_COMPLETE === 'true',
    bullmqRemoveOnFail: process.env.BULLMQ_REMOVE_ON_FAIL === 'true',
  
    // Maximum time (in ms) to wait for a callback from Redis in the worker
    workerCallbackTimeout: Number(process.env.WORKER_CALLBACK_TIMEOUT) || 300000
  };
  