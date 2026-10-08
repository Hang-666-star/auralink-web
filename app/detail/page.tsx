import { redirect } from "next/navigation";

export default function LegacyDetailRedirect() {
  redirect("/about");
}
