/**
 * Auth Middleware
 * Verifies Firebase ID tokens on every protected route.
 * Attaches decoded user to req.user for downstream handlers.
 */

import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import { logger } from "../utils/logger";

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    phoneNumber?: string;
  };
}

export async function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Missing or invalid authorization header",
    });
    return;
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      phoneNumber: decoded.phone_number,
    };
    next();
  } catch (error) {
    logger.warn("Token verification failed", { error });
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
}
