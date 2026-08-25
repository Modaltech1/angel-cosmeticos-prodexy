import { supabase } from '@/lib/supabaseClient'
import type { ThermalReceiptData } from '@/lib/thermal-receipt'

export async function loadSaleReceipt(
  saleId: string,
  fallbackCustomerName?: string,
): Promise<ThermalReceiptData> {
  const { data: saleRow, error: saleError } = await supabase
    .from('sales')
    .select('id, sale_date, total_amount, discount, fee, customer_id, status')
    .eq('id', saleId)
    .single()

  if (saleError || !saleRow) {
    throw saleError || new Error('Venda não encontrada.')
  }

  const [itemsRes, receivablesRes, customerRes] = await Promise.all([
    supabase
      .from('sale_items')
      .select('quantity, unit_price, subtotal, products(name)')
      .eq('sale_id', saleId),
    supabase
      .from('receivables')
      .select('installment_number, amount, due_date')
      .eq('sale_id', saleId)
      .order('installment_number', { ascending: true }),
    saleRow.customer_id
      ? supabase
          .from('customers')
          .select('name')
          .eq('id', saleRow.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (itemsRes.error) throw itemsRes.error
  if (receivablesRes.error) throw receivablesRes.error
  if (customerRes.error) throw customerRes.error

  const items = ((itemsRes.data ?? []) as any[]).map((item) => ({
    name: Array.isArray(item.products)
      ? item.products[0]?.name ?? 'Produto'
      : item.products?.name ?? 'Produto',
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unit_price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
  }))

  const installments = ((receivablesRes.data ?? []) as any[]).map(
    (installment) => ({
      number: Number(installment.installment_number ?? 0),
      value: Number(installment.amount ?? 0),
      dueDate: String(installment.due_date ?? ''),
    }),
  )

  const total = Number(saleRow.total_amount ?? 0)
  const discount = Number(saleRow.discount ?? 0)
  const fee = Number(saleRow.fee ?? 0)
  const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)

  return {
    saleId: String(saleRow.id),
    issuedAt: String(saleRow.sale_date),
    customerName:
      (customerRes.data as { name?: string } | null)?.name ||
      fallbackCustomerName ||
      'Não identificado',
    items,
    subtotal: items.length > 0 ? itemsSubtotal : total - fee + discount,
    discount,
    fee,
    total,
    paymentLabel:
      installments.length > 0
        ? `Parcelado em ${installments.length}x`
        : 'À vista',
    installments,
    canceled: saleRow.status === 'canceled',
  }
}
