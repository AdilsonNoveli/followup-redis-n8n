/**
 * BullMQ Worker Module
 * This worker processes jobs from the BullMQ queue.
 * For each job, the following steps are executed:
 * 1. Trigger the webhook (if configured) with the jobId.
 * 2. Publish a message to the specified channel (if configured) with the jobId.
 * 3. Create a deferred promise and register the job in a global Map (pendingJobs) to await a callback via Redis Pub/Sub.
 * 4. Wait for the callback, up to a timeout defined by workerCallbackTimeout.
 * 5. Upon successful callback, publish a success event to the callback channel.
 * 6. In case of timeout or error, the job fails and retry mechanisms are triggered.
 */

const { Worker } = require('bullmq');
const axios = require('axios');
const redis = require('redis');
const config = require('../config/config');
const pendingJobs = require('../pendingJobs');

// Destructure necessary configurations
const {
  redisUrl,
  bullmqQueueName,
  callbackChannel,
  debugEnabled,
  workerCallbackTimeout,
  bullmqConcurrency
} = config;

// Create connection object for BullMQ
const redisUrlObj = new URL(redisUrl);
const connection = {
  host: redisUrlObj.hostname,
  port: Number(redisUrlObj.port) || 6379
};

// Create a Redis publisher for publishing messages to channels
const publisher = redis.createClient({ url: redisUrl });
publisher.connect().catch(err => {
  console.error('Error connecting to Redis publisher:', err);
});

/**
 * Helper function to create a deferred promise.
 * Returns an object containing the promise and its resolve/reject functions.
 */
function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Starts the BullMQ worker to process jobs.
 */
function startBullMQWorker() {
  const worker = new Worker(
    bullmqQueueName,
    async job => {
      const { key, webhookUrl, channel } = job.data;
      
      // Step 1: Trigger the webhook if configured
      if (webhookUrl) {
        try {
          console.log(`Triggering webhook for key ${key} at ${webhookUrl}`);
          const response = await axios.post(webhookUrl, {
            jobId: job.id,
            event: 'event_webhook',
            message: `The key ${key} has expired.`
          });
          
          // Check if the response is valid (status 200 and body equals 'success')
          if (response.status !== 200 || response.data !== 'success') {
            throw new Error(`Webhook confirmation failed for key ${key}`);
          }
          console.log(`Webhook successfully triggered at ${webhookUrl}`);
        } catch (error) {
          console.error(`Error triggering webhook at ${webhookUrl}: ${error.message}`);
          throw error;
        }
      }
      
      // Step 2: Publish a message to the specified channel if configured
      if (channel) {
        try {
          const pubMessage = JSON.stringify({
            jobId: job.id,
            key,
            message: `The key ${key} has expired. Job initiated.`
          });
          console.log(`Publishing message to channel ${channel}: ${pubMessage}`);
          await publisher.publish(channel, pubMessage);
          console.log(`Message published successfully to channel ${channel}`);
        } catch (error) {
          console.error(`Error publishing message to channel ${channel}: ${error.message}`);
          throw error;
        }
      }
      
      // Step 3: Create a deferred promise to wait for the callback via Redis Pub/Sub
      const deferred = createDeferred();
      pendingJobs.set(job.id, deferred);
      console.log(`Waiting for callback for job ${job.id}...`);
      
      // Step 4: Await the callback with a timeout defined in workerCallbackTimeout
      try {
        await Promise.race([
          deferred.promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Callback wait timeout exceeded for job')), workerCallbackTimeout)
          )
        ]);
      } catch (error) {
        console.error(`Callback error for job ${job.id}: ${error.message}`);
        pendingJobs.delete(job.id);
        throw error;
      }
      
      // Step 5: Callback received successfully; publish the final success event to the callback channel
      try {
        const successMessage = JSON.stringify({
          jobId: job.id,
          key,
          status: 'success',
          timestamp: Date.now()
        });
        console.log(`Publishing success event to channel ${callbackChannel}: ${successMessage}`);
        await publisher.publish(callbackChannel, successMessage);
        console.log(`Success event published to channel ${callbackChannel}`);
      } catch (error) {
        console.error(`Error publishing success event to channel ${callbackChannel}: ${error.message}`);
        throw error;
      }
    },
    {
      connection,
      concurrency: bullmqConcurrency
    }
  );

  // Log job completion and failure events
  worker.on('completed', job => {
    console.log(`Job ${job.id} completed successfully.`);
  });
  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed: ${err.message}`);
  });
}

module.exports = startBullMQWorker;
