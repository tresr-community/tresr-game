// Backend types for the Tresr game satellite
// All field names use snake_case to match the Juno wire format (stored in Datastore).
// TypeScript-internal variables may use camelCase idiomatically, but all
// fields in these interfaces are the exact keys written to / read from Juno.

export interface NotificationItem {
  key: string;
  data: {
    type: string;
    message: string;
    details?: string;
    urgency: "none" | "non-urgent" | "urgent";
    timestamp: number;
    snooze_until?: number;
  };
}

export interface UserProfile {
  user_id: string; // User Principal

  // Identity
  nickname: string;
  login_method?: "iid" | "siwa"; // How user authenticated

  // Game Stats
  stats: {
    high_score: bigint;
    total_games_played: bigint;
    total_games_won: bigint;
    total_games_lost: bigint;
  };

  // Wallet
  wallet: {
    balance: bigint;
    evm_wallet_linked: boolean;
  };

  // Preferences
  preferences: {
    avatar_url?: string;
    theme: string;
    has_read_instructions: boolean;
    narration?: boolean; // Intro voiceover preference (default: true when absent)
    music?: {
      favorite_track?: string;
      playback_mode?: "normal" | "shuffle" | "repeat-one";
      volume?: number;
      sfx_volume?: number;
      is_paused?: boolean;
    };
  };

  // Contact information
  email?: string;

  // Wallet
  evm_wallet?: string;
  wallet_proof?: `0x${string}`;
  verification_signature?: string;
  verification_message?: string;
  withdrawal_address?: string;

  // Notifications
  notifications?: NotificationItem[];

  // Anti-cheat enforcement
  banned_until?: number | null; // Epoch ms timestamp. null = not banned.
  offence_count?: number; // Cumulative cheat attempts. Escalates ban duration.
}

export interface LeaderboardEntry {
  nickname: string;
  avatar_url?: string;
  high_score: number;
  games_won: number;
  active_score: number;
  scored_at?: number;
  expires_at?: number;
  session_id?: string;
}

export interface GlobalStats {
  total_fees: number;
  total_collected: number;
  total_burned: number;
  total_rewarded: number;
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
