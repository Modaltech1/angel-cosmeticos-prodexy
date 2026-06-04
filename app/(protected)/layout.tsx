import { MobileNav } from '@/components/mobile-nav'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <div className="flex-1">
        <MobileNav />
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
