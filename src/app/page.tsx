import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function Root() {
  const user = await getCurrentUser();
  redirect(user ? "/projects" : "/login");
}
