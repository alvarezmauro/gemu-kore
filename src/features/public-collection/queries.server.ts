import "server-only";
import { connection } from "next/server";
import * as service from "@/server/services/public-collection";
// Exclude these reads from prerendering without consulting a session. HTTP
// adapters in 18.3–18.5 additionally apply no-store to every response/error.
export async function getPublicHome() {
  await connection();
  return service.getPublicHome();
}
export async function getPublicCollection(input: unknown = {}) {
  await connection();
  return service.getPublicCollection(input);
}
export async function getPublicConsole(input: unknown) {
  await connection();
  return service.getPublicConsole(input);
}
export async function getPublicGame(input: unknown) {
  await connection();
  return service.getPublicGame(input);
}
export async function getPublicAccessory(input: unknown) {
  await connection();
  return service.getPublicAccessory(input);
}
