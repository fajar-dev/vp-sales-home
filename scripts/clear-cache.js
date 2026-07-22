const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");

function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [key, ...valParts] = trimmed.split("=");
        if (key && valParts.length > 0) {
          const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const host = process.env.REDIS_HOST || "127.0.0.1";
const port = Number(process.env.REDIS_PORT || 6379);
const password = process.env.REDIS_PASSWORD || undefined;
const db = Number(process.env.REDIS_DB || 0);

console.log(`Connecting to Redis at ${host}:${port} (DB: ${db})...`);

const redis = new Redis({
  host,
  port,
  password,
  db,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

async function clearAppCache() {
  try {
    const keys = await redis.keys("vpsales:*");
    if (keys.length > 0) {
      const deletedCount = await redis.del(...keys);
      console.log(`✅ Cleared ${deletedCount} application cache key(s) (prefix 'vpsales:*').`);
    } else {
      console.log(`ℹ️ No cache keys found with prefix 'vpsales:*'.`);
    }
    redis.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to clear cache:", err);
    redis.disconnect();
    process.exit(1);
  }
}

clearAppCache();
