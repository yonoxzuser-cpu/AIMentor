# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Run the build script (Vite for frontend + Esbuild for backend)
RUN npm run build

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy only the compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the internal port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/server.cjs"]
