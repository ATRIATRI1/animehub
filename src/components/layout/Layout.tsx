import { Outlet } from 'react-router-dom';
import { Sidebar, BottomNav } from './Nav';
import { Topbar } from './Topbar';

export function Layout() {
  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
