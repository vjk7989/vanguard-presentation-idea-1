import { PresenterDashboard } from "@/components/presenter-dashboard";
export default async function PresenterPage({ params }: { params: Promise<{ code: string }> }) {
  return <PresenterDashboard code={(await params).code.toUpperCase()} />;
}
