import "dotenv/config";

/** 3000 часто занят другими сервисами; по умолчанию 3001 */
const port = Number(process.env.PORT) || 3001;
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  console.warn(
    "[config] JWT_SECRET is missing or too short; set a strong secret in production."
  );
}

export const config = {
  port,
  jwtSecret: jwtSecret || "dev-only-insecure-secret-change-me",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  staiApiKey: process.env.STAI_API_KEY,
  staiApiUrl: process.env.STAI_API_URL || "https://api.openai.com/v1",
};
