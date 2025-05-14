# Base image with Node and clang-format
FROM node:18

# Install clang-format
RUN apt-get update && apt-get install -y clang-format

# Set app directory
WORKDIR /app

# Copy project files
COPY . .

# Install dependencies
RUN npm install

# Expose your app port (optional)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
