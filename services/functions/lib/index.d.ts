import * as functionsV1 from "firebase-functions/v1";
import "./config/firebase";
export declare const healthCheck: functionsV1.HttpsFunction;
export declare const api: functionsV1.HttpsFunction;
export declare const recoverStuckTransactions: functionsV1.CloudFunction<unknown>;
export declare const takeLiquiditySnapshot: functionsV1.CloudFunction<unknown>;
