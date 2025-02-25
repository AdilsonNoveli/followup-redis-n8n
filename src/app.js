//O arquivo principal, iniciando ambos os módulos
const startTTLSubscriber = require('./subscriber/ttlSubscriber');
const startBullMQWorker = require('./bullmq/worker');
const startRedisCallbackSubscriber = require('./callback/redisCallbackSubscriber');

startRedisCallbackSubscriber();
startTTLSubscriber();
startBullMQWorker();

console.log('Aplicação iniciada: TTL Subscriber, BullMQ Worker e Callback Endpoint estão rodando.');

