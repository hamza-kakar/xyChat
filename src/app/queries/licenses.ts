/**
 * Loads the license list generated at build time (`public/licenses.json`,
 *  About). It is an app asset fetched from the app's own
 * origin and precached for offline use; it is validated on read.
 */
import * as v from 'valibot';

const LicensesSchema = v.array(
  v.object({
    name: v.string(),
    version: v.string(),
    license: v.string(),
    text: v.nullable(v.string()),
  }),
);

/** One bundled package and its license. */
export type LicenseInfo = v.InferOutput<typeof LicensesSchema>[number];

/**
 * Fetches and validates the license list.
 *
 * @param fetcher Same-origin fetch (injectable for tests).
 * @returns The entries; throws when the file is missing or invalid.
 */
export async function loadLicenses(fetcher: typeof fetch = fetch): Promise<readonly LicenseInfo[]> {
  const response = await fetcher(`${import.meta.env.BASE_URL}licenses.json`);
  if (!response.ok) {
    throw new Error(`licenses.json: HTTP ${String(response.status)}`);
  }
  return v.parse(LicensesSchema, await response.json());
}
