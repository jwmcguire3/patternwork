import { rename } from "node:fs/promises";

type RenameOperation = (from: string, to: string) => Promise<void>;
type WaitOperation = (milliseconds: number) => Promise<void>;

const RETRY_DELAYS_MS = [15, 30, 60, 120, 240, 250, 250, 250] as const;
const TRANSIENT_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Retry transient Windows file-in-use errors while replacing an atomic file.
 * The rename remains the commit point; callers retain their existing lock and
 * never expose a partially-written destination file.
 */
export async function renameFileWithTransientRetry(
  from: string,
  to: string,
  renameOperation: RenameOperation = rename,
  waitOperation: WaitOperation = wait,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameOperation(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!TRANSIENT_RENAME_CODES.has(code ?? "") || delay === undefined) throw error;
      await waitOperation(delay);
    }
  }
}
