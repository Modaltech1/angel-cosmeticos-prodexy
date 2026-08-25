// components/sales-dialog.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@prodexy/ui'
import { Button } from '@prodexy/ui'
import { Input } from '@prodexy/ui'
import { Label } from '@prodexy/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@prodexy/ui'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@prodexy/ui'
import { Popover, PopoverContent, PopoverTrigger } from '@prodexy/ui'
import { Check, ChevronsUpDown, Printer, Share2, X } from 'lucide-react'
import { cn } from '@prodexy/ui'
import { supabase } from '@/lib/supabaseClient'
import {
  printThermalReceipt,
  type ThermalReceiptData,
} from '@/lib/thermal-receipt'

interface SaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaleCreated?: () => void
}

interface Installment {
  number: number
  value: number
  dueDate: string
}

interface ProductItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
  subtotal: number
}

interface DbCustomer {
  id: string
  name: string
  phone: string | null
}

interface DbProduct {
  id: string
  name: string
  barcode: string | null
  sale_price: number
  purchase_price: number
  stock_quantity: number
}

export function SaleDialog({ open, onOpenChange, onSaleCreated }: SaleDialogProps) {
  const [openCustomer, setOpenCustomer] = useState(false)
  const [openProduct, setOpenProduct] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saleData, setSaleData] = useState<ThermalReceiptData | null>(null)
  const [printWarning, setPrintWarning] = useState<string | null>(null)

  const [customers, setCustomers] = useState<DbCustomer[]>([])
  const [availableProducts, setAvailableProducts] = useState<DbProduct[]>([])

  const [loadingBase, setLoadingBase] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    customer: '',
    customerName: '',
    paymentType: 'cash',
    installments: '1',
    discount: '0',
    fee: '0',
  })

  const [products, setProducts] = useState<ProductItem[]>([])
  const [currentProduct, setCurrentProduct] = useState({
    id: '',
    name: '',
    quantity: '1',
    unitPrice: '',
  })

  const [barcodeValue, setBarcodeValue] = useState('')
  const barcodeRef = useRef<HTMLInputElement | null>(null)
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [installmentDates, setInstallmentDates] = useState<Installment[]>([])

  // valores calculados em tempo real
  const subtotalValue = products.reduce((sum, p) => sum + p.subtotal, 0)
  const feeValue = subtotalValue * (Number(formData.fee) / 100)
  const discountValue = subtotalValue * (Number(formData.discount) / 100)
  const totalValue = subtotalValue + feeValue - discountValue

  // carrega clientes e produtos ao abrir o diálogo
  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadBaseData() {
      setLoadingBase(true)
      setError(null)
      try {
        const [customersRes, productsRes] = await Promise.all([
          supabase.from('customers').select('id, name, phone'),
          supabase
            .from('products')
            .select('id, name, barcode, sale_price, purchase_price, stock_quantity')
            .eq('is_active', true),
        ])

        if (customersRes.error) throw customersRes.error
        if (productsRes.error) throw productsRes.error

        if (cancelled) return

        setCustomers((customersRes.data ?? []) as DbCustomer[])
        setAvailableProducts((productsRes.data ?? []) as DbProduct[])
      } catch (err: any) {
        console.error('Erro ao carregar clientes/produtos', err)
        if (!cancelled)
          setError('Erro ao carregar clientes ou produtos. Tente novamente.')
      } finally {
        if (!cancelled) setLoadingBase(false)
      }
    }

    loadBaseData()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || showSuccess) return

    setBarcodeValue('')

    const t = setTimeout(() => {
      barcodeRef.current?.focus()
    }, 50)

    return () => clearTimeout(t)
  }, [open, showSuccess])

  const addOneUnitByBarcode = (codeRaw: string) => {
    const code = codeRaw.trim()
    if (!code) return
    if (loadingBase) return

    const baseProduct = availableProducts.find((p) => p.barcode === code)

    // se não achou, só limpa pra você poder escanear o próximo
    if (!baseProduct) {
      setError('Código de barras não encontrado.')
      setBarcodeValue('')
      barcodeRef.current?.focus()
      return
    }

    setProducts((prev) => {
      const idx = prev.findIndex((it) => it.id === baseProduct.id)

      // já está na lista -> soma +1 mantendo o preço atual daquele item
      if (idx >= 0) {
        const current = prev[idx]
        const nextQty = current.quantity + 1

        if (nextQty > baseProduct.stock_quantity) {
          alert(
            `Estoque insuficiente. Estoque atual: ${baseProduct.stock_quantity} unidade(s).`,
          )
          return prev
        }

        const next = [...prev]
        next[idx] = {
          ...current,
          quantity: nextQty,
          subtotal: nextQty * current.unitPrice,
        }
        return next
      }

      // não está na lista -> adiciona 1 unidade
      if (baseProduct.stock_quantity < 1) {
        alert(
          `Estoque insuficiente. Estoque atual: ${baseProduct.stock_quantity} unidade(s).`,
        )
        return prev
      }

      const unitPrice = Number(baseProduct.sale_price)
      const unitCost = Number(baseProduct.purchase_price) || 0

      const newItem: ProductItem = {
        id: baseProduct.id,
        name: baseProduct.name,
        quantity: 1,
        unitPrice,
        unitCost,
        subtotal: unitPrice,
      }

      return [...prev, newItem]
    })

    setError(null)
    setBarcodeValue('')
    barcodeRef.current?.focus()
  }

  const handleAddProduct = () => {
    setError(null)

    if (!currentProduct.id || !currentProduct.quantity) {
      alert('Selecione um produto e informe a quantidade.')
      return
    }

    const baseProduct = availableProducts.find((p) => p.id === currentProduct.id)
    if (!baseProduct) {
      alert('Produto inválido.')
      return
    }

    const quantity = Number(currentProduct.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert('Quantidade inválida.')
      return
    }

    if (quantity > baseProduct.stock_quantity) {
      alert(
        `Estoque insuficiente. Estoque atual: ${baseProduct.stock_quantity} unidade(s).`,
      )
      return
    }

    const unitPrice = currentProduct.unitPrice
      ? Number(currentProduct.unitPrice)
      : Number(baseProduct.sale_price)

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      alert('Preço inválido.')
      return
    }

    const unitCost = Number(baseProduct.purchase_price) || 0
    const subtotal = quantity * unitPrice

    const newProduct: ProductItem = {
      id: baseProduct.id,
      name: baseProduct.name,
      quantity,
      unitPrice,
      unitCost,
      subtotal,
    }

    setProducts((prev) => [...prev, newProduct])
    setCurrentProduct({ id: '', name: '', quantity: '1', unitPrice: '' })
  }

  const handleRemoveProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index))
  }

  const handleInstallmentsChange = (value: string) => {
    setFormData({ ...formData, installments: value })
    const numInstallments = Number(value)
    if (!Number.isFinite(numInstallments) || numInstallments <= 0) return

    const installmentValue = totalValue / numInstallments

    const newInstallments: Installment[] = []
    const today = new Date()

    for (let i = 0; i < numInstallments; i++) {
      const dueDate = new Date(today.getFullYear(), today.getMonth() + i + 1, 1)
      newInstallments.push({
        number: i + 1,
        value: Number(installmentValue.toFixed(2)),
        dueDate: dueDate.toISOString().split('T')[0],
      })
    }

    setInstallmentDates(newInstallments)
  }

  const handleInstallmentDateChange = (index: number, date: string) => {
    const updated = [...installmentDates]
    updated[index].dueDate = date
    setInstallmentDates(updated)
  }

  const handleInstallmentValueChange = (index: number, value: string) => {
    const numeric = Number(value.replace(',', '.'))
    const updated = [...installmentDates]
    updated[index].value = Number.isFinite(numeric) ? numeric : 0
    setInstallmentDates(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (products.length === 0) {
      alert('Adicione pelo menos um produto')
      return
    }

    setSubmitLoading(true)

    try {
      const discountPercent = Number(formData.discount) || 0
      const feePercent = Number(formData.fee) || 0
      const currentSubtotal = products.reduce((sum, p) => sum + p.subtotal, 0)
      const currentFeeValue = currentSubtotal * (feePercent / 100)
      const currentDiscountValue = currentSubtotal * (discountPercent / 100)
      const currentTotalValue = currentSubtotal + currentFeeValue - currentDiscountValue

      if (formData.paymentType === 'credit') {
        if (installmentDates.length === 0) {
          setSubmitLoading(false)
          setError(
            'Defina as parcelas (valor e vencimento) antes de salvar uma venda parcelada.',
          )
          return
        }

        const sumInstallments = installmentDates.reduce(
          (sum, inst) => sum + (inst.value || 0),
          0,
        )

        // tolerância de 1 centavo por causa de arredondamento
        if (Math.abs(sumInstallments - currentTotalValue) > 0.01) {
          setSubmitLoading(false)
          setError(
            `A soma das parcelas (R$ ${sumInstallments.toFixed(
              2,
            )}) é diferente do valor total da venda (R$ ${currentTotalValue.toFixed(
              2,
            )}). Ajuste os valores das parcelas.`,
          )
          return
        }
      }

      // 1) Cria a venda (sales)
      const { data: saleInsert, error: saleError } = await supabase
        .from('sales')
        .insert({
          customer_id: formData.customer || null,
          total_amount: currentTotalValue,
          discount: currentDiscountValue,
          fee: currentFeeValue,
          status: formData.paymentType === 'cash' ? 'paid' : 'open',
        })
        .select('id')
        .single()

      if (saleError || !saleInsert) {
        throw saleError || new Error('Falha ao criar venda')
      }

      const saleId = saleInsert.id as string

      // 2) Itens da venda (sale_items)
      const saleItemsPayload = products.map((p) => ({
        sale_id: saleId,
        product_id: p.id,
        quantity: p.quantity,
        unit_price: p.unitPrice,
        unit_cost: p.unitCost,
        subtotal: p.subtotal,
      }))

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItemsPayload)

      if (itemsError) throw itemsError

      // 3) Atualiza estoque (products.stock_quantity)
      for (const p of products) {
        const baseProduct = availableProducts.find((bp) => bp.id === p.id)
        if (!baseProduct) continue
        const newStock = baseProduct.stock_quantity - p.quantity

        const { error: stockError } = await supabase
          .from('products')
          .update({ stock_quantity: newStock })
          .eq('id', p.id)

        if (stockError) throw stockError
      }

      // 4) Recebíveis / Pagamento
      if (formData.paymentType === 'credit') {
        if (installmentDates.length === 0) {
          throw new Error(
            'Defina as parcelas antes de salvar uma venda parcelada.',
          )
        }

        const receivablesPayload = installmentDates.map((inst) => ({
          sale_id: saleId,
          customer_id: formData.customer || null,
          amount: inst.value,
          due_date: inst.dueDate,
          installment_number: inst.number,
          status: 'open',
        }))

        const { error: recError } = await supabase
          .from('receivables')
          .insert(receivablesPayload)

        if (recError) throw recError
      } else {
        // venda à vista: registra pagamento imediato
        if (currentTotalValue > 0) {
          const { error: payError } = await supabase.from('payments').insert({
            sale_id: saleId,
            customer_id: formData.customer || null,
            amount: currentTotalValue,
            method: 'cash',
          })
          if (payError) throw payError
        }
      }

      // 5) Dados para o recibo / sucesso
      const receiptData: ThermalReceiptData = {
        saleId,
        issuedAt: new Date(),
        customerName: formData.customerName || 'Não identificado',
        items: products.map((product) => ({
          name: product.name,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          subtotal: product.subtotal,
        })),
        subtotal: currentSubtotal,
        fee: currentFeeValue,
        discount: currentDiscountValue,
        total: currentTotalValue,
        paymentLabel:
          formData.paymentType === 'cash'
            ? 'À vista'
            : `Parcelado em ${installmentDates.length}x`,
        installments:
          formData.paymentType === 'credit'
            ? installmentDates.map((installment) => ({
                number: installment.number,
                value: installment.value,
                dueDate: installment.dueDate,
              }))
            : [],
      }

      setSaleData(receiptData)
      setPrintWarning(null)
      setShowSuccess(true)
      onSaleCreated?.()

      if (!printThermalReceipt(receiptData)) {
        setPrintWarning(
          'A impressão automática não pôde ser aberta. Use “Imprimir novamente”.',
        )
      }
    } catch (err: any) {
      console.error('Erro ao registrar venda', err)
      setError(err.message || 'Erro ao registrar venda. Tente novamente.')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handlePrint = () => {
    if (!saleData) return
    if (printThermalReceipt(saleData)) {
      setPrintWarning(null)
      return
    }
    setPrintWarning(
      'Não foi possível abrir a impressão. Verifique as permissões do navegador.',
    )
  }

  const handleSendWhatsApp = () => {
    const customer = customers.find((c) => c.id === formData.customer)
    if (!customer || !customer.phone) {
      alert('Esta venda não está ligada a um cliente com telefone.')
      return
    }

    const productsText = products
      .map(
        (p) =>
          `${p.name} (${p.quantity}x) - R$ ${p.subtotal.toFixed(2)}`,
      )
      .join('\n')

    const message = `*Comprovante de Venda - Angel Cosméticos*\n\nCliente: ${customer.name
      }\n\nProdutos:\n${productsText}\n\nSubtotal: R$ ${subtotalValue.toFixed(
        2,
      )}\nDesconto: R$ ${discountValue.toFixed(
        2,
      )}\nValor Total: R$ ${totalValue.toFixed(
        2,
      )}\nForma de Pagamento: ${formData.paymentType === 'cash'
        ? 'À vista'
        : `Parcelado ${formData.installments}x`
      }\n\nObrigado pela preferência!`

    const phone = customer.phone.replace(/\D/g, '')
    window.open(
      `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`,
      '_blank',
    )
  }

  const handleClose = () => {
    setShowSuccess(false)
    onOpenChange(false)
    setFormData({
      customer: '',
      customerName: '',
      paymentType: 'cash',
      installments: '1',
      discount: '0',
      fee: '0',
    })
    setProducts([])
    setCurrentProduct({ id: '', name: '', quantity: '1', unitPrice: '' })
    setInstallmentDates([])
    setSaleData(null)
    setPrintWarning(null)
    setError(null)
    if (barcodeTimerRef.current) {
      clearTimeout(barcodeTimerRef.current)
      barcodeTimerRef.current = null
    }
    setBarcodeValue('')
  }

  if (showSuccess) {
    return (
      <Dialog
        open={showSuccess}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose()
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Venda Registrada com Sucesso!</DialogTitle>
            <DialogDescription>
              O cupom de 80 mm foi enviado para impressão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm">
                <strong>Cliente:</strong> {formData.customerName || '—'}
              </p>
              <p className="text-sm">
                <strong>Produtos:</strong> {products.length}
              </p>
              <p className="text-sm">
                <strong>Valor Total:</strong> R$ {totalValue.toFixed(2)}
              </p>
            </div>
            {printWarning && (
              <p className="text-sm text-amber-700">{printWarning}</p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handlePrint}
              className="gap-2 w-full sm:w-auto"
            >
              <Printer className="h-4 w-4" />
              Imprimir novamente
            </Button>
            <Button
              variant="outline"
              onClick={handleSendWhatsApp}
              className="gap-2 w-full sm:w-auto"
            >
              <Share2 className="h-4 w-4" />
              Enviar WhatsApp
            </Button>
            <Button onClick={handleClose} className="w-full sm:w-auto">
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Venda</DialogTitle>
        </DialogHeader>

        {loadingBase && (
          <p className="text-sm text-muted-foreground mb-2">
            Carregando clientes e produtos...
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive mb-2">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer">Cliente</Label>
            <Popover open={openCustomer} onOpenChange={setOpenCustomer}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCustomer}
                  className="w-full justify-between"
                >
                  {formData.customer
                    ? customers.find((c) => c.id === formData.customer)?.name
                    : 'Buscar cliente...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                  <CommandGroup className="max-h-[200px] overflow-auto">
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.name}
                        onSelect={() => {
                          setFormData({
                            ...formData,
                            customer: customer.id,
                            customerName: customer.name,
                          })
                          setOpenCustomer(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            formData.customer === customer.id
                              ? 'opacity-100'
                              : 'opacity-0',
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{customer.name}</span>
                          {customer.phone && (
                            <span className="text-xs text-muted-foreground">
                              {customer.phone}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Se não selecionar cliente, a venda será considerada sem vínculo de
              cliente.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
            <Label>Adicionar Produtos</Label>
            <div className="space-y-2">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input
                id="barcode"
                ref={barcodeRef}
                placeholder="Escaneie o produto..."
                value={barcodeValue}
                autoComplete="off"
                onKeyDown={(e) => {
                  // se o leitor mandar Enter, NÃO deixa submeter o form
                  if (e.key === 'Enter') {
                    e.preventDefault()
                  }
                }}
                onChange={(e) => {
                  const value = e.target.value
                  setBarcodeValue(value)
                  setError(null)

                  // debounce: ao “parar de digitar” (scanner terminou), tenta adicionar
                  if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current)
                  barcodeTimerRef.current = setTimeout(() => {
                    addOneUnitByBarcode(value)
                  }, 80)
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Popover open={openProduct} onOpenChange={setOpenProduct}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openProduct}
                      className="w-full justify-between"
                    >
                      {currentProduct.id
                        ? availableProducts.find(
                          (p) => p.id === currentProduct.id,
                        )?.name
                        : 'Buscar produto...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar produto..." />
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {availableProducts.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.name}
                            onSelect={() => {
                              setCurrentProduct({
                                ...currentProduct,
                                id: product.id,
                                name: product.name,
                                unitPrice: product.sale_price.toString(),
                              })
                              setOpenProduct(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                currentProduct.id === product.id
                                  ? 'opacity-100'
                                  : 'opacity-0',
                              )}
                            />
                            <div className="flex flex-col flex-1">
                              <span>{product.name}</span>
                              <div className="flex gap-2 text-xs text-muted-foreground">
                                <span>
                                  R$ {product.sale_price.toFixed(2)}
                                </span>
                                <span>
                                  • Estoque: {product.stock_quantity}
                                </span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="Qtd"
                  value={currentProduct.quantity}
                  onChange={(e) =>
                    setCurrentProduct({
                      ...currentProduct,
                      quantity: e.target.value,
                    })
                  }
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Preço"
                  value={currentProduct.unitPrice}
                  onChange={(e) =>
                    setCurrentProduct({
                      ...currentProduct,
                      unitPrice: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={handleAddProduct}
              className="w-full"
              size="sm"
            >
              Adicionar Produto
            </Button>
          </div>

          {products.length > 0 && (
            <div className="space-y-2">
              <Label>Produtos Adicionados ({products.length})</Label>
              <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                {products.map((product, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-card"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity}x R${' '}
                        {product.unitPrice.toFixed(2)} = R${' '}
                        {product.subtotal.toFixed(2)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveProduct(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="discount">Desconto (%)</Label>
            <Input
              id="discount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.discount}
              onChange={(e) =>
                setFormData({ ...formData, discount: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fee">Taxa (%)</Label>
            <Input
              id="fee"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.fee}
              onChange={(e) =>
                setFormData({ ...formData, fee: e.target.value })
              }
            />
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">
                R$ {subtotalValue.toFixed(2)}
              </span>
            </div>

            {Number(formData.fee) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Taxa ({formData.fee}%)
                </span>
                <span className="font-medium text-emerald-600">
                  + R$ {feeValue.toFixed(2)}
                </span>
              </div>
            )}

            {Number(formData.discount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Desconto ({formData.discount}%)
                </span>
                <span className="font-medium text-red-600">
                  - R$ {discountValue.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Valor Total
              </span>
              <span className="text-2xl font-bold">
                R$ {totalValue.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paymentType">Forma de Pagamento</Label>
              <Select
                value={formData.paymentType}
                onValueChange={(value) => {
                  setFormData({ ...formData, paymentType: value })
                  if (value === 'cash') {
                    setInstallmentDates([])
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">À vista</SelectItem>
                  <SelectItem value="credit">
                    Parcelado (Crediário)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.paymentType === 'credit' && (
              <div className="space-y-2">
                <Label htmlFor="installments">Número de Parcelas</Label>
                <Select
                  value={formData.installments}
                  onValueChange={handleInstallmentsChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                    <SelectItem value="4">4x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                    <SelectItem value="6">6x</SelectItem>
                    <SelectItem value="7">7x</SelectItem>
                    <SelectItem value="8">8x</SelectItem>
                    <SelectItem value="9">9x</SelectItem>
                    <SelectItem value="10">10x</SelectItem>
                    <SelectItem value="11">11x</SelectItem>
                    <SelectItem value="12">12x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {formData.paymentType === 'credit' &&
            installmentDates.length > 0 && (
              <div className="space-y-3">
                <Label>Vencimento das Parcelas</Label>
                <div className="rounded-lg border p-4 space-y-3 max-h-[300px] overflow-y-auto">
                  {installmentDates.map((installment, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm font-medium min-w-[60px]">
                          {installment.number}ª parcela
                        </span>
                        <Input
                          type="date"
                          value={installment.dueDate}
                          onChange={(e) =>
                            handleInstallmentDateChange(index, e.target.value)
                          }
                          className="flex-1"
                          required
                        />
                      </div>

                      <div className="flex items-center gap-2 sm:w-[160px]">
                        <span className="text-xs text-muted-foreground">
                          Valor
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={installment.value.toFixed(2)}
                          onChange={(e) =>
                            handleInstallmentValueChange(index, e.target.value)
                          }
                          className="text-right"
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitLoading}>
              {submitLoading ? 'Registrando...' : 'Registrar Venda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
