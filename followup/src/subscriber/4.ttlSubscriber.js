/**
 * TTL Subscriber Module
 * This module listens to Redis key expiration events and enqueues jobs accordingly.
 * It uses a mapping from keys to their associated webhook URLs and channels.
 */

const redis = require('redis');
const config = require('../config/config');
const webhookQueue = require('../bullmq/1.queue');

// Parse keyWebhookMapping from configuration
if (!config.keyWebhookMapping) {
  console.error('Error: KEY_WEBHOOK_MAPPING is not configured.');
  process.exit(1);
}

const keyMapping = {};
config.keyWebhookMapping.split(',').forEach(pair => {
  const [key, value] = pair.split('=');
  if (key) {
    let webhookUrl = null;
    let channel = null;
    if (value) {
      if (value.includes('|')) {
        const parts = value.split('|');
        webhookUrl = parts[0] && parts[0].trim() !== '' ? parts[0].trim() : null;
        channel = parts[1] && parts[1].trim() !== '' ? parts[1].trim() : null;
      } else {
        webhookUrl = value.trim();
      }
    }
    keyMapping[key.trim()] = { webhookUrl, channel };
  }
});

if (Object.keys(keyMapping).length === 0) {
  console.error('Error: No key mapping configured.');
  process.exit(1);
}

console.log('Key mapping for actions:', keyMapping);

function startTTLSubscriber() {
  const pubsub = redis.createClient({
    url: config.redisUrl,
  });

  pubsub.on('error', err => {
    console.error('Error connecting to Redis (TTL Subscriber):', err);
    process.exit(1);
  });

  pubsub.connect().then(async () => {
    console.log('Connected to Redis (TTL Subscriber).');
    const channelName = '__keyevent@0__:expired';

    // Use pSubscribe to listen to key expiration events
    await pubsub.pSubscribe(channelName, async (message, ch) => {
      // Ignore keys that start with "bull:" (internal BullMQ keys)
      if (message.startsWith('bull:')) {
        if (config.debugEnabled) {
          console.debug(`DEBUG: Event received on channel ${ch} for key ${message} (ignored)`);
        }
        return;
      }

      console.log(`Event received on channel ${ch} for key: ${message}`);

      // Check if the expired key exists in the mapping
      const mapping = keyMapping[message];
      if (mapping) {
        console.log(`Detected expired key: ${message}. Enqueuing job.`);
        try {
          const jobData = {
            key: message,
            webhookUrl: mapping.webhookUrl,
            channel: mapping.channel,
          };

          await webhookQueue.add(
            'webhookJob',
            jobData,
            {
              attempts: config.bullmqAttempts,
              backoff: {
                type: config.bullmqBackoffType,
                delay: config.bullmqBackoffDelay
              },
              removeOnComplete: config.bullmqRemoveOnComplete,
              removeOnFail: config.bullmqRemoveOnFail
            }
          );

          console.log(`Job enqueued for key ${message}.`);
        } catch (err) {
          console.error(`Error enqueuing job for key ${message}: ${err.message}`);
        }
      } else {
        if (config.debugEnabled) {
          console.debug(`DEBUG: Unknown expired key: ${message}`);
        }
      }
    });

    console.log(`Subscription active for expiration events on channel: ${channelName}`);
  }).catch(err => {
    console.error('Error connecting to Redis (TTL Subscriber):', err);
    process.exit(1);
  });
}

module.exports = startTTLSubscriber;
