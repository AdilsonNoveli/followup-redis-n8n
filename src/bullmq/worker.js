const { Worker } = require('bullmq');
const axios = require('axios');
const redis = require('redis');
const config = require('../config/config'); // Importa todas as configurações
const pendingJobs = require('../pendingJobs');

// Desestrutura apenas o que for preciso do config
const {
  redisUrl,
  bullmqQueueName,
  successChannel,
  debugEnabled,
  workerCallbackTimeout,  // ex.: 300000 (5 minutos)
  bullmqConcurrency       // ex.: 1
} = config;

// Cria a conexão para o BullMQ
const redisUrlObj = new URL(redisUrl);
const connection = {
  host: redisUrlObj.hostname,
  port: Number(redisUrlObj.port) || 6379
};

// Cria um publisher Redis para enviar mensagens a canais (usado para publicar notificações)
const publisher = redis.createClient({ url: redisUrl });
publisher.connect().catch(err => {
  console.error('Erro ao conectar o publisher do Redis:', err);
});

// Helper para criar uma deferred promise
function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Inicia o worker do BullMQ.
 * 
 * Para cada job, o worker realiza as seguintes etapas:
 * 1. Dispara o webhook (se configurado) e inclui o jobId no payload.
 * 2. Publica uma mensagem em um canal (se configurado) com o jobId.
 * 3. Cria uma deferred promise e registra o job no Map global (pendingJobs), 
 *    aguardando que o módulo de Redis Pub/Sub (redisCallbackSubscriber) resolva a promise.
 * 4. Aguarda (até o tempo definido em workerCallbackTimeout) que a promise seja resolvida.
 * 5. Se o callback for recebido com sucesso, publica um evento final de sucesso no canal definido por successChannel.
 * 6. Em caso de timeout ou erro, o job falha e os mecanismos de retry são acionados.
 */
function startBullMQWorker() {
  // Cria o worker do BullMQ com a concorrência definida em config
  const worker = new Worker(
    bullmqQueueName,
    async job => {
      const { key, webhookUrl, channel } = job.data;
      
      // Etapa 1: Disparar o webhook, se configurado
      if (webhookUrl) {
        try {
          console.log(`Disparando webhook para a chave ${key} em ${webhookUrl}`);
          // O payload inclui o jobId para que o workflow saiba qual job está sendo processado
          const response = await axios.post(webhookUrl, {
            jobId: job.id,
            event: 'event_webhook',
            message: `A chave ${key} expirou.`
          });

          // Se a resposta não for 200 ou não tiver "success" no body, consideramos falha
          // if (response.status !== 200 || !response.data.success)
          if (response.status !== 200 || response.data !== 'success') {
            throw new Error(`Falha na confirmação do webhook para a chave ${key}`);
          }
          console.log(`Webhook disparado com sucesso para ${webhookUrl}`);
        } catch (error) {
          console.error(`Erro ao disparar webhook para ${webhookUrl}: ${error.message}`);
          throw error; 
        }
      }
      
      // Etapa 2: Publicar mensagem no canal, se configurado
      if (channel) {
        try {
          const pubMessage = JSON.stringify({
            jobId: job.id,
            key,
            message: `A chave ${key} expirou. O job foi iniciado.`
          });
          console.log(`Publicando mensagem no canal ${channel}: ${pubMessage}`);
          await publisher.publish(channel, pubMessage);
          console.log(`Mensagem publicada com sucesso no canal ${channel}`);
        } catch (error) {
          console.error(`Erro ao publicar no canal ${channel}: ${error.message}`);
          throw error;
        }
      }
      
      // Etapa 3: Criar uma deferred promise para aguardar o callback via Redis Pub/Sub
      const deferred = createDeferred();
      pendingJobs.set(job.id, deferred);
      console.log(`Aguardando callback para o job ${job.id}...`);
      
      // Etapa 4: Aguarda o callback, com timeout definido em workerCallbackTimeout
      try {
        await Promise.race([
          deferred.promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tempo de espera do callback esgotado, job removido')), workerCallbackTimeout)
          )
        ]);
      } catch (error) {
        console.error(`Erro no callback para o job ${job.id}: ${error.message}`);
        pendingJobs.delete(job.id);
        throw error;
      }
      
      // Etapa 5: Callback recebido com sucesso; publica o evento final de sucesso no canal successChannel
      try {
        const successMessage = JSON.stringify({
          jobId: job.id,
          key,
          status: 'completed',
          timestamp: Date.now()
        });
        console.log(`Publicando evento de sucesso no canal ${successChannel}: ${successMessage}`);
        await publisher.publish(successChannel, successMessage);
        console.log(`Evento de sucesso publicado no canal ${successChannel}`);
      } catch (error) {
        console.error(`Erro ao publicar evento de sucesso no canal ${successChannel}: ${error.message}`);
        throw error;
      }
    },
    {
      connection,
      concurrency: bullmqConcurrency
    }
  );

  // Eventos para log e monitoramento
  worker.on('completed', job => {
    console.log(`Job ${job.id} concluído com sucesso.`);
  });
  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} falhou: ${err.message}`);
  });
}

module.exports = startBullMQWorker;
