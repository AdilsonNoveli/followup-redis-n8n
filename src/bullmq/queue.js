//Crie o módulo que inicializa a fila e o scheduler do BullMQ
const { Queue, QueueScheduler } = require('bullmq');
const { redisUrl, bullmqQueueName } = require('../config/config');

const redisUrlObj = new URL(redisUrl);
const connection = {
  host: redisUrlObj.hostname,
  port: Number(redisUrlObj.port) || 6379
};

const webhookQueue = new Queue(bullmqQueueName, { connection });

// O QueueScheduler gerencia jobs pendentes, retries, etc.
new QueueScheduler(bullmqQueueName, { connection });

module.exports = webhookQueue;
