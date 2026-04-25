/**
 * Auth Middleware
 * Verifies Firebase ID tokens on every protected route.
 * Attaches decoded user to req.user for downstream handlers.
 */
import { Request, Response, NextFunction } from "express";
export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email?: string;
        phoneNumber?: string;
    };
}
export declare function verifyToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
