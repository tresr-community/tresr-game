import type {APIRoute} from "astro";
import {log} from "@/lib/utils/log";

export const GET: APIRoute = async () => {
  const version = import.meta.env.PACKAGE_VERSION || "0.0.0";
  const buildId = import.meta.env.BUILD_ID || "unknown";
  log.info("API", `Version: ${version}, Build: ${buildId}`);
  return new Response(
    JSON.stringify({
      version,
      build_id: buildId,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
