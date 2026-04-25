import { TransactionModel, InitiateTransactionRequest } from "../../../models/transaction.model";
export declare class TransactionOrchestrator {
    initiate(senderId: string, request: InitiateTransactionRequest): Promise<TransactionModel>;
    private debitNaira;
    private sendUsdc;
    private releaseUsdc;
    private creditCedis;
    private complete;
    private fail;
    private refund;
    processTransaction(transactionId: string, senderId: string, recipientAddress: string): Promise<void>;
}
export declare const transactionOrchestrator: TransactionOrchestrator;
