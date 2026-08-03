import Jarvis from "./jarvis";
import LoginGate from "./login-gate";
import { headers } from "next/headers";
import { isAuthorizedCookie } from "../lib/jarvis-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const authorized = await isAuthorizedCookie(requestHeaders.get("cookie")).catch(() => false);
  const localAgentPreview = process.env.NODE_ENV === "development";
  return authorized || localAgentPreview ? <Jarvis /> : <LoginGate />;
}
