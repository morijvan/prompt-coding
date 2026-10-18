import type { AppUserRecord } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUserRecord;
    }
  }
}

export {};
