import { v4 as uuidv4 } from "uuid";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth, Collections } from "../../config/firebase";
import { createContextLogger } from "../../utils/logger";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AppError,
} from "../../utils/errors";
import {
  UserModel,
  PublicUserDto,
  Currency,
  UserWallet,
  CryptoWallet,
} from "../../models/user.model";

const logger = createContextLogger({ service: "AuthService" });

function buildInitialWallets(country: "NG" | "GH"): UserWallet[] {
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

function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export interface RegisterUserInput {
  email: string;
  password: string;
  phoneNumber: string;
  fullName: string;
  country: "NG" | "GH";
  cryptoWalletAddress?: string; // Optional at registration
}

export class AuthService {
  async registerUser(input: RegisterUserInput): Promise<UserModel> {
    const { email, password, phoneNumber, fullName, country, cryptoWalletAddress } = input;

    logger.info("Registering new user", { email, country });

    if (!phoneNumber.startsWith("+")) {
      throw new ValidationError("Phone number must be in E.164 format e.g. +2348012345678");
    }

    if (cryptoWalletAddress && !isValidEvmAddress(cryptoWalletAddress)) {
      throw new ValidationError("Invalid crypto wallet address format");
    }

    const existing = await db
      .collection(Collections.USERS)
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new ConflictError("User with this email already exists");
    }

    let firebaseUid: string;

    try {
      const userRecord = await auth.createUser({
        email,
        password,
        phoneNumber,
        displayName: fullName,
      });
      firebaseUid = userRecord.uid;
      logger.info("Firebase Auth user created", { uid: firebaseUid });
    } catch (error: unknown) {
      const fbError = error as { code?: string; message?: string };
      logger.error("Firebase Auth createUser failed", {
        code: fbError.code,
        message: fbError.message,
      });
      if (fbError.code === "auth/email-already-exists") {
        throw new ConflictError("Email already registered");
      }
      if (fbError.code === "auth/phone-number-already-exists") {
        throw new ConflictError("Phone number already registered");
      }
      throw error;
    }

    const primaryCurrency: Currency = country === "NG" ? "NGN" : "GHS";
    const now = FieldValue.serverTimestamp();

    // Build initial crypto wallets array
    const cryptoWallets: CryptoWallet[] = cryptoWalletAddress
      ? [{
          address: cryptoWalletAddress,
          chain: "base-sepolia",
          isVerified: false,
          addedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
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
      metadata: { registrationId: uuidv4() },
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(Collections.USERS).doc(firebaseUid).set(userData);

    logger.info("User registered successfully", { uid: firebaseUid, country });

    const created = await db.collection(Collections.USERS).doc(firebaseUid).get();
    return created.data() as UserModel;
  }

  async getUserById(uid: string): Promise<UserModel> {
    const doc = await db.collection(Collections.USERS).doc(uid).get();
    if (!doc.exists) throw new NotFoundError("User");
    return doc.data() as UserModel;
  }

  async getPublicProfile(uid: string): Promise<PublicUserDto> {
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
  async addCryptoWallet(
    uid: string,
    address: string,
    label?: string
  ): Promise<UserModel> {
    if (!isValidEvmAddress(address)) {
      throw new ValidationError("Invalid EVM wallet address");
    }

    const user = await this.getUserById(uid);

    // Check for duplicate
    const exists = user.cryptoWallets.some(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    );
    if (exists) {
      throw new ConflictError("Wallet address already added");
    }

    const newWallet: CryptoWallet = {
      address,
      chain: "base-sepolia",
      isVerified: false,
      addedAt: new Date() as unknown as FirebaseFirestore.Timestamp,
      label: label ?? "Wallet",
    };

    const updatedWallets = [...user.cryptoWallets, newWallet];
    const isPrimary = user.cryptoWallets.length === 0;

    await db.collection(Collections.USERS).doc(uid).update({
      cryptoWallets: updatedWallets,
      ...(isPrimary ? { primaryCryptoWallet: address } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Crypto wallet added", { uid, address, isPrimary });

    const updated = await db.collection(Collections.USERS).doc(uid).get();
    return updated.data() as UserModel;
  }

  /**
   * Set a wallet as the primary receiving wallet.
   */
  async setPrimaryWallet(uid: string, address: string): Promise<void> {
    const user = await this.getUserById(uid);

    const walletExists = user.cryptoWallets.some(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    );

    if (!walletExists) {
      throw new NotFoundError("Wallet address not found on this account");
    }

    await db.collection(Collections.USERS).doc(uid).update({
      primaryCryptoWallet: address,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Primary wallet updated", { uid, address });
  }

  /**
   * Remove a crypto wallet from user profile.
   */
  async removeCryptoWallet(uid: string, address: string): Promise<void> {
    const user = await this.getUserById(uid);

    const updatedWallets = user.cryptoWallets.filter(
      (w) => w.address.toLowerCase() !== address.toLowerCase()
    );

    if (updatedWallets.length === user.cryptoWallets.length) {
      throw new NotFoundError("Wallet address not found");
    }

    // If removing primary wallet, set next one as primary
    let newPrimary = user.primaryCryptoWallet;
    if (user.primaryCryptoWallet?.toLowerCase() === address.toLowerCase()) {
      newPrimary = updatedWallets[0]?.address ?? null;
    }

    await db.collection(Collections.USERS).doc(uid).update({
      cryptoWallets: updatedWallets,
      primaryCryptoWallet: newPrimary,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Crypto wallet removed", { uid, address });
  }

  /**
   * Get receiver's primary crypto wallet address.
   * Used by orchestrator before sending USDC on-chain.
   */
  async getReceiverWalletAddress(uid: string): Promise<string> {
    const user = await this.getUserById(uid);

    if (!user.primaryCryptoWallet) {
      throw new AppError(
        "Receiver has no crypto wallet address configured. " +
        "They must add a wallet before receiving payments.",
        "NO_CRYPTO_WALLET",
        422
      );
    }

    return user.primaryCryptoWallet;
  }

  async getWalletBalance(uid: string, currency: Currency): Promise<number> {
    const user = await this.getUserById(uid);
    const wallet = user.wallets.find((w) => w.currency === currency);
    return wallet?.balance ?? 0;
  }

  async setUserActiveStatus(uid: string, isActive: boolean): Promise<void> {
    await db.collection(Collections.USERS).doc(uid).update({
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await auth.updateUser(uid, { disabled: !isActive });
    logger.info("User active status updated", { uid, isActive });
  }
}

export const authService = new AuthService();
