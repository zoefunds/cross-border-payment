"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const uuid_1 = require("uuid");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const errors_1 = require("../../utils/errors");
const logger = (0, logger_1.createContextLogger)({ service: "AuthService" });
function buildInitialWallets(country) {
    if (country === "NG") {
        return [
            { currency: "NGN", balance: 0, lockedBalance: 0 },
            { currency: "USDC", balance: 0, lockedBalance: 0 },
        ];
    }
    return [
        { currency: "GHS", balance: 0, lockedBalance: 0 },
        { currency: "USDC", balance: 0, lockedBalance: 0 },
    ];
}
function isValidEvmAddress(address) {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
}
class AuthService {
    async registerUser(input) {
        const { email, password, phoneNumber, fullName, country, cryptoWalletAddress } = input;
        logger.info("Registering new user", { email, country });
        if (!phoneNumber.startsWith("+")) {
            throw new errors_1.ValidationError("Phone number must be in E.164 format e.g. +2348012345678");
        }
        if (cryptoWalletAddress && !isValidEvmAddress(cryptoWalletAddress)) {
            throw new errors_1.ValidationError("Invalid crypto wallet address format");
        }
        const existing = await firebase_1.db
            .collection(firebase_1.Collections.USERS)
            .where("email", "==", email)
            .limit(1)
            .get();
        if (!existing.empty) {
            throw new errors_1.ConflictError("User with this email already exists");
        }
        let firebaseUid;
        try {
            const userRecord = await firebase_1.auth.createUser({
                email,
                password,
                phoneNumber,
                displayName: fullName,
            });
            firebaseUid = userRecord.uid;
            logger.info("Firebase Auth user created", { uid: firebaseUid });
        }
        catch (error) {
            const fbError = error;
            logger.error("Firebase Auth createUser failed", {
                code: fbError.code,
                message: fbError.message,
            });
            if (fbError.code === "auth/email-already-exists") {
                throw new errors_1.ConflictError("Email already registered");
            }
            if (fbError.code === "auth/phone-number-already-exists") {
                throw new errors_1.ConflictError("Phone number already registered");
            }
            throw error;
        }
        const primaryCurrency = country === "NG" ? "NGN" : "GHS";
        const now = firestore_1.FieldValue.serverTimestamp();
        // Build initial crypto wallets array
        const cryptoWallets = cryptoWalletAddress
            ? [{
                    address: cryptoWalletAddress,
                    chain: "base-sepolia",
                    isVerified: false,
                    addedAt: new Date(),
                    label: "Primary",
                }]
            : [];
        const userData = {
            id: firebaseUid,
            email,
            phoneNumber,
            fullName,
            country,
            currency: primaryCurrency,
            role: "BOTH",
            wallets: buildInitialWallets(country),
            cryptoWallets,
            primaryCryptoWallet: cryptoWalletAddress ?? null,
            kyc: { status: "PENDING" },
            isActive: true,
            metadata: { registrationId: (0, uuid_1.v4)() },
            createdAt: now,
            updatedAt: now,
        };
        await firebase_1.db.collection(firebase_1.Collections.USERS).doc(firebaseUid).set(userData);
        logger.info("User registered successfully", { uid: firebaseUid, country });
        const created = await firebase_1.db.collection(firebase_1.Collections.USERS).doc(firebaseUid).get();
        return created.data();
    }
    async getUserById(uid) {
        const doc = await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).get();
        if (!doc.exists)
            throw new errors_1.NotFoundError("User");
        return doc.data();
    }
    async getPublicProfile(uid) {
        const user = await this.getUserById(uid);
        return {
            id: user.id,
            fullName: user.fullName,
            country: user.country,
            currency: user.currency,
            isActive: user.isActive,
            primaryCryptoWallet: user.primaryCryptoWallet,
        };
    }
    /**
     * Add a crypto wallet address to user profile.
     * Called when user connects MetaMask or any EVM wallet.
     */
    async addCryptoWallet(uid, address, label) {
        if (!isValidEvmAddress(address)) {
            throw new errors_1.ValidationError("Invalid EVM wallet address");
        }
        const user = await this.getUserById(uid);
        // Check for duplicate
        const exists = user.cryptoWallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
        if (exists) {
            throw new errors_1.ConflictError("Wallet address already added");
        }
        const newWallet = {
            address,
            chain: "base-sepolia",
            isVerified: false,
            addedAt: new Date(),
            label: label ?? "Wallet",
        };
        const updatedWallets = [...user.cryptoWallets, newWallet];
        const isPrimary = user.cryptoWallets.length === 0;
        await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).update({
            cryptoWallets: updatedWallets,
            ...(isPrimary ? { primaryCryptoWallet: address } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        logger.info("Crypto wallet added", { uid, address, isPrimary });
        const updated = await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).get();
        return updated.data();
    }
    /**
     * Set a wallet as the primary receiving wallet.
     */
    async setPrimaryWallet(uid, address) {
        const user = await this.getUserById(uid);
        const walletExists = user.cryptoWallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
        if (!walletExists) {
            throw new errors_1.NotFoundError("Wallet address not found on this account");
        }
        await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).update({
            primaryCryptoWallet: address,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        logger.info("Primary wallet updated", { uid, address });
    }
    /**
     * Remove a crypto wallet from user profile.
     */
    async removeCryptoWallet(uid, address) {
        const user = await this.getUserById(uid);
        const updatedWallets = user.cryptoWallets.filter((w) => w.address.toLowerCase() !== address.toLowerCase());
        if (updatedWallets.length === user.cryptoWallets.length) {
            throw new errors_1.NotFoundError("Wallet address not found");
        }
        // If removing primary wallet, set next one as primary
        let newPrimary = user.primaryCryptoWallet;
        if (user.primaryCryptoWallet?.toLowerCase() === address.toLowerCase()) {
            newPrimary = updatedWallets[0]?.address ?? null;
        }
        await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).update({
            cryptoWallets: updatedWallets,
            primaryCryptoWallet: newPrimary,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        logger.info("Crypto wallet removed", { uid, address });
    }
    /**
     * Get receiver's primary crypto wallet address.
     * Used by orchestrator before sending USDC on-chain.
     */
    async getReceiverWalletAddress(uid) {
        const user = await this.getUserById(uid);
        if (!user.primaryCryptoWallet) {
            throw new errors_1.AppError("Receiver has no crypto wallet address configured. " +
                "They must add a wallet before receiving payments.", "NO_CRYPTO_WALLET", 422);
        }
        return user.primaryCryptoWallet;
    }
    async getWalletBalance(uid, currency) {
        const user = await this.getUserById(uid);
        const wallet = user.wallets.find((w) => w.currency === currency);
        return wallet?.balance ?? 0;
    }
    async setUserActiveStatus(uid, isActive) {
        await firebase_1.db.collection(firebase_1.Collections.USERS).doc(uid).update({
            isActive,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await firebase_1.auth.updateUser(uid, { disabled: !isActive });
        logger.info("User active status updated", { uid, isActive });
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map