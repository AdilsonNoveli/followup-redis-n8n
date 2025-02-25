const redis = require('redis');
const config = require('../config/config'); // Importa o config.js
const webhookQueue = require('../bullmq/queue');
// Ex.: define callbackChannel = 'workflow_callback'
const { keyWebhookMapping } = require('../config/config'); 

// Usa a flag de debug definida no config.js
const debugEnabled = config.debugEnabled;

// Novo parsing: cada par pode conter webhook e canal separados por '|'
const keyMapping = {};
keyWebhookMapping.split(',').forEach(pair => {
  const [key, value] = pair.split('=');
  if (key) {
    let webhookUrl = null;
    let channel = null;
    if (value) {
      // Se contiver o separador "|", divide nos dois campos
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
  console.error('❌ Erro: Nenhum mapeamento de chave configurado.');
  process.exit(1);
}

console.log('🔑 Mapeamento de chave para ações:', keyMapping);

function startTTLSubscriber() {
  const pubsub = redis.createClient({
    url: config.redisUrl, // Lê do config, não de process.env
  });

  pubsub.on('error', err => {
    console.error('Erro ao conectar ao Redis (TTL Subscriber):', err);
    process.exit(1);
  });

  pubsub.connect().then(async () => {
    console.log('✅ Conexão com o Redis estabelecida (TTL Subscriber).');
    const channelName = '__keyevent@0__:expired';

    // Usa pSubscribe para escutar expirações de chaves
    await pubsub.pSubscribe(channelName, async (message, ch) => {
      // Filtra chaves internas do BullMQ que começam com "bull:"
      if (message.startsWith('bull:')) {
        if (debugEnabled) {
          console.debug(`DEBUG: Evento recebido - Canal: ${ch}, Chave: ${message} (ignorada)`);
        }
        return;
      }

      console.log(`Evento recebido - Canal: ${ch}, Chave: ${message}`);

      // Verifica se a chave expirada está no mapeamento
      const mapping = keyMapping[message];
      if (mapping) {
        console.log(`Chave expirada detectada: ${message}. Enfileirando job.`);

        try {
          // Monta os dados do job. Você pode adicionar mais campos, se necessário
          const jobData = {
            key: message,
            webhookUrl: mapping.webhookUrl,
            channel: mapping.channel,
          };

          // Enfileira um job com as informações (webhook e canal) e configura retries
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

          console.log(`Job enfileirado para a chave ${message}.`);
        } catch (err) {
          console.error(`Erro ao enfileirar job para a chave ${message}: ${err.message}`);
        }

      } else {
        if (debugEnabled) {
          console.debug(`DEBUG: Chave desconhecida expirada: ${message}`);
        }
        // Não loga warning por padrão se não houver mapeamento
      }
    });

    console.log(`Assinatura ativa para eventos de expiração no canal: ${channelName}`);
  }).catch(err => {
    console.error('Erro ao conectar ao Redis (TTL Subscriber):', err);
    process.exit(1);
  });
}

module.exports = startTTLSubscriber;
