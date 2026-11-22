import type { Metadata } from "next";
import { Projects } from "@/components/Projects";

export const metadata: Metadata = {
  title: "Projects · M3E Canvas",
  /* a list of what one browser holds: nothing here for a search engine */
  robots: { index: false },
};

export default function Page() {
  return <Projects />;
}
