'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Package, LogOut, LayoutDashboard, Users, ShoppingCart, Receipt, DollarSign } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetTrigger, cn } from '@prodexy/ui'
import { supabase } from '@/lib/supabaseClient'

export function MobileNav() {
  const pathname = usePathname()

  const menuItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/products', label: 'Produtos', icon: Package },
    { href: '/customers', label: 'Clientes', icon: Users },
    { href: '/sales', label: 'Vendas', icon: ShoppingCart },
    { href: '/receivables', label: 'Contas a Receber', icon: Receipt },
    { href: '/expenses', label: 'Despesas', icon: DollarSign },
  ]

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Erro ao deslogar do Supabase', error)
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-card px-4">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground overflow-hidden">
                <img src="/icon.jpg" alt="Logo" className="object-cover" />
              </div>
              <span className="text-lg font-semibold">Angel Cosméticos</span>
            </div>
          </div>

          <nav className="flex flex-1 flex-col p-6">
            <ul className="flex flex-1 flex-col gap-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex w-full gap-x-3 rounded-lg p-3 text-sm font-medium leading-6 transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>

            <div className="border-t pt-4">
              <button
                onClick={handleLogout}
                className="flex w-full gap-x-3 rounded-lg p-3 text-sm font-medium leading-6 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                Sair
              </button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground overflow-hidden">
          <img src="/icon.jpg" alt="Logo" className="object-cover" />
        </div>
        <span className="font-semibold">Angel Cosméticos</span>
      </div>
    </div>
  )
}
