import { Results } from "@/components/results";
export default async function ResultsPage({ params }: { params: Promise<{ code: string }> }) {
  return <Results code={(await params).code.toUpperCase()} />;
}
