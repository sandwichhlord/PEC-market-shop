import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real hash compared against when the email is unknown, so login timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;

export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash("pec-market-dummy-password", ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
}
