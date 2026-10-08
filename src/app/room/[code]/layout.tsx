import type { ReactNode } from "react";
import { ParticipantRoom } from "@/components/participant-room";

export default async function RoomLayout({ children, params }: { children: ReactNode; params: Promise<{ code: string }> }) {
  return <ParticipantRoom code={(await params).code.toUpperCase()}>{children}</ParticipantRoom>;
}
