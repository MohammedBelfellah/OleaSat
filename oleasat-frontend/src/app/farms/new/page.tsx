import { redirect } from "next/navigation";

export default function NewFarmRedirectPage() {
  redirect("/dashboard?view=farms&addFarm=1");
}
