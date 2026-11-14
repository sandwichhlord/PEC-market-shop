import { LocalStorageProvider } from "./local";
import type { StorageProvider } from "./types";

let provider: StorageProvider | undefined;

/** The configured storage provider (local disk under UPLOAD_DIR). */
export function getStorage(): StorageProvider {
  provider ??= new LocalStorageProvider(process.env.UPLOAD_DIR ?? "./uploads");
  return provider;
}
