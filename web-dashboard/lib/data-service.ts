/**
 * Unified async data-service client.
 *
 * Local dev  — execSync into web-dashboard/scripts/data_service.py
 * Railway    — HTTP POST to the Python FastAPI service at DATA_SERVICE_URL
 *
 * Set DATA_SERVICE_URL in the Next.js Railway service env to the internal
 * URL of the Python Railway service (e.g. http://data-service.railway.internal:8000).
 */

import { execSync } from 'child_process';
import path from 'path';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

export async function callDataService(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const baseUrl = process.env.DATA_SERVICE_URL;

  if (baseUrl) {
    // Production (Railway): HTTP call to the Python FastAPI service
    try {
      const token = process.env.DATA_SERVICE_TOKEN;
      if (!token) {
        console.error('Data service call skipped: DATA_SERVICE_TOKEN is not configured.');
        return null;
      }
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error(`Data service call failed: ${method} returned HTTP ${res.status}.`);
        return null;
      }
      const result = await res.json() as Record<string, unknown>;
      if (result?.error) {
        console.error(`Data service call failed: ${method}: ${String(result.error)}`);
        return null;
      }
      return result;
    } catch (error) {
      console.error(`Data service call failed: ${method}:`, error);
      return null;
    }
  }

  // Local dev: spawn Python script via stdin/stdout
  try {
    const output = execSync('python3 data_service.py', {
      input: JSON.stringify({ method, params }),
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    const result = JSON.parse(output) as Record<string, unknown>;
    return result?.error ? null : result;
  } catch (error) {
    console.error(`Local data service call failed: ${method}:`, error);
    return null;
  }
}
