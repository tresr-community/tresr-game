declare global {
  interface Window {
    setTheme: (theme: string) => void;
    openProfileModal?: () => void;
    openHowToPlayModal?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gameBlockchainConfig?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any; // MetaMask or other injected provider
  }
}

export {};
