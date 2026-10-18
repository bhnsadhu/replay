import { roomCodeFromPath, usePath } from './router';
import { Home } from './screens/Home';
import { SoloApp } from './screens/solo/SoloApp';
import { PhoneRoomApp, TvRoomApp } from './screens/room/RoomApps';
import { PublicApp } from './screens/public/PublicApp';

// Both room routes share a key: when a phone creates a room the URL changes /new → /CODE,
// and the same screen must stay mounted or the phone would leave its own room.
export function App() {
  const path = usePath();
  const code = roomCodeFromPath(path);

  if (path === '/solo') return <SoloApp />;
  if (path === '/play') return <PublicApp />;
  if (path === '/host') return <TvRoomApp />;
  if (path === '/new') return <PhoneRoomApp key="room" mode="create" />;
  if (code) return <PhoneRoomApp key="room" mode="join" code={code} />;
  return <Home />;
}
