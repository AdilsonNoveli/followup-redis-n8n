/**
 * Main Application Entry Point
 * This file starts the TTL Subscriber, BullMQ Worker, and Redis Callback Subscriber.
 */

const startTTLSubscriber = require('./subscriber/4.ttlSubscriber');
const startBullMQWorker = require('./bullmq/2.worker');
const startRedisCallbackSubscriber = require('./callback/3.redisCallbackSubscriber');

startRedisCallbackSubscriber();
startTTLSubscriber();
startBullMQWorker();

console.log('Application started: TTL Subscriber, BullMQ Worker, and Callback Subscriber are running.');
