import { AppError } from "../../common/errors.js";

// Order checkout configuration is NOT a wallet integration. Neither a
// credential nor an environment flag can turn these scaffold writes into
// tokenization or a credited top-up. Enable only with the real provider flow.
export const CLIENT_WALLET_CAPABILITIES = Object.freeze({
  cardBinding: false,
  topUp: false
});

export function requireClientWalletIntegration(feature) {
  throw new AppError("Wallet payment integration is not available", 503,
    "CLIENT_WALLET_NOT_READY", { feature, reason: "PAYMENT_INTEGRATION_REQUIRED" });
}

export const walletIntegrationGate = feature => (_req, _res, next) => {
  try { requireClientWalletIntegration(feature); }
  catch (error) { next(error); }
};
