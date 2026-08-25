export interface ThermalReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface ThermalReceiptInstallment {
  number: number
  value: number
  dueDate: string
}

export interface ThermalReceiptData {
  saleId: string
  issuedAt: string | Date
  customerName?: string
  items: ThermalReceiptItem[]
  subtotal: number
  discount: number
  fee: number
  total: number
  paymentLabel: string
  installments?: ThermalReceiptInstallment[]
  canceled?: boolean
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return value
}

const renderReceiptHtml = (receipt: ThermalReceiptData) => {
  const itemsHtml = receipt.items
    .map(
      (item) => `
        <div class="item">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-values">
            <span>${escapeHtml(item.quantity)} x ${escapeHtml(formatCurrency(item.unitPrice))}</span>
            <strong>${escapeHtml(formatCurrency(item.subtotal))}</strong>
          </div>
        </div>`,
    )
    .join('')

  const installmentsHtml = receipt.installments?.length
    ? `
      <div class="separator"></div>
      <div class="section-title">PARCELAS</div>
      ${receipt.installments
        .map(
          (installment) => `
            <div class="row small">
              <span>${escapeHtml(installment.number)}ª - ${escapeHtml(formatDate(installment.dueDate))}</span>
              <span>${escapeHtml(formatCurrency(installment.value))}</span>
            </div>`,
        )
        .join('')}`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Cupom ${escapeHtml(receipt.saleId.slice(0, 8).toUpperCase())}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; }
      body {
        width: 72mm;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.3;
      }
      .center { text-align: center; }
      .store { font-size: 17px; font-weight: 800; letter-spacing: .2px; }
      .document-type { margin-top: 3px; font-size: 11px; font-weight: 700; }
      .separator { border-top: 1px dashed #000; margin: 8px 0; }
      .meta { margin: 2px 0; overflow-wrap: anywhere; }
      .section-title { margin-bottom: 5px; font-size: 10px; font-weight: 700; }
      .item { break-inside: avoid; margin-bottom: 7px; }
      .item-name { font-weight: 700; overflow-wrap: anywhere; }
      .item-values, .row { display: flex; justify-content: space-between; gap: 8px; }
      .item-values span:first-child, .row span:first-child { min-width: 0; }
      .row { margin: 3px 0; }
      .row.total { align-items: baseline; margin-top: 6px; font-size: 16px; font-weight: 800; }
      .small { font-size: 10px; }
      .status-canceled {
        margin: 7px 0;
        border: 2px solid #000;
        padding: 4px;
        text-align: center;
        font-size: 14px;
        font-weight: 800;
      }
      .footer { margin-top: 10px; font-size: 9px; text-align: center; overflow-wrap: anywhere; }
      @media screen {
        body { margin: 16px auto; }
      }
      @media print {
        html, body { width: 72mm; }
      }
    </style>
  </head>
  <body>
    <header class="center">
      <div class="store">ANGEL COSMÉTICOS</div>
      <div class="document-type">CUPOM NÃO FISCAL</div>
    </header>

    ${receipt.canceled ? '<div class="status-canceled">VENDA CANCELADA</div>' : ''}

    <div class="separator"></div>
    <div class="meta"><strong>Venda:</strong> ${escapeHtml(receipt.saleId.slice(0, 8).toUpperCase())}</div>
    <div class="meta"><strong>Data:</strong> ${escapeHtml(formatDateTime(receipt.issuedAt))}</div>
    <div class="meta"><strong>Cliente:</strong> ${escapeHtml(receipt.customerName || 'Não identificado')}</div>

    <div class="separator"></div>
    <div class="section-title">ITENS</div>
    ${itemsHtml || '<div>Nenhum item encontrado.</div>'}

    <div class="separator"></div>
    <div class="row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(receipt.subtotal))}</span></div>
    ${receipt.fee > 0 ? `<div class="row"><span>Taxa</span><span>+ ${escapeHtml(formatCurrency(receipt.fee))}</span></div>` : ''}
    ${receipt.discount > 0 ? `<div class="row"><span>Desconto</span><span>- ${escapeHtml(formatCurrency(receipt.discount))}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(receipt.total))}</span></div>

    <div class="separator"></div>
    <div class="row"><strong>Pagamento</strong><span>${escapeHtml(receipt.paymentLabel)}</span></div>
    ${installmentsHtml}

    <footer class="footer">
      <div>Obrigado pela preferência!</div>
      <div>Documento sem valor fiscal</div>
      <div>ID: ${escapeHtml(receipt.saleId)}</div>
    </footer>
  </body>
</html>`
}

export const printThermalReceipt = (receipt: ThermalReceiptData) => {
  if (typeof document === 'undefined' || !document.body) return false

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'

  document.body.appendChild(iframe)

  const printWindow = iframe.contentWindow
  const printDocument = iframe.contentDocument
  if (!printWindow || !printDocument) {
    iframe.remove()
    return false
  }

  let removed = false
  const removeIframe = () => {
    if (removed) return
    removed = true
    iframe.remove()
  }

  printWindow.addEventListener('afterprint', removeIframe, { once: true })
  window.setTimeout(removeIframe, 60_000)

  iframe.addEventListener(
    'load',
    () => {
      window.setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 100)
    },
    { once: true },
  )

  printDocument.open()
  printDocument.write(renderReceiptHtml(receipt))
  printDocument.close()
  return true
}
