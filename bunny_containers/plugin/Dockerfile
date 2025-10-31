# Use official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Copy backend code that plugins depend on
COPY supabase/functions/_backend ./supabase/functions/_backend

# Copy container-specific files
COPY bunny_containers/plugin/package.json bunny_containers/plugin/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY bunny_containers/plugin/src ./src

# Expose port
EXPOSE 3000

# Run the server
CMD ["bun", "run", "start"]
