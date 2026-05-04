import { loadSamplePortfolio } from "../../../lib/sample-portfolio";

export async function GET() {
  const sampleData = await loadSamplePortfolio();

  return Response.json(sampleData, {
    headers: {
      "Content-Disposition": 'attachment; filename="sample-portfolio.json"'
    }
  });
}
