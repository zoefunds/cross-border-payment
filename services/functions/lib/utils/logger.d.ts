import * as winston from "winston";
export declare const logger: winston.Logger;
export declare function createContextLogger(context: Record<string, unknown>): winston.Logger;
export type Logger = winston.Logger;
