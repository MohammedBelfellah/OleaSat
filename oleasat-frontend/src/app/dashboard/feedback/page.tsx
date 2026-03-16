import { redirect } from "next/navigation";

export default function FeedbackRedirectPage() {
  redirect("/dashboard?view=feedback");
}
