import { TransactionModel, TransactionStatus, CreateTransactionDto } from "../../models/transaction.model";
export declare class TransactionRepository {
    create(dto: CreateTransactionDto): Promise<TransactionModel>;
    findById(transactionId: string): Promise<TransactionModel>;
    findByTxHash(txHash: string): Promise<TransactionModel>;
    findByOnChainId(onChainId: string): Promise<TransactionModel>;
    findStuck(olderThanMinutes?: number): Promise<TransactionModel[]>;
    transition(transactionId: string, to: TransactionStatus, triggeredBy: string, note?: string, error?: string): Promise<TransactionModel>;
    findByUserId(userId: string, limit?: number): Promise<TransactionModel[]>;
    updateBlockchainRef(transactionId: string, blockchainRef: TransactionModel["blockchain"]): Promise<void>;
}
export declare const transactionRepository: TransactionRepository;
