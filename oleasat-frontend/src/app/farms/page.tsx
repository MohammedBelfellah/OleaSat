import { redirect } from "next/navigation";

export default function FarmsRedirectPage() {
  redirect("/dashboard?view=farms");
}
