import { useEffect, useState } from 'react';
import { OfflineBanner } from './components/ui';
import { getRole, setRole, type Role } from './lib/db';
import { go, match, usePath } from './lib/router';
import { engine, syncConfigured } from './lib/sync';
import { AccountPage } from './pages/AccountPage';
import { BackupPage } from './pages/BackupPage';
import { CreatePage } from './pages/CreatePage';
import { DicePage } from './pages/DicePage';
import { GmCharacterPage, GmHome, GmTablePage } from './pages/GmPages';
import { HomePage, RolePage } from './pages/HomePage';
import { RulesPage } from './pages/RulesPage';
import { SheetPage } from './pages/SheetPage';

export function App() {
  const [role, setRoleState] = useState<Role | null>(getRole());
  const path = usePath();

  useEffect(() => {
    if (!syncConfigured) return;
    engine.start();
    return () => engine.stop();
  }, []);

  const choose = (r: Role) => {
    setRoleState(r);
    go('/', true);
  };
  const switchRole = () => {
    setRole(null);
    setRoleState(null);
    go('/', true);
  };

  useEffect(() => {
    window.addEventListener('app-switch-role', switchRole);
    return () => window.removeEventListener('app-switch-role', switchRole);
  });

  let page: React.ReactNode;
  let m: Record<string, string> | null;
  if (match(path, '/account')) page = <AccountPage />;
  else if (!role) page = <RolePage onChoose={choose} />;
  else if (match(path, '/dice')) page = <DicePage />;
  else if (match(path, '/rules')) page = <RulesPage />;
  else if (match(path, '/backup')) page = <BackupPage />;
  else if ((m = match(path, '/create/:id'))) page = <CreatePage key={m.id} id={m.id} />;
  else if ((m = match(path, '/sheet/:id'))) page = <SheetPage key={m.id} id={m.id} />;
  else if ((m = match(path, '/gm/:tableId/:charId'))) page = <GmCharacterPage tableId={m.tableId} charId={m.charId} />;
  else if ((m = match(path, '/gm/:tableId'))) page = <GmTablePage tableId={m.tableId} />;
  else page = role === 'gm' ? <GmHome onSwitchRole={switchRole} /> : <HomePage onSwitchRole={switchRole} />;

  return (
    <>
      <OfflineBanner />
      {page}
    </>
  );
}
