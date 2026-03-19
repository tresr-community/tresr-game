import {listDocs} from "@junobuild/core";
import type {Doc} from "@junobuild/core";
import {log} from "../utils/log";

const COMPONENT_NAME = "ClaimsStore";

export const claimsStore = $state<{hasUrgentClaims: boolean}>({
  hasUrgentClaims: false,
});

export async function loadClaims(principal: string): Promise<void> {
  try {
    const {items} = await listDocs({
      collection: "claims",
      filter: {owner: principal},
    });

    const now = Date.now();
    const urgentClaims = items.filter((c: Doc<unknown>) => {
      // Urgent means it is ready for chain OR pending (resolving expiry)
      const data = c.data as {
        status?: string;
        claim_type?: string;
        expires_at?: string | number;
      };
      const isPending =
        data.status === "readyforchain" || data.status === "pending";
      const isConsolation = data.claim_type === "consolation";
      const isExpired = data.expires_at
        ? Number(data.expires_at) <= now
        : false;

      return isPending && isConsolation && !isExpired;
    });

    claimsStore.hasUrgentClaims = urgentClaims.length > 0;

    if (claimsStore.hasUrgentClaims) {
      window.dispatchEvent(
        new CustomEvent("tresr:notify", {
          detail: {
            message:
              "⚠️ URGENT: You have a pending consolation prize! Claim it before it expires.",
            type: "warning",
          },
        })
      );
    }
  } catch (err) {
    log.error(COMPONENT_NAME, "Failed to load claims", err);
  }
}

export function clearClaims(): void {
  claimsStore.hasUrgentClaims = false;
}
