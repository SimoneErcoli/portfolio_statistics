import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import sampleData from "@/data/sample-portfolio.json";

export default function HomePage() {
  return <PortfolioDashboard sampleData={sampleData} />;
}
