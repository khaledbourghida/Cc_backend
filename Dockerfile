# Base image with Node and clang-format
FROM node:18-slim

# Install clang and required dependencies
RUN apt-get update && \
    apt-get install -y clang clang-format && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Create temp directory with proper permissions
RUN mkdir -p temp && chmod 777 temp

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
