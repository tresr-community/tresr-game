/**
 * error-reporter.ts
 *
 * Calls the satellite's `report_error` update function via the Juno-generated
 * typed bindings in src/declarations/satellite/satellite.api.ts.
 *
 * Returns the `error_id` (format: "err_{nanoseconds}", e.g. "err_1772598984825320076")
 * which is ALSO the Juno document key. Show it to the user so they can give it
 * to support; devs filter by it in the admin key-matcher.
 * Never throws — error reporting must never disrupt the caller.
 */
import {reportError as satelliteReportError} from "@/declarations/satellite/satellite.api";

/**
 * Reports an error to the satellite and returns the error_id (= doc key) or null.
 * Fire-and-forget friendly — catches any failure internally.
 */
export async function reportError(
  component: string,
  message: string,
  rawError: string
): Promise<string | null> {
  try {
    const result = await satelliteReportError({
      component: component.slice(0, 100),
      message: message.slice(0, 500),
      raw_error: rawError.slice(0, 2000),
    });

    if ("Ok" in result) {
      return result.Ok;
    }
    return null;
  } catch {
    // Best-effort: error reporting must never disrupt the caller.
    return null;
  }
}
