// Backend types for the Tresr game satellite

export interface NotificationItem {
  key: string;
  data: {
    type: string;
    message: string;
    details?: string;
    urgency: "none" | "non-urgent" | "urgent";
    timestamp: number;
    snoozeUntil?: number;
  };
}

export interface UserProfile {
  userId: string; // User Principal

  // Identity
  nickname: string;
  loginMethod?: "iid" | "siwa"; // How user authenticated (Internet Identity or Sign-In with Avalanche)

  // Game Stats
  stats: {
    highScore: bigint;
    totalGamesPlayed: bigint;
    totalGamesWon: bigint;
    totalGamesLost: bigint;
  };

  // Wallet
  wallet: {
    balance: bigint;
    evmWalletLinked: boolean;
  };

  // Preferences
  preferences: {
    avatarUrl?: string;
    theme: string;
    has_read_instructions: boolean;
    narration?: boolean; // Intro voiceover preference (default: true when absent)
    music?: {
      track?: string;
      volume?: number;
      sfxVolume?: number;
      isPaused?: boolean;
    };
  };

  // Contact information
  email?: string;

  // Wallet
  evmWallet?: string;
  walletProof?: `0x${string}`;
  verification_signature?: string;
  verification_message?: string;
  withdrawalAddress?: string;

  // Notifications
  notifications?: NotificationItem[];

  // Anti-cheat enforcement
  banned_until?: number | null; // Epoch ms timestamp. null = not banned.
  offence_count?: number; // Cumulative cheat attempts. Escalates ban duration.
}

export interface GlobalStats {
  totalFees: number;
  totalBurned: number;
  totalRewarded: number;
}

export type EvmRpcResult = {Ok: string} | {Err: string};

export interface BackendActor {
  // User Management
  getCallerUserProfile: () => Promise<UserProfile | null>;
  getUserProfile: (userId: string) => Promise<UserProfile | null>;
  saveCallerUserProfile: (profile: UserProfile) => Promise<void>;
  login: () => Promise<UserProfile>;
  updateWithdrawalAddress: (address: string) => Promise<void>;

  // Game Progress
  saveProgress: (
    score: bigint,
    keysCollected: bigint,
    levelCompleted: boolean
  ) => Promise<void>;

  // Blockchain Integration (EVM RPC)
  payFee: (txHash: string) => Promise<EvmRpcResult>;
  claimReward: (amount: bigint) => Promise<EvmRpcResult>;

  // Admin Functions
  listUsers: () => Promise<UserProfile[]>;
  resetUser: (userId: string) => Promise<void>;
}
