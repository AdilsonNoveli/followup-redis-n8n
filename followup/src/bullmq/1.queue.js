/**
 * Initializes the BullMQ queue and scheduler.
 * This module sets up the queue and its scheduler for managing pending jobs.
 */

const { Queue, QueueScheduler } = require('bullmq');
const { redisUrl, bullmqQueueName } = require('../config/config');

// Parse redis URL and create connection object
const redisUrlObj = new URL(redisUrl);
const connection = {
  host: redisUrlObj.hostname,
  port: Number(redisUrlObj.port) || 6379
};

const webhookQueue = new Queue(bullmqQueueName, { connection });

// Initialize the QueueScheduler to manage delayed jobs and retries.
new QueueScheduler(bullmqQueueName, { connection });

module.exports = webhookQueue;
