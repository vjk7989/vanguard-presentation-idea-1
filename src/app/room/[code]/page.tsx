import { ParticipantRoom } from "@/components/participant-room";
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return <ParticipantRoom code={(await params).code.toUpperCase()} />;
}
