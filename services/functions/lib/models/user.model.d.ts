import type { Timestamp } from "firebase-admin/firestore";
export type Currency = "NGN" | "GHS" | "USDC";
export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
export type UserRole = "SENDER" | "RECEIVER" | "BOTH";
export interface UserWallet {
    currency: Currency;
    balance: number;
    lockedBalance: number;
    address?: string;
}
export interface KycData {
    status: KycStatus;
    documentType?: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";
    documentNumber?: string;
    verifiedAt?: Timestamp;
    rejectionReason?: string;
}
export interface CryptoWallet {
    address: string;
    chain: "base" | "base-sepolia";
    isVerified: boolean;
    addedAt: Timestamp;
    label?: string;
}
export interface UserModel {
    id: string;
    email: string;
    phoneNumber: string;
    fullName: string;
    country: "NG" | "GH";
    currency: Currency;
    role: UserRole;
    wallets: UserWallet[];
    cryptoWallets: CryptoWallet[];
    primaryCryptoWallet?: string;
    kyc: KycData;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastLoginAt?: Timestamp;
    metadata?: Record<string, unknown>;
}
export interface CreateUserDto {
    email: string;
    phoneNumber: string;
    fullName: string;
    country: "NG" | "GH";
    currency: Currency;
    role: UserRole;
    wallets: UserWallet[];
    cryptoWallets: CryptoWallet[];
    kyc: KycData;
    isActive: boolean;
}
export interface PublicUserDto {
    id: string;
    fullName: string;
    country: "NG" | "GH";
    currency: Currency;
    isActive: boolean;
    primaryCryptoWallet?: string;
}
