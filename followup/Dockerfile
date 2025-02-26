# Use a lightweight base image of Node.js (version 16-alpine)
FROM node:16-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the dependency files (package.json and package-lock.json, if it exists)
COPY package*.json ./

# Install the necessary dependencies for the application in a production environment
RUN npm install --production

# Copy all the application source code to the working directory in the container
COPY . .

# Expose the port on which the application will run (as defined in the PORT variable, example: 3000)
EXPOSE 3000

# Define the command to start the application; uses the "start" script defined in package.json
CMD ["npm", "start"]