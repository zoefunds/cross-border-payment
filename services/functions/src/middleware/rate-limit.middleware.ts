import rateLimit from "express-rate-limit";
import { Request } from "express";

// Firebase Functions proxies requests — we need to handle missing IP gracefully
const keyGenerator = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
};

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: "Too many requests", code: "RATE_LIMITED" },
});

export const transactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: "Too many transaction requests", code: "RATE_LIMITED" },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: "Too many auth requests", code: "RATE_LIMITED" },
});
