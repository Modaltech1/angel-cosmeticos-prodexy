// components/sales-view.tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@prodexy/ui'
import { Button } from '@prodexy/ui'
import { Input } from '@prodexy/ui'
import { Plus, Search, MoreVertical, ChevronLeft, ChevronRight, Filter, Printer } from 'lucide-react'
import { SaleDialog } from '@/components/sale-dialog'
import { Badge } from '@prodexy/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@prodexy/ui'
import { SaleDetailsDialog } from '@/components/sale-details-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@prodexy/ui'
import { supabase } from '@/lib/supabaseClient'
import { loadSaleReceipt } from '@/lib/load-sale-receipt'
import { printThermalReceipt } from '@/lib/thermal-receipt'

interface Sale {
  id: string
  date: string
  customer: string
  productsSummary: string
  totalValue: number
  paymentType: 'cash' | 'credit'
  installments?: number
  paidAmount: number
  status: 'paid' | 'pending' | 'partial' | 'canceled'
}

export default function Page() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPayment, setFilterPayment] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null)

  const loadSales = async () => {
    setLoading(true)
    setError(null)

    try {
      const [salesRes, customersRes, saleItemsRes, productsRes, receivablesRes, paymentsRes] =
        await Promise.all([
          supabase
            .from('sales')
            .select('id, sale_date, total_amount, customer_id, status')
            .order('sale_date', { ascending: false }),
          supabase.from('customers').select('id, name'),
          supabase.from('sale_items').select('sale_id, product_id, quantity, subtotal'),
          supabase.from('products').select('id, name'),
          supabase.from('receivables').select('sale_id, amount'),
          supabase.from('payments').select('sale_id, amount'),
        ])

      if (salesRes.error) throw salesRes.error
      if (customersRes.error) throw customersRes.error
      if (saleItemsRes.error) throw saleItemsRes.error
      if (productsRes.error) throw productsRes.error
      if (receivablesRes.error) throw receivablesRes.error
      if (paymentsRes.error) throw paymentsRes.error

      const salesData = (salesRes.data ?? []) as {
        id: string
        sale_date: string
        total_amount: number | string | null
        customer_id: string | null
        status: string | null
      }[]

      const customers = (customersRes.data ?? []) as { id: string; name: string }[]
      const saleItems = (saleItemsRes.data ?? []) as {
        sale_id: string
        product_id: string
        quantity: number
        subtotal: number | string
      }[]
      const products = (productsRes.data ?? []) as { id: string; name: string }[]
      const receivables = (receivablesRes.data ?? []) as {
        sale_id: string
        amount: number | string
      }[]
      const payments = (paymentsRes.data ?? []) as {
        sale_id: string
        amount: number | string
      }[]

      const customerMap = customers.reduce<Record<string, string>>((acc, c) => {
        acc[c.id] = c.name
        return acc
      }, {})

      const productMap = products.reduce<Record<string, string>>((acc, p) => {
        acc[p.id] = p.name
        return acc
      }, {})

      const saleItemsBySale: Record<
        string,
        { product_id: string; quantity: number; subtotal: number }[]
      > = {}
      for (const it of saleItems) {
        if (!saleItemsBySale[it.sale_id]) saleItemsBySale[it.sale_id] = []
        saleItemsBySale[it.sale_id].push({
          product_id: it.product_id,
          quantity: it.quantity,
          subtotal: Number(it.subtotal ?? 0),
        })
      }

      const receivablesBySale: Record<string, { amount: number }[]> = {}
      for (const r of receivables) {
        if (!receivablesBySale[r.sale_id]) receivablesBySale[r.sale_id] = []
        receivablesBySale[r.sale_id].push({ amount: Number(r.amount ?? 0) })
      }

      const paymentsBySale: Record<string, number> = {}
      for (const p of payments) {
        paymentsBySale[p.sale_id] =
          (paymentsBySale[p.sale_id] ?? 0) + Number(p.amount ?? 0)
      }

      const saleList: Sale[] = salesData.map((s) => {
        const totalValue = Number(s.total_amount ?? 0)
        const items = saleItemsBySale[s.id] ?? []

        const productsSummary =
          items.length === 0
            ? 'Sem itens cadastrados'
            : items
              .map((it) => {
                const name = productMap[it.product_id] ?? 'Produto'
                return `${name} (${it.quantity}x)`
              })
              .join(', ')

        const saleReceivables = receivablesBySale[s.id] ?? []
        const paidAmount = paymentsBySale[s.id] ?? 0
        const totalReceivable =
          saleReceivables.length > 0
            ? saleReceivables.reduce((sum, r) => sum + r.amount, 0)
            : totalValue

        const outstanding = totalReceivable - paidAmount
        const dbStatus = s.status ?? 'open'

        let status: Sale['status']
        if (dbStatus === 'canceled') status = 'canceled'
        else if (outstanding <= 0) status = 'paid'
        else if (paidAmount > 0) status = 'partial'
        else status = 'pending'

        const paymentType: Sale['paymentType'] =
          saleReceivables.length > 0 ? 'credit' : 'cash'
        const installments =
          saleReceivables.length > 0 ? saleReceivables.length : undefined

        return {
          id: s.id,
          date: new Date(s.sale_date).toLocaleDateString('pt-BR'),
          customer:
            (s.customer_id && customerMap[s.customer_id]) ||
            'Cliente não identificado',
          productsSummary,
          totalValue,
          paymentType,
          installments,
          paidAmount,
          status,
        }
      })

      setSales(saleList)
    } catch (err: any) {
      console.error('Erro ao carregar vendas', err)
      setError('Erro ao carregar vendas. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSales()
  }, [])

  let filteredSales = sales.filter(
    (s) =>
      s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.productsSummary.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (filterStatus !== 'all') {
    filteredSales = filteredSales.filter((s) => s.status === filterStatus)
  }
  if (filterPayment !== 'all') {
    filteredSales = filteredSales.filter((s) => s.paymentType === filterPayment)
  }

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage) || 1
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedSales = filteredSales.slice(startIndex, endIndex)

  const getStatusBadge = (status: Sale['status']) => {
    const variants = {
      paid: {
        label: 'Pago',
        variant: 'default' as const,
        className: 'bg-emerald-500 hover:bg-emerald-600',
      },
      pending: {
        label: 'Pendente',
        variant: 'secondary' as const,
        className: 'bg-amber-500 hover:bg-amber-600 text-white',
      },
      partial: {
        label: 'Parcial',
        variant: 'outline' as const,
        className: 'border-amber-500 text-amber-700',
      },
      canceled: {
        label: 'Cancelado',
        variant: 'outline' as const,
        className: 'border-destructive text-destructive',
      },
    }
    const config = variants[status]
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale)
    setIsDetailsOpen(true)
  }

  const handlePrintSale = async (sale: Sale) => {
    setPrintingSaleId(sale.id)
    setError(null)

    try {
      const receipt = await loadSaleReceipt(sale.id, sale.customer)
      if (!printThermalReceipt(receipt)) {
        setError(
          'Não foi possível abrir a impressão. Verifique as permissões do navegador.',
        )
      }
    } catch (err) {
      console.error('Erro ao preparar cupom', err)
      setError('Erro ao preparar o cupom. Tente novamente.')
    } finally {
      setPrintingSaleId(null)
    }
  }

  const handleCancelSale = async (sale: Sale) => {
    try {
      const { error } = await supabase.rpc('cancel_sale', { p_sale_id: sale.id, })

      if (error) {
        console.error('Erro ao cancelar venda', error)
        setError('Erro ao cancelar venda. Tente novamente.')
        return
      }

      // recarrega a lista de vendas
      await loadSales()
    } catch (err: any) {
      console.error('Erro ao cancelar venda', err)
      setError('Erro ao cancelar venda. Tente novamente.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">
            Registre e acompanhe suas vendas
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Venda
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente ou produto..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterPayment}
                onValueChange={(value) => {
                  setFilterPayment(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as formas</SelectItem>
                  <SelectItem value="cash">À vista</SelectItem>
                  <SelectItem value="credit">Parcelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                  <th className="pb-3">Data</th>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3 text-right pr-4">Valor Total</th>
                  <th className="pb-3 pl-4">Status</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.map((sale) => (
                  <tr key={sale.id} className="border-b last:border-0">
                    <td className="py-4">{sale.date}</td>
                    <td className="py-4 font-medium">{sale.customer}</td>
                    <td className="py-4 text-right font-medium pr-4">
                      R$ {sale.totalValue.toFixed(2)}
                    </td>
                    <td className="py-4 pl-4">
                      {getStatusBadge(sale.status)}
                    </td>
                    <td className="py-4">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handlePrintSale(sale)}
                              disabled={printingSaleId === sale.id}
                            >
                              <Printer className="mr-2 h-4 w-4" />
                              {printingSaleId === sale.id
                                ? 'Preparando cupom...'
                                : 'Imprimir cupom'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewDetails(sale)}>
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCancelSale(sale)}
                              disabled={sale.status === 'canceled'}
                            >
                              Cancelar venda
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && paginatedSales.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma venda encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <p className="mt-3 text-sm text-muted-foreground">
              Carregando vendas...
            </p>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {startIndex + 1} a{' '}
                {Math.min(endIndex, filteredSales.length)} de{' '}
                {filteredSales.length} vendas
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page
                    if (totalPages <= 5) {
                      page = i + 1
                    } else if (currentPage <= 3) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i
                    } else {
                      page = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-8 h-8 p-0"
                      >
                        {page}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSaleCreated={loadSales}
      />
      <SaleDetailsDialog
        sale={selectedSale}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
    </div>
  )
}
