import { UserModel, PublicUserDto, Currency } from "../../models/user.model";
export interface RegisterUserInput {
    email: string;
    password: string;
    phoneNumber: string;
    fullName: string;
    country: "NG" | "GH";
    cryptoWalletAddress?: string;
}
export declare class AuthService {
    registerUser(input: RegisterUserInput): Promise<UserModel>;
    getUserById(uid: string): Promise<UserModel>;
    getPublicProfile(uid: string): Promise<PublicUserDto>;
    /**
     * Add a crypto wallet address to user profile.
     * Called when user connects MetaMask or any EVM wallet.
     */
    addCryptoWallet(uid: string, address: string, label?: string): Promise<UserModel>;
    /**
     * Set a wallet as the primary receiving wallet.
     */
    setPrimaryWallet(uid: string, address: string): Promise<void>;
    /**
     * Remove a crypto wallet from user profile.
     */
    removeCryptoWallet(uid: string, address: string): Promise<void>;
    /**
     * Get receiver's primary crypto wallet address.
     * Used by orchestrator before sending USDC on-chain.
     */
    getReceiverWalletAddress(uid: string): Promise<string>;
    getWalletBalance(uid: string, currency: Currency): Promise<number>;
    setUserActiveStatus(uid: string, isActive: boolean): Promise<void>;
}
export declare const authService: AuthService;
