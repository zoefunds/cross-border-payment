/**
 * ABI for the Escrow contract deployed on Base Sepolia
 * Escrow:   0xaC11528c36A05C904Bead5Ed3a74d4e40Dd38bfE
 * MockUSDC: 0xB9a0E369995c03d966470D4E86b1bdbAD9bd7dc2
 * Chain:    Base Sepolia (84532)
 */
export declare const CROSS_BORDER_PAYMENT_ABI: readonly [{
    readonly type: "function";
    readonly name: "deposit";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
    }, {
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "completeTransfer";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "cancelTransfer";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "getTransfer";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "sender";
            readonly type: "address";
        }, {
            readonly name: "recipient";
            readonly type: "address";
        }, {
            readonly name: "amount";
            readonly type: "uint256";
        }, {
            readonly name: "fee";
            readonly type: "uint256";
        }, {
            readonly name: "netAmount";
            readonly type: "uint256";
        }, {
            readonly name: "status";
            readonly type: "uint8";
        }, {
            readonly name: "timestamp";
            readonly type: "uint64";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "isPending";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "calculateFee";
    readonly inputs: readonly [{
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "contractBalance";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "relayer";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "usdcToken";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "paused";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "TransferInitiated";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "sender";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "recipient";
        readonly type: "address";
        readonly indexed: false;
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "fee";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "netAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "timestamp";
        readonly type: "uint64";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "TransferCompleted";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "recipient";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "netAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "timestamp";
        readonly type: "uint64";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "TransferCancelled";
    readonly inputs: readonly [{
        readonly name: "txId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "sender";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "timestamp";
        readonly type: "uint64";
        readonly indexed: false;
    }];
}];
export declare const USDC_ABI: readonly [{
    readonly type: "function";
    readonly name: "approve";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "allowance";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "balanceOf";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "transfer";
    readonly inputs: readonly [{
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "decimals";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "mint";
    readonly inputs: readonly [{
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}];
