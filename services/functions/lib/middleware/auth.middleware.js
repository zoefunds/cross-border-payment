"use strict";
/**
 * Auth Middleware
 * Verifies Firebase ID tokens on every protected route.
 * Attaches decoded user to req.user for downstream handlers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
const firebase_1 = require("../config/firebase");
const logger_1 = require("../utils/logger");
async function verifyToken(req, res, next) {
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
        const decoded = await firebase_1.auth.verifyIdToken(token);
        req.user = {
            uid: decoded.uid,
            email: decoded.email,
            phoneNumber: decoded.phone_number,
        };
        next();
    }
    catch (error) {
        logger_1.logger.warn("Token verification failed", { error });
        res.status(401).json({
            success: false,
            error: "Invalid or expired token",
        });
    }
}
//# sourceMappingURL=auth.middleware.js.map