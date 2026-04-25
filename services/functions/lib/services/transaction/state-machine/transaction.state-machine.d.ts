/**
 * Transaction State Machine
 *
 * Defines EXACTLY which state transitions are valid.
 * Any attempt to make an invalid transition throws immediately.
 *
 * This is the enforcement layer — no business logic bypasses this.
 */
import { TransactionStatus } from "../../../models/transaction.model";
export declare class TransactionStateMachine {
    /**
     * Validates a transition. Throws if invalid.
     */
    static validateTransition(from: TransactionStatus, to: TransactionStatus): void;
    /**
     * Returns true if the transition is valid — no throw.
     */
    static canTransition(from: TransactionStatus, to: TransactionStatus): boolean;
    /**
     * Returns all valid next states from the current state.
     */
    static getNextStates(current: TransactionStatus): TransactionStatus[];
    /**
     * Returns true if the state is terminal (no further transitions).
     */
    static isTerminal(status: TransactionStatus): boolean;
    /**
     * Returns true if this state can be retried on failure.
     */
    static isRetryable(status: TransactionStatus): boolean;
}
