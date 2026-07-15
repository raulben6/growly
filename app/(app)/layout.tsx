import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/growly/sidebar'
import { Topbar } from '@/components/growly/topbar'
import { getUnreadCountForUser } from '@/lib/notifications'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const unread = await getUnreadCountForUser(session.user.id)
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6">
        <Topbar userName={session.user.name?.split(' ')[0] ?? 'usuario'} unread={unread} />
        {children}
      </main>
    </div>
  )
}
