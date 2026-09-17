declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TRACKING_API_URL?: string;
    TRACKING_SERVICE_TOKEN?: string;
  }
}
