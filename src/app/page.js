import { PortfolioDashboard } from "../components/portfolio-dashboard";
import { loadSamplePortfolio } from "../lib/sample-portfolio";

export default async function HomePage() {
  const sampleData = await loadSamplePortfolio();

  return <PortfolioDashboard sampleData={sampleData} />;
}
