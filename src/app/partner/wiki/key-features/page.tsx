import { redirect } from "next/navigation";

// The guide is now a single long page; legacy per-section routes point at anchors.
export default function KeyFeaturesRoute() {
  redirect("/partner/wiki#key-features");
}
