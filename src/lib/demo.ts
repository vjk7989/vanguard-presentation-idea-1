export const DEMO_ROOM_CODE = "DEMO01";
export const DEMO_PUBLIC_ORIGIN = "https://vanguard-presentation-idea-1.vercel.app";

export function joinUrlForRoom(code: string, fallbackOrigin: string) {
  const origin = code.toUpperCase() === DEMO_ROOM_CODE ? DEMO_PUBLIC_ORIGIN : fallbackOrigin;
  return new URL(`/join/${encodeURIComponent(code.toUpperCase())}`, origin).toString();
}
