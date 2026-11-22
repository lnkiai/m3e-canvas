import type { Metadata } from "next";
import { Projects } from "@/components/Projects";

export const metadata: Metadata = {
  title: "MCP · M3E Canvas",
  description: "Use M3E Canvas with an AI agent over MCP: it designs Material 3 Expressive screens and hands back the link that opens them.",
};

/* The guide is a sheet over the projects list; this address opens the list with the sheet up,
   so a link to it from outside still lands on the guide. */
export default function Page() {
  return <Projects mcp />;
}
