import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

let devBypassDbUnavailable = false;

async function getDevBypassUser(): Promise<User> {
  const now = new Date();
  const openId = ENV.devBypassOpenId;

  if (!devBypassDbUnavailable) {
    try {
      await db.upsertUser({
        openId,
        name: ENV.devBypassName,
        email: null,
        loginMethod: "dev-bypass",
        role: ENV.devBypassRole,
        lastSignedIn: now,
      });

      const persisted = await db.getUserByOpenId(openId);
      if (persisted) return persisted;
    } catch {
      devBypassDbUnavailable = true;
      console.warn(
        "[Auth] Dev bypass: database unavailable, using in-memory user profile."
      );
    }
  }

  return {
    id: 0,
    openId,
    name: ENV.devBypassName,
    email: null,
    loginMethod: "dev-bypass",
    role: ENV.devBypassRole,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user && ENV.devBypassAuth && !ENV.isProduction) {
    user = await getDevBypassUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
