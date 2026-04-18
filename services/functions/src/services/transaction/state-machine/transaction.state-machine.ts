/**
 * Transaction State Machine
 *
 * Defines EXACTLY which state transitions are valid.
 * Any attempt to make an invalid transition throws immediately.
 *
 * This is the enforcement layer — no business logic bypasses this.
 */

import { TransactionStatus } from "../../../models/transaction.model";
import { TransactionStateError } from "../../../utils/errors";
import { createContextLogger } from "../../../utils/logger";

const logger = createContextLogger({ service: "TransactionStateMachine" });

// Defines all valid transitions as a map of: currentState -> allowedNextStates
const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  INITIATED:        ["NAIRA_DEBITED", "FAILED"],
  NAIRA_DEBITED:    ["USDC_SENT", "FAILED"],
  USDC_SENT:        ["CEDIS_CREDITED", "FAILED"],
  CEDIS_CREDITED:   ["COMPLETED", "FAILED"],
  COMPLETED:        [], // Terminal state — no transitions allowed
  FAILED:           ["REFUNDED"],
  REFUNDED:         [], // Terminal state — no transitions allowed
};

// Terminal states — once reached, the transaction is done
const TERMINAL_STATES: TransactionStatus[] = ["COMPLETED", "REFUNDED"];

// States that can be retried if they fail
const RETRYABLE_STATES: TransactionStatus[] = [
  "NAIRA_DEBITED",
  "USDC_SENT",
  "CEDIS_CREDITED",
];

export class TransactionStateMachine {
  /**
   * Validates a transition. Throws if invalid.
   */
  static validateTransition(
    from: TransactionStatus,
    to: TransactionStatus
  ): void {
    const allowed = VALID_TRANSITIONS[from];

    if (!allowed) {
      throw new TransactionStateError(from, to);
    }

    if (!allowed.includes(to)) {
      logger.error("Invalid state transition attempted", { from, to, allowed });
      throw new TransactionStateError(from, to);
    }

    logger.info("State transition validated", { from, to });
  }

  /**
   * Returns true if the transition is valid — no throw.
   */
  static canTransition(
    from: TransactionStatus,
    to: TransactionStatus
  ): boolean {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  /**
   * Returns all valid next states from the current state.
   */
  static getNextStates(current: TransactionStatus): TransactionStatus[] {
    return VALID_TRANSITIONS[current] ?? [];
  }

  /**
   * Returns true if the state is terminal (no further transitions).
   */
  static isTerminal(status: TransactionStatus): boolean {
    return TERMINAL_STATES.includes(status);
  }

  /**
   * Returns true if this state can be retried on failure.
   */
  static isRetryable(status: TransactionStatus): boolean {
    return RETRYABLE_STATES.includes(status);
  }
}
