const redis = require('redis');
const pendingJobs = require('../pendingJobs'); // Map global que armazena deferred promises dos jobs pendentes
const { redisUrl } = require('../config/config');

// Define o canal de callback; você pode também configurar via variável de ambiente se desejar
const callbackChannel = process.env.CALLBACK_CHANNEL || 'workflow_callback';

// Verifica se o debug está ativado (DEBUG=true ativa logs em nível debug)
const debugEnabled = process.env.DEBUG === 'true';

/**
 * Inicia o subscriber do Redis para escutar o canal de callback.
 * Ao receber uma mensagem, o módulo irá:
 * - Tentar parsear a mensagem como JSON.
 * - Verificar se a mensagem contém um `jobId` e um `status`.
 * - Procurar no Map `pendingJobs` a promise associada a esse jobId.
 * - Resolver ou rejeitar a promise conforme o status recebido.
 */
function startRedisCallbackSubscriber() {
  // Cria um cliente Redis para o subscriber
  const subscriber = redis.createClient({ url: redisUrl });

  // Trata erros de conexão do subscriber
  subscriber.on('error', (err) => {
    console.error('Erro no subscriber Redis (Callback):', err);
  });

  // Conecta-se ao Redis
  subscriber.connect()
    .then(() => {
      if (debugEnabled) {
        console.debug(`Subscriber conectado. Inscrevendo-se no canal: ${callbackChannel}`);
      }
      // Subscrição ao canal definido
      return subscriber.subscribe(callbackChannel, (message) => {
        if (debugEnabled) {
          console.debug(`Mensagem recebida no canal ${callbackChannel}: ${message}`);
        }
        // Tenta parsear a mensagem (espera-se que esteja no formato JSON)
        let payload;
        try {
          payload = JSON.parse(message);
        } catch (err) {
          console.error('Erro ao parsear a mensagem do callback:', err);
          return;
        }

        // Extrai jobId e status do payload
        const { jobId, status } = payload;
        if (!jobId) {
          console.error('Mensagem de callback sem jobId:', payload);
          return;
        }
        if (debugEnabled) {
          console.debug(`Processando callback para jobId: ${jobId} com status: ${status}`);
        }

        // Procura a deferred promise associada ao jobId no Map pendingJobs
        const deferred = pendingJobs.get(jobId);
        if (!deferred) {
          console.warn(`Nenhuma promise pendente encontrada para o jobId: ${jobId}`);
          return;
        }

        // Se o status for "success", resolve a promise; caso contrário, rejeita
        if (status === 'success') {
          deferred.resolve();
          if (debugEnabled) {
            console.debug(`Promise resolvida para jobId: ${jobId}`);
          }
        } else {
          deferred.reject(new Error('Workflow falhou'));
          if (debugEnabled) {
            console.debug(`Promise rejeitada para jobId: ${jobId}`);
          }
        }
        // Remove a entrada do Map para evitar memória residual
        pendingJobs.delete(jobId);
      });
    })
    .catch((err) => {
      console.error('Erro ao conectar e subscrever no canal de callback:', err);
    });
}

module.exports = startRedisCallbackSubscriber;
