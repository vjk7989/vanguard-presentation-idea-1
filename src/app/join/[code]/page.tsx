import { JoinRoom } from "@/components/join-room";
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  return <JoinRoom code={(await params).code.toUpperCase()} />;
}
