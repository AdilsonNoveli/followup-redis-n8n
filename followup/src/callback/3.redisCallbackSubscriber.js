/**
 * Redis Callback Subscriber Module
 * This module listens to the callback channel for messages from workflows.
 * Upon receiving a message, it:
 * - Parses the JSON message.
 * - Extracts the jobId and status.
 * - Finds the corresponding deferred promise in the global pendingJobs Map.
 * - Resolves or rejects the promise based on the received status.
 */

const redis = require('redis');
const pendingJobs = require('../pendingJobs');
const { callbackChannel, debugEnabled, redisUrl } = require('../config/config');

// Use the callbackChannel from configuration for subscribing
const channel = callbackChannel;

function startRedisCallbackSubscriber() {
  const subscriber = redis.createClient({ url: redisUrl });
  
  subscriber.on('error', (err) => {
    console.error('Error in Redis Callback Subscriber:', err);
  });
  
  subscriber.connect()
    .then(() => {
      if (debugEnabled) {
        console.debug(`Subscriber connected. Subscribing to channel: ${channel}`);
      }
      return subscriber.subscribe(channel, (message) => {
        if (debugEnabled) {
          console.debug(`Message received on channel ${channel}: ${message}`);
        }
        let payload;
        try {
          payload = JSON.parse(message);
        } catch (err) {
          console.error('Error parsing callback message:', err);
          return;
        }
        
        const { jobId, status } = payload;
        if (!jobId) {
          console.error('Callback message missing jobId:', payload);
          return;
        }
        if (debugEnabled) {
          console.debug(`Processing callback for jobId: ${jobId} with status: ${status}`);
        }
        
        const deferred = pendingJobs.get(jobId);
        if (!deferred) {
          console.warn(`No pending promise found for jobId: ${jobId}`);
          return;
        }
        
        if (status === 'success') {
          deferred.resolve();
          if (debugEnabled) {
            console.debug(`Deferred promise resolved for jobId: ${jobId}`);
          }
        } else {
          deferred.reject(new Error('Workflow failed'));
          if (debugEnabled) {
            console.debug(`Deferred promise rejected for jobId: ${jobId}`);
          }
        }
        // Remove the entry from pendingJobs to prevent memory leaks
        pendingJobs.delete(jobId);
      });
    })
    .catch(err => {
      console.error('Error connecting and subscribing to callback channel:', err);
    });
}

module.exports = startRedisCallbackSubscriber;
