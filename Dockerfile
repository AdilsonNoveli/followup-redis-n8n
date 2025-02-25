FROM node:16-alpine

WORKDIR /usr/src/app

# Copia package.json e package-lock.json (se houver) e instala as dependências
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Exponha a porta se a aplicação tiver algum endpoint (opcional)
EXPOSE 3000

CMD ["npm", "start"]
