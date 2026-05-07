import { useEffect, useRef, useState } from 'react'
import introImage from './assets/intro.jpg'
import './styles.css'

type ScreenProfile = 'auto' | 'tablet_10'
type MainKeypadTarget = 'search' | 'cashTopup' | 'sbpTopup' | null

type CashierSettings = {
  cashier_account: number | string
  screen_profile: ScreenProfile
  appearance_theme: string
  settings_json: Record<string, unknown>
}

type Store = {
  store_id: number
  store_name: string
  store_address: string | null
  owner_account: number | null
  owner_balance: number | null
}

type Cashier = {
  cashier_account: number | string
  user_fam: string | null
  user_name: string | null
  user_otch: string | null
}

type LoginResponse = {
  ok: boolean
  session_id: string
  cashier: Cashier
  stores: Store[]
}

function toSafeInt(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function getErrorMessage(data: any, fallback: string) {
  if (!data?.detail) return fallback
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail.map((item: any) => item?.msg || JSON.stringify(item)).join('; ') || fallback
  }
  return fallback
}

function isOrderCancelable(order: FoundOrder) {
  const status = String(order.status || '').toLowerCase()
  const statusLabel = String(order.status_label || '').toLowerCase()

  return (
    status === 'in_progress' ||
    status.includes('передан') ||
    statusLabel.includes('передан') ||
    status.includes('выполнение') ||
    statusLabel.includes('выполнение')
  )
}

type FoundUser = {
  user_id?: number | null
  user_account: number
  user_phone: string | null
  user_name: string | null
  user_fam: string | null
  user_otch: string | null
  balance: number
  photo_url: string | null
}

type FoundOrder = {
  order_number: number
  status: string
  status_label: string
  delivery_date: string | null
  date_updated: string
  order_sum: number
}

type SearchResponse = {
  ok: boolean
  store: {
    store_id: number
    owner_account: number
    owner_balance: number
    cash_balance: number
    cash_limit: number
  }
  user: FoundUser
  orders: FoundOrder[]
}

type OrderPaymentQrDialog = {
  order_number: number
  amount: number
  old_balance: number
  qr_base64: string
  image_type: string
  qr_url: string | null
  ttl: number
  created_at: number
}

type UserTransactionRow = {
  line_id: number
  transaction_id: string
  transaction_type: string
  transaction_type_label: string
  status: string
  cashier_account: number | null
  store_id: number | null
  owner_account: number | null
  order_number: number | null
  transaction_amount: number
  amount_delta: number
  line_type: string
  line_type_label: string
  balance_before: number
  balance_after: number
  created_at: string
  comment: string | null
}

type OrderLine = {
  order_line_id: number | null
  good_id: number
  good_name: string
  unit: string
  id: number
  name: string
  code?: string | null
  isfractional?: boolean
  is_local?: boolean
  is_dirty?: boolean
  item: number
  item_name: string
  photo_url: string | null
  item_type: 'piece' | 'weight'
  avg_weight: number | null
  pack: string | null
  qty: number
  price: number
  qty_final: number
  line_sum: number
  item_stock: number
  reserve: number
  available_qty: number
  max_qty_final: number
}

type StoreItem = {
  good_id?: number
  good_name?: string
  id?: number
  name?: string
  code?: string | null
  isfractional?: boolean
  unit?: string | null
  category?: number | string | null
  currency?: string | null
  item: number
  item_name: string
  item_category: string | null
  item_subcategory: string | null
  photo_url: string | null
  item_type: 'piece' | 'weight'
  avg_weight: number | null
  pack: string | null
  price: number
  item_stock: number
  reserve: number
  available_qty: number
}

type ItemCategoryGroup = {
  category: string
  items_count: number
  subcategories: {
    subcategory: string
    items_count: number
  }[]
}

type OrderDetailsResponse = {
  ok: boolean
  readonly: boolean
  order: {
    order_number: number
    user_account: number
    store_id: number
    status: string
    status_label: string
    order_sum: number
    user_phone: string | null
    user_name: string | null
    user_fam: string | null
    user_otch: string | null
    user_balance: number
    user_photo_url: string | null
  }
  store: {
    store_id: number
    owner_account: number
    owner_balance: number
    cash_balance: number
    cash_limit: number
  }
  lines: OrderLine[]
}

type OrderReceiptResponse = {
  ok: boolean
  store: {
    store_id: number
    store_name: string
    store_address: string | null
    owner_account: number | null
  }
  order: {
    order_number: number
    user_account: number
    store_id: number
    status: string
    status_label: string
    order_sum: number
    user_phone: string | null
    user_fam: string | null
    user_name: string | null
    user_otch: string | null
    date_updated: string
  }
  lines: {
    order_line_id: number
    item: number
    item_name: string
    item_type: 'piece' | 'weight'
    pack: string | null
    qty_final: number
    price: number
    line_sum: number
  }[]
  payment: {
    transaction_id: string
    amount: number
    created_at: string
    status: string
  } | null
}

const API_BASE = '/pos-api'
const SESSION_ID_STORAGE_KEY = 'session_id'
const STORE_ID_STORAGE_KEY = 'store_id'

function readStoredSessionId() {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(SESSION_ID_STORAGE_KEY) || ''
}

function saveStoredSessionId(value: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SESSION_ID_STORAGE_KEY, value)
}

function clearStoredSessionId() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SESSION_ID_STORAGE_KEY)
}

function saveStoredStoreId(value: number | string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORE_ID_STORAGE_KEY, String(value))
}

function clearStoredStoreId() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(STORE_ID_STORAGE_KEY)
}

function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatQty(value: number | null | undefined, itemType?: string) {
  const n = Number(value ?? 0)

  if (itemType === 'piece') {
    return n.toLocaleString('ru-RU', {
      maximumFractionDigits: 0,
    })
  }

  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}


function toNumber(value: any, fallback = 0) {
  const n = Number(value ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

type ItemSearchParam = {
  key: 'ids' | 'barcode' | 'q'
  value: string
}

function getItemSearchParam(query: string): ItemSearchParam | null {
  const value = query.trim()

  if (!value) {
    return null
  }

  const isOnlyDigits = /^\d+$/.test(value)

  if (!isOnlyDigits) {
    return { key: 'q', value }
  }

  // Короткое число в кассе считаем ID товара Paritet, длинное число — штрихкод.
  return value.length >= 8 ? { key: 'barcode', value } : { key: 'ids', value }
}

function buildItemSearchParams(query: string) {
  const params = new URLSearchParams()
  const searchParam = getItemSearchParam(query)

  if (!searchParam) {
    return params
  }

  // Защита от регресса: barcode никогда не должен получать текстовый запрос.
  if (searchParam.key === 'barcode' && !/^\d+$/.test(searchParam.value)) {
    params.set('q', searchParam.value)
    return params
  }

  params.set(searchParam.key, searchParam.value)
  return params
}

function extractParitetGoods(data: any): any[] {
  if (Array.isArray(data?.goods)) return data.goods
  if (Array.isArray(data?.payload?.goods)) return data.payload.goods
  if (data?.payload && data.payload.id != null) return [data.payload]
  if (data?.id != null) return [data]
  return []
}

function getOrderLineUiId(line: { order_line_id?: number | null; item: number }) {
  return line.order_line_id ?? line.item
}

function isOrderLineUnsaved(line: OrderLine) {
  return Boolean(line.is_local || line.is_dirty || (typeof line.order_line_id === 'number' && line.order_line_id < 0))
}

function isInsufficientFundsError(message: string) {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('недостат') || normalized.includes('insufficient')
}

function buildQrImageSrc(qrBase64: string, imageType?: string | null) {
  if (!qrBase64) return ''
  if (qrBase64.startsWith('data:')) return qrBase64
  return `data:${imageType || 'image/png'};base64,${qrBase64}`
}

function getOrderHasUnsavedChanges(orderDetails: OrderDetailsResponse | null) {
  return Boolean(orderDetails?.lines?.some((line) => isOrderLineUnsaved(line)))
}

function getOrderLineRowStyle(line: OrderLine, dragLineId: number | null, animatingLineId: number | null, dragX: number, commitX: number) {
  const lineId = getOrderLineUiId(line)
  const baseStyle = isOrderLineUnsaved(line) ? { backgroundColor: '#fff7cc' } : {}

  if (dragLineId === lineId) {
    return {
      ...baseStyle,
      transform: `translateX(${dragX}px)`,
      opacity: Math.max(0.72, 1 - dragX / 420),
    }
  }

  if (animatingLineId === lineId) {
    return {
      ...baseStyle,
      '--swipe-start-x': `${commitX}px`,
    } as any
  }

  return Object.keys(baseStyle).length ? baseStyle : undefined
}

function getOrderCardSwipeStyle(orderNumber: number, dragOrderNumber: number | null, dragX: number) {
  if (dragOrderNumber !== orderNumber) return undefined

  return {
    transform: `translateX(${dragX}px)`,
    opacity: Math.max(0.78, 1 - Math.abs(dragX) / 420),
    touchAction: 'pan-y',
  } as any
}

function recalcOrderLine(line: OrderLine, nextQty: number): OrderLine {
  const normalizedQty = Math.max(0, toNumber(nextQty, 0))
  return {
    ...line,
    qty: normalizedQty,
    qty_final: normalizedQty,
    line_sum: normalizedQty * toNumber(line.price, 0),
    max_qty_final: normalizedQty + toNumber(line.available_qty, 0),
    is_dirty: true,
  }
}

function mapParitetProductToStoreItem(product: any): StoreItem {
  const productId = toNumber(product?.id, 0)
  const productName = String(product?.name ?? '')
  const itemStock = toNumber(product?.count, 0)
  const availableQty = toNumber(product?.availablecount, itemStock)
  const isFractional = Boolean(product?.isfractional)

  return {
    good_id: productId,
    good_name: productName,
    id: productId,
    name: productName,
    code: product?.code ?? null,
    isfractional: isFractional,
    unit: product?.unit ?? null,
    category: product?.category ?? null,
    currency: product?.currency ?? null,
    item: productId,
    item_name: productName,
    item_category: product?.category != null ? String(product.category) : null,
    item_subcategory: null,
    photo_url: product?.preview ?? null,
    item_type: isFractional ? 'weight' : 'piece',
    avg_weight: null,
    pack: product?.unit ?? null,
    price: toNumber(product?.price, 0),
    item_stock: itemStock,
    reserve: Math.max(itemStock - availableQty, 0),
    available_qty: availableQty,
  }
}

function mapParitetOrderLineToFront(item: any): OrderLine {
  const product = item?.product || {}
  const mappedProduct = mapParitetProductToStoreItem(product)
  const qty = toNumber(item?.count, 0)
  const price = toNumber(item?.price, mappedProduct.price)

  return {
    order_line_id: item?.id != null ? toNumber(item.id, 0) : null,
    good_id: mappedProduct.item,
    good_name: mappedProduct.item_name,
    unit: mappedProduct.pack || '',
    id: mappedProduct.item,
    name: mappedProduct.item_name,
    code: mappedProduct.code,
    isfractional: mappedProduct.isfractional,
    is_local: false,
    is_dirty: false,
    item: mappedProduct.item,
    item_name: mappedProduct.item_name,
    photo_url: mappedProduct.photo_url,
    item_type: mappedProduct.item_type,
    avg_weight: mappedProduct.avg_weight,
    pack: mappedProduct.pack,
    qty,
    price,
    qty_final: qty,
    line_sum: qty * price,
    item_stock: mappedProduct.item_stock,
    reserve: mappedProduct.reserve,
    available_qty: mappedProduct.available_qty,
    max_qty_final: qty + mappedProduct.available_qty,
  }
}

function mapStoreItemToOrderLine(product: StoreItem): OrderLine {
  const qty = product.item_type === 'piece' ? 1 : 1
  const tempLineId = -Date.now() - product.item

  return {
    order_line_id: tempLineId,
    good_id: product.item,
    good_name: product.item_name,
    unit: product.pack || '',
    id: product.item,
    name: product.item_name,
    code: product.code ?? null,
    isfractional: product.isfractional,
    is_local: true,
    is_dirty: true,
    item: product.item,
    item_name: product.item_name,
    photo_url: product.photo_url,
    item_type: product.item_type,
    avg_weight: product.avg_weight,
    pack: product.pack,
    qty,
    price: product.price,
    qty_final: qty,
    line_sum: qty * product.price,
    item_stock: product.item_stock,
    reserve: product.reserve,
    available_qty: Math.max(product.available_qty - qty, 0),
    max_qty_final: product.available_qty,
  }
}

function mapParitetOrderToFrontResponse(data: any, foundUser: FoundUser, selectedStore: Store): OrderDetailsResponse {
  const payload = data?.payload || data || {}
  const lines = Array.isArray(payload.items)
    ? payload.items.map(mapParitetOrderLineToFront)
    : Array.isArray(data?.lines)
      ? data.lines
      : []

  const orderSum = toNumber(payload.price, lines.reduce((sum: number, line: OrderLine) => sum + toNumber(line.line_sum, 0), 0))

  return {
    ok: true,
    readonly: payload.canedit === false || data?.readonly === true,
    order: {
      order_number: toNumber(payload.number ?? payload.id ?? data?.order?.order_number, 0),
      user_account: foundUser.user_account,
      store_id: selectedStore.store_id,
      status: String(payload.state ?? data?.order?.status ?? ''),
      status_label: String(payload.state ?? data?.order?.status_label ?? 'Заказ'),
      order_sum: orderSum,
      user_phone: foundUser.user_phone,
      user_name: foundUser.user_name,
      user_fam: foundUser.user_fam,
      user_otch: foundUser.user_otch,
      user_balance: foundUser.balance,
      user_photo_url: foundUser.photo_url,
    },
    store: data?.store || {
      store_id: selectedStore.store_id,
      owner_account: selectedStore.owner_account || 0,
      owner_balance: selectedStore.owner_balance || 0,
      cash_balance: 0,
      cash_limit: 0,
    },
    lines,
  }
}


function createLocalNewOrderDetails(foundUser: FoundUser, selectedStore: Store): OrderDetailsResponse {
  return {
    ok: true,
    readonly: false,
    order: {
      order_number: 0,
      user_account: foundUser.user_account,
      store_id: selectedStore.store_id,
      status: 'local_new',
      status_label: 'Новый заказ',
      order_sum: 0,
      user_phone: foundUser.user_phone,
      user_name: foundUser.user_name,
      user_fam: foundUser.user_fam,
      user_otch: foundUser.user_otch,
      user_balance: foundUser.balance,
      user_photo_url: foundUser.photo_url,
    },
    store: {
      store_id: selectedStore.store_id,
      owner_account: selectedStore.owner_account || 0,
      owner_balance: selectedStore.owner_balance || 0,
      cash_balance: 0,
      cash_limit: 0,
    },
    lines: [],
  }
}

function App() {
  const [cashierAccount, setCashierAccount] = useState('')
  const [cashierPasswd, setCashierPasswd] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState(() => readStoredSessionId())
  const [cashier, setCashier] = useState<Cashier | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [screenProfile, setScreenProfile] = useState<ScreenProfile>('auto')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [mainKeypadTarget, setMainKeypadTarget] = useState<MainKeypadTarget>(null)
  const lastTopbarTapAt = useRef(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [ownerBalance, setOwnerBalance] = useState<number>(0)
  const [cashBalance, setCashBalance] = useState<number>(0)
  const [orders, setOrders] = useState<FoundOrder[]>([])
  const [storeState, setStoreState] = useState<SearchResponse['store'] | null>(null)
  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [txLoading, setTxLoading] = useState(false)
  const [txRows, setTxRows] = useState<UserTransactionRow[]>([])
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<number | null>(null)
  const [cashTopupAmount, setCashTopupAmount] = useState('')
  const [cashTopupLoading, setCashTopupLoading] = useState(false)
  const [cashTopupConfirmOpen, setCashTopupConfirmOpen] = useState(false)
  const cashTopupConfirmOpenedAtRef = useRef(0)

  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false)
  const [newUserLoading, setNewUserLoading] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    user_fam: '',
    user_name: '',
    user_otch: '',
    date_of_birth: '',
    address: '',
    email: '',
    user_phone: '',
  })

  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockMessage, setStockMessage] = useState('')
  const [stockForm, setStockForm] = useState({
    item: '',
    qty_delta: '',
    comment: '',
  })
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [stockSearchLoading, setStockSearchLoading] = useState(false)
  const [stockSearchItems, setStockSearchItems] = useState<StoreItem[]>([])
  const [stockViewDialogOpen, setStockViewDialogOpen] = useState(false)
  const [stockViewQuery, setStockViewQuery] = useState('')
  const [stockViewLoading, setStockViewLoading] = useState(false)
  const [stockViewItems, setStockViewItems] = useState<StoreItem[]>([])


  const [orderDetails, setOrderDetails] = useState<OrderDetailsResponse | null>(null)
  const [deleteOrderDialog, setDeleteOrderDialog] = useState<FoundOrder | null>(null)
  const [cancelOrderLoading, setCancelOrderLoading] = useState(false)
  const [orderSwipeDragNumber, setOrderSwipeDragNumber] = useState<number | null>(null)
  const [orderSwipeDragX, setOrderSwipeDragX] = useState(0)
  const orderSwipeRef = useRef<{ orderNumber: number; startX: number; startY: number } | null>(null)
  const swipedOrderNumberRef = useRef<number | null>(null)
  const [orderLoading, setOrderLoading] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptData, setReceiptData] = useState<OrderReceiptResponse | null>(null)

  useEffect(() => {
    const currentCashier = cashier
    const currentOrderDetails = orderDetails

    if (!currentCashier || !currentOrderDetails || currentOrderDetails.order.status !== 'in_progress') {
      return
    }

    const orderNumber = currentOrderDetails.order.order_number
    const heartbeatCashierAccount = currentCashier.cashier_account

    async function sendHeartbeat() {
      const params = new URLSearchParams({
        cashier_account: String(heartbeatCashierAccount),
        device_id: 'web',
      })

      try {
        const res = await apiFetch(
          `${API_BASE}/cashier/orders/${orderNumber}/heartbeat?${params.toString()}`,
          { method: 'POST' }
        )

        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.detail || 'Блокировка заказа потеряна. Откройте заказ заново')
        }
      } catch {
        setError('Не удалось продлить блокировку заказа')
      }
    }

    const timer = window.setInterval(sendHeartbeat, 30000)

    return () => {
      window.clearInterval(timer)
    }
  }, [cashier, orderDetails])

  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [itemSearchQuery, setItemSearchQuery] = useState('')
  const [itemsLoading, setItemsLoading] = useState(false)
  const [quickItemCode, setQuickItemCode] = useState('')
  const [quickItemMatches, setQuickItemMatches] = useState<StoreItem[]>([])
  const [quickItemSearchLoading, setQuickItemSearchLoading] = useState(false)
  const [quickItemDropdownOpen, setQuickItemDropdownOpen] = useState(false)
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])
  const [itemCategories, setItemCategories] = useState<ItemCategoryGroup[]>([])
  const [selectedItemCategory, setSelectedItemCategory] = useState('')
  const [selectedItemSubcategory, setSelectedItemSubcategory] = useState('')

  const [qtyDialogLine, setQtyDialogLine] = useState<OrderLine | null>(null)
  const [deleteLineConfirmOpen, setDeleteLineConfirmOpen] = useState(false)
  const [deleteLineDialogLine, setDeleteLineDialogLine] = useState<OrderLine | null>(null)
  const [swipeAnimatingLineId, setSwipeAnimatingLineId] = useState<number | null>(null)
  const [swipeDragLineId, setSwipeDragLineId] = useState<number | null>(null)
  const [swipeDragX, setSwipeDragX] = useState(0)
  const [swipeCommitX, setSwipeCommitX] = useState(0)
  const [qtyDraft, setQtyDraft] = useState('')
  const [qtyCaretIndex, setQtyCaretIndex] = useState(0)
  const [qtySaving, setQtySaving] = useState(false)
  const lineSwipeRef = useRef<{ lineId: number; startX: number; startY: number } | null>(null)
  const swipedLineIdRef = useRef<number | null>(null)
  const deleteLineTapLockRef = useRef(false)

  const [payLoading, setPayLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [orderPaymentMessage, setOrderPaymentMessage] = useState('')
  const [orderPaymentQrDialog, setOrderPaymentQrDialog] = useState<OrderPaymentQrDialog | null>(null)
  const [orderPaymentQrLoading, setOrderPaymentQrLoading] = useState(false)

  const [sbpDialogOpen, setSbpDialogOpen] = useState(false)
  const [sbpAmount, setSbpAmount] = useState('')
  const [sbpMessage, setSbpMessage] = useState('')
  const [sbpLoading, setSbpLoading] = useState(false)
  const sbpAmountInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    document.body.dataset.screenProfile = screenProfile

    return () => {
      delete document.body.dataset.screenProfile
    }
  }, [screenProfile])

  async function toggleAppFullscreen() {
    const root = document.documentElement as any
    const doc = document as any

    try {
      const fullscreenElement =
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement

      if (fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen()
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen()
        }

        return
      }

      if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' })
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen()
      } else if (root.msRequestFullscreen) {
        root.msRequestFullscreen()
      }
    } catch {
      // Chrome может отказать во fullscreen, если жест не распознан как пользовательское действие.
    }
  }

  function handleTopbarPointerUp(e: any) {
    const target = e.target as HTMLElement | null

    if (target?.closest('button, input, select, textarea, a')) {
      return
    }

    const now = Date.now()

    if (now - lastTopbarTapAt.current < 450) {
      lastTopbarTapAt.current = 0
      toggleAppFullscreen()
      return
    }

    lastTopbarTapAt.current = now
  }

  useEffect(() => {
    const state = { posCashierBackGuard: true }

    window.history.pushState(state, '', window.location.href)

    function handlePopState() {
      window.history.pushState(state, '', window.location.href)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  function handleUnauthorizedResponse() {
    clearStoredSessionId()
    clearStoredStoreId()
    clearWorkplaceState()

    setSessionId('')
    setCashier(null)
    setStores([])
    setCashierPasswd('')
    setError('Сессия истекла. Войдите заново')
  }

  async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const storedSessionId = readStoredSessionId()
    const headers = new Headers(init.headers || {})

    if (storedSessionId) {
      headers.set('X-Session-Id', storedSessionId)
    }

    const res = await fetch(input, {
      ...init,
      headers,
    })

    if (res.status === 401) {
      handleUnauthorizedResponse()
    }

    return res
  }

  function selectStore(store: Store) {
    setSelectedStore(store)
    saveStoredStoreId(store.store_id)
  }

  async function loadCashierSettings(cashierAccountValue: number | string) {
    try {
      const res = await apiFetch(`${API_BASE}/cashier/settings/${cashierAccountValue}`)

      if (!res.ok) {
        throw new Error('Не удалось загрузить настройки кассира')
      }

      const data: CashierSettings = await res.json()
      setScreenProfile(data.screen_profile === 'tablet_10' ? 'tablet_10' : 'auto')
    } catch {
      setScreenProfile('auto')
    }
  }

  async function saveScreenProfile(nextProfile: ScreenProfile) {
    setScreenProfile(nextProfile)

    if (!cashier) {
      return
    }

    setSettingsSaving(true)
    setError('')

    try {
      const res = await apiFetch(`${API_BASE}/cashier/settings/${cashier.cashier_account}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screen_profile: nextProfile,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось сохранить настройки внешнего вида')
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка сохранения настроек')
    } finally {
      setSettingsSaving(false)
    }
  }

  function shouldUseTouchKeypad() {
    return (
      screenProfile === 'tablet_10' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches
    )
  }

  function appendMainKeypadValue(value: string) {
    if (mainKeypadTarget === 'search') {
      setSearchQuery((current) => `${current || ''}${value}`.replace(/\D/g, ''))
      return
    }

    if (mainKeypadTarget === 'cashTopup' || mainKeypadTarget === 'sbpTopup') {
      const setter = mainKeypadTarget === 'cashTopup' ? setCashTopupAmount : setSbpAmount

      setter((current) => {
        const raw = String(current || '').replace(',', '.').replace(/[^0-9.]/g, '')

        if (value === '.' && raw.includes('.')) {
          return raw
        }

        if (value === '.' && !raw) {
          return '0.'
        }

        const next = `${raw}${value}`
        const dotIndex = next.indexOf('.')

        if (dotIndex === -1) {
          return next.replace(/^0+(?=\d)/, '') || value
        }

        return (
          next.slice(0, dotIndex + 1) +
          next.slice(dotIndex + 1).replace(/\./g, '')
        ).replace(/^0+(?=\d)/, '')
      })
    }
  }

  function backspaceMainKeypadValue() {
    if (mainKeypadTarget === 'search') {
      setSearchQuery((current) => String(current || '').slice(0, -1))
      return
    }

    if (mainKeypadTarget === 'cashTopup') {
      setCashTopupAmount((current) => String(current || '').slice(0, -1))
      return
    }

    if (mainKeypadTarget === 'sbpTopup') {
      setSbpAmount((current) => String(current || '').slice(0, -1))
    }
  }

  function clearMainKeypadValue() {
    if (mainKeypadTarget === 'search') {
      setSearchQuery('')
      return
    }

    if (mainKeypadTarget === 'cashTopup') {
      setCashTopupAmount('')
      return
    }

    if (mainKeypadTarget === 'sbpTopup') {
      setSbpAmount('')
    }
  }

  function submitMainKeypadValue() {
    if (mainKeypadTarget === 'search') {
      setMainKeypadTarget(null)
      void searchUser()
      return
    }

    if (mainKeypadTarget === 'cashTopup') {
      setMainKeypadTarget(null)
      openCashTopupConfirm()
      return
    }

    if (mainKeypadTarget === 'sbpTopup') {
      setMainKeypadTarget(null)
      void sbpTopupStub()
    }
  }

  function renderMainKeypad() {
    if (!shouldUseTouchKeypad() || !mainKeypadTarget) {
      return null
    }

    const isCashTopup = mainKeypadTarget === 'cashTopup'
    const isSbpTopup = mainKeypadTarget === 'sbpTopup'
    const isMoneyInput = isCashTopup || isSbpTopup

    const title =
      mainKeypadTarget === 'search'
        ? '№ П/С, телефон или заказ'
        : isSbpTopup
          ? 'Сумма СБП'
          : 'Сумма наличными'

    const value =
      mainKeypadTarget === 'search'
        ? searchQuery
        : isSbpTopup
          ? sbpAmount
          : cashTopupAmount

    const submitText =
      mainKeypadTarget === 'search'
        ? 'Найти'
        : 'Пополнить'

    return (
      <div className="mainKeypadPanel">
        <div className="mainKeypadHeader">
          <div>
            <b>{title}</b>
            <span>{value || '0'}</span>
          </div>
          <button className="secondary" type="button" onClick={() => setMainKeypadTarget(null)}>
            Скрыть
          </button>
        </div>

        <div className="mainKeypadGrid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="mainKeypadButton"
              onClick={() => appendMainKeypadValue(digit)}
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            className="mainKeypadButton secondary"
            onClick={backspaceMainKeypadValue}
          >
            ←
          </button>

          <button
            type="button"
            className="mainKeypadButton"
            onClick={() => appendMainKeypadValue('0')}
          >
            0
          </button>

          {isMoneyInput ? (
            <button
              type="button"
              className="mainKeypadButton"
              onClick={() => appendMainKeypadValue('.')}
            >
              .
            </button>
          ) : (
            <button
              type="button"
              className="mainKeypadButton secondary"
              onClick={clearMainKeypadValue}
            >
              C
            </button>
          )}
        </div>

        <div className="mainKeypadActions">
          <button type="button" className="secondary" onClick={clearMainKeypadValue}>
            Очистить
          </button>
          <button type="button" className="primary" onClick={submitMainKeypadValue}>
            {submitText}
          </button>
        </div>
      </div>
    )
  }

  function renderSideMenu() {
    if (!cashier) return null

    return (
      <>
        {sideMenuOpen && (
          <button
            className="sideMenuBackdrop"
            aria-label="Закрыть меню"
            onClick={() => setSideMenuOpen(false)}
          />
        )}

        <aside className={sideMenuOpen ? 'sideMenu open' : 'sideMenu'}>
          <div className="sideMenuHeader">
            <div>
              <b>Меню кассы</b>
              <span>Кассир {cashier.cashier_account}</span>
            </div>
            <button className="secondary menuCloseButton" onClick={() => setSideMenuOpen(false)}>
              ×
            </button>
          </div>

          <div className="sideMenuSection">
            <span className="sideMenuCaption">Настройки</span>
            <b>Внешний вид</b>
            <label htmlFor="screen-profile-select">Адаптация под экран</label>
            <select
              id="screen-profile-select"
              value={screenProfile}
              onChange={(e) => saveScreenProfile(e.target.value as ScreenProfile)}
              disabled={settingsSaving}
            >
              <option value="auto">Авто</option>
              <option value="tablet_10">Планшет 10 дюймов</option>
            </select>
            <p className="sideMenuHint">
              Настройка сохраняется для текущего кассира и применяется сразу.
            </p>
          </div>

          <div className="sideMenuSection">
            <button className="secondary full" onClick={switchStore} disabled={!selectedStore}>
              Сменить ТВТ
            </button>
            <button className="secondary full" onClick={logoutCashier}>
              Выйти
            </button>
          </div>
        </aside>
      </>
    )
  }

  async function login() {
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_account: cashierAccount.trim(),
          cashier_passwd: cashierPasswd,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Ошибка входа')
      }

      const data: LoginResponse = await res.json()

      saveStoredSessionId(data.session_id)
      setSessionId(data.session_id)
      setCashier(data.cashier)
      setStores(data.stores)

      if (data.stores.length === 1) {
        selectStore(data.stores[0])
      } else {
        clearStoredStoreId()
        setSelectedStore(null)
      }

      await loadCashierSettings(data.cashier.cashier_account)
    } catch (e: any) {
      setError(e.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  async function searchUser() {
    if (!cashier || !selectedStore) return

    setError('')
    setSearchLoading(true)
    setSelectedOrderNumber(null)

    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        store_id: String(selectedStore.store_id),
        q: searchQuery,
      })

      const res = await apiFetch(`${API_BASE}/cashier/search?${params.toString()}`)

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Ничего не найдено')
      }

      const data: SearchResponse = await res.json()

      setFoundUser(data.user)
      await fetchStatus()
      setOrders(data.orders)
      setStoreState(data.store)
    } catch (e: any) {
      setFoundUser(null)
      setOrders([])
      setStoreState(null)
      setError(e.message || 'Ошибка поиска')
    } finally {
      setSearchLoading(false)
    }
  }

  async function fetchCurrentShareholderData(account: number | string) {
    if (!cashier || !selectedStore) {
      throw new Error('Не выбрана точка выдачи или кассир')
    }

    const params = new URLSearchParams({
      cashier_account: String(cashier.cashier_account ?? ''),
      store_id: String(selectedStore.store_id),
      account: String(account),
    })

    const res = await apiFetch(`${API_BASE}/cashier/search?${params.toString()}`)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(getErrorMessage(data, 'Не удалось обновить данные пайщика'))
    }

    const data: SearchResponse = await res.json()
    return data
  }

  function applySearchResponse(data: SearchResponse, keepSelectedOrderNumber?: number | null) {
    setFoundUser(data.user)
    setOrders(data.orders)
    setStoreState(data.store)

    if (keepSelectedOrderNumber !== undefined) {
      if (keepSelectedOrderNumber) {
        const exists = data.orders.some((o) => o.order_number === keepSelectedOrderNumber)
        setSelectedOrderNumber(exists ? keepSelectedOrderNumber : null)
      } else {
        setSelectedOrderNumber(null)
      }
    }
  }

  async function refreshCurrentUser(
    keepSelectedOrderNumber?: number | null,
    options: { updateCashierStatus?: boolean } = {}
  ) {
    if (!cashier || !selectedStore || !foundUser) return

    try {
      const data = await fetchCurrentShareholderData(foundUser.user_account)
      applySearchResponse(data, keepSelectedOrderNumber)

      if (options.updateCashierStatus !== false) {
        await fetchStatus()
      }

      return data
    } catch (e: any) {
      setError(e.message || 'Ошибка обновления данных пайщика')
      return null
    }
  }


  async function searchOrders(keepSelectedOrderNumber?: number | null) {
    if (!cashier || !selectedStore || !foundUser) return

    const params = new URLSearchParams({
      cashier_account: String(cashier.cashier_account),
      store_id: String(selectedStore.store_id),
      q: String(foundUser.user_account),
    })

    const res = await apiFetch(`${API_BASE}/cashier/search?${params.toString()}`)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(getErrorMessage(data, 'Не удалось обновить список заказов'))
    }

    const data: SearchResponse = await res.json()

    setFoundUser(data.user)
    setOrders(data.orders)
    setStoreState(data.store)

    if (keepSelectedOrderNumber) {
      const exists = data.orders.some((o) => o.order_number === keepSelectedOrderNumber)
      setSelectedOrderNumber(exists ? keepSelectedOrderNumber : null)
    }
  }

  function updateNewUserField(field: keyof typeof newUserForm, value: string) {
    setNewUserForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  async function createShareholder() {
    if (!cashier || !selectedStore) return

    if (!newUserForm.user_phone.trim()) {
      setError('Введите телефон пайщика')
      return
    }

    setNewUserLoading(true)
    setError('')

    try {
      const res = await apiFetch(`${API_BASE}/cashier/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_account: cashier.cashier_account,
          store_id: selectedStore.store_id,
          user_phone: newUserForm.user_phone,
          user_fam: newUserForm.user_fam,
          user_name: newUserForm.user_name,
          user_otch: newUserForm.user_otch,
          date_of_birth: newUserForm.date_of_birth || null,
          address: newUserForm.address,
          email: newUserForm.email,
          device_id: 'web',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось создать пайщика')
      }

      const data = await res.json()

      setFoundUser(data.user)
      await fetchStatus()
      setOrders([])
      setStoreState(data.store)
      setSelectedOrderNumber(null)
      setSearchQuery(String(data.user.user_account))
      setNewUserDialogOpen(false)

      setNewUserForm({
        user_fam: '',
        user_name: '',
        user_otch: '',
        date_of_birth: '',
        address: '',
        email: '',
        user_phone: '',
      })
    } catch (e: any) {
      setError(e.message || 'Ошибка создания пайщика')
    } finally {
      setNewUserLoading(false)
    }
  }

  function updateStockField(field: keyof typeof stockForm, value: string) {
    setStockForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  async function loadStockSearchItems(query = stockSearchQuery) {
    if (!cashier || !selectedStore) return

    setStockSearchLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        store_id: String(selectedStore.store_id),
        limit: '30',
      })

      if (query.trim()) {
        params.set('q', query.trim())
      }

      const res = await apiFetch(`${API_BASE}/cashier/items?${params.toString()}`)

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось найти товары')
      }

      const data = await res.json()
      setStockSearchItems(data.items || [])
    } catch (e: any) {
      setStockSearchItems([])
      setError(e.message || 'Ошибка поиска товара')
    } finally {
      setStockSearchLoading(false)
    }
  }

  function selectStockItem(item: StoreItem) {
    updateStockField('item', String(item.item))
    setStockMessage(`Выбран товар: ${item.item_name}, код ${item.item}`)
  }

  async function loadStockViewItems(query = stockViewQuery) {
    if (!cashier || !selectedStore) return

    const currentCashier = cashier
    const currentStore = selectedStore

    setStockViewLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        cashier_account: String(currentCashier.cashier_account),
        store_id: String(currentStore.store_id),
        limit: '150',
      })

      if (query.trim()) {
        params.set('q', query.trim())
      }

      const res = await apiFetch(`${API_BASE}/cashier/items?${params.toString()}`)

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось загрузить остатки')
      }

      const data = await res.json()
      setStockViewItems(data.items || [])
    } catch (e: any) {
      setStockViewItems([])
      setError(e.message || 'Ошибка загрузки остатков')
    } finally {
      setStockViewLoading(false)
    }
  }

  async function openStockViewDialog() {
    setStockViewDialogOpen(true)
    setStockViewQuery('')
    setError('')
    await loadStockViewItems('')
  }

  async function stockReceipt() {
    if (!cashier || !selectedStore) return

    const itemCode = Number(stockForm.item)
    const qtyDelta = Number(stockForm.qty_delta)

    if (!itemCode || itemCode <= 0) {
      setError('Введите корректный код товара')
      return
    }

    if (!qtyDelta || qtyDelta <= 0) {
      setError('Введите количество прихода')
      return
    }

    setStockLoading(true)
    setError('')
    setStockMessage('')

    try {
      const res = await apiFetch(`${API_BASE}/cashier/stock/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_account: cashier.cashier_account,
          store_id: selectedStore.store_id,
          item: itemCode,
          qty_delta: qtyDelta,
          comment: stockForm.comment,
          device_id: 'web',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось оприходовать товар')
      }

      const data = await res.json()

      setStockMessage(
        `Оприходовано: ${data.item_name}. Остаток: ${formatQty(data.item_stock_before, data.item_type)} → ${formatQty(data.item_stock_after, data.item_type)}`
      )

      setStockForm((prev) => ({
        ...prev,
        qty_delta: '',
        comment: '',
      }))
    } catch (e: any) {
      setError(e.message || 'Ошибка прихода товара')
    } finally {
      setStockLoading(false)
    }
  }

  async function openTransactionsDialog() {
    if (!cashier || !selectedStore || !foundUser) {
      setError('Сначала найдите пайщика')
      return
    }

    setTxDialogOpen(true)
    setTxLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        store_id: String(selectedStore.store_id),
        limit: '80',
      })

      const res = await apiFetch(
        `${API_BASE}/cashier/users/${foundUser.user_account}/transactions?${params.toString()}`
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось загрузить историю П/С')
      }

      const data = await res.json()
      setTxRows(data.transactions || [])
    } catch (e: any) {
      setTxRows([])
      setError(e.message || 'Ошибка загрузки истории П/С')
    } finally {
      setTxLoading(false)
    }
  }

  function openCashTopupConfirm() {
    if (!cashier || !selectedStore || !foundUser) {
      setError('Сначала найдите пайщика')
      return
    }

    const amount = Number(cashTopupAmount)

    if (!amount || amount <= 0) {
      setError('Введите сумму пополнения')
      return
    }

    setError('')
    cashTopupConfirmOpenedAtRef.current = Date.now()
    setCashTopupConfirmOpen(true)
  }



  useEffect(() => {
    if (!cashTopupConfirmOpen) {
      return
    }

    function handleCashTopupConfirmKeyDown(e: KeyboardEvent) {
      if (e.repeat) {
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        const openedAgo = Date.now() - cashTopupConfirmOpenedAtRef.current

        // Первый Enter только открывает окно.
        // Второй Enter уже подтверждает, но не в тот же самый момент открытия.
        if (openedAgo < 250) {
          return
        }

        if (!cashTopupLoading) {
          void cashTopup()
        }

        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        if (!cashTopupLoading) {
          setCashTopupConfirmOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handleCashTopupConfirmKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleCashTopupConfirmKeyDown, true)
    }
  }, [cashTopupConfirmOpen, cashTopupLoading, cashTopupAmount, foundUser, selectedStore, cashier, sessionId])

  async function cashTopup() {
    if (!cashier || !selectedStore || !foundUser) {
      setError('Сначала найдите пайщика')
      return
    }

    const amount = Number(cashTopupAmount)

    if (!amount || amount <= 0) {
      setError('Введите сумму пополнения')
      return
    }

    setCashTopupLoading(true)
    setError('')

    try {
      const res = await apiFetch(`${API_BASE}/cashier/topup/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_account: cashier.cashier_account,
          store_id: selectedStore.store_id,
          user_account: foundUser.user_account,
          amount,
          device_id: 'web',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось пополнить П/С')
      }

      const data = await res.json()

      setFoundUser((prev) =>
        prev
          ? {
              ...prev,
              balance: data.user_balance_after,
            }
          : prev
      )

      setStoreState((prev) =>
        prev
          ? {
              ...prev,
              owner_balance: data.owner_balance_after,
              cash_balance: data.cash_balance_after,
              cash_limit: data.cash_limit,
            }
          : {
              store_id: selectedStore.store_id,
              owner_account: data.owner_account,
              owner_balance: data.owner_balance_after,
              cash_balance: data.cash_balance_after,
              cash_limit: data.cash_limit,
            }
      )

      setCashTopupAmount('')
      setCashTopupConfirmOpen(false)
    } catch (e: any) {
      setError(e.message || 'Ошибка пополнения')
    } finally {
      setCashTopupLoading(false)
    }
  }

  async function createOrder() {
    if (!cashier || !selectedStore || !foundUser) {
      setError('Сначала найдите пайщика')
      return
    }

    const userId = Number(foundUser.user_id || 0)

    if (!userId) {
      setError('Не удалось создать заказ: в данных пайщика нет user_id')
      return
    }

    setError('')
    setSelectedOrderNumber(0)
    setOrderDetails(createLocalNewOrderDetails(foundUser, selectedStore))
    setQuickItemCode('')
    setQuickItemMatches([])
    setQuickItemDropdownOpen(false)
    setItemPickerOpen(false)
  }

  function handleOrderPointerDown(e: any, order: FoundOrder) {
    if (!isOrderCancelable(order) || cancelOrderLoading) return

    orderSwipeRef.current = {
      orderNumber: order.order_number,
      startX: e.clientX,
      startY: e.clientY,
    }

    setOrderSwipeDragNumber(order.order_number)
    setOrderSwipeDragX(0)

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Pointer capture может быть недоступен на части браузеров.
    }
  }

  function handleOrderPointerMove(e: any, order: FoundOrder) {
    const swipe = orderSwipeRef.current

    if (!swipe || swipe.orderNumber !== order.order_number) {
      return
    }

    const deltaX = e.clientX - swipe.startX
    const deltaY = e.clientY - swipe.startY

    if (Math.abs(deltaY) > 70 && Math.abs(deltaY) > Math.abs(deltaX)) {
      setOrderSwipeDragNumber(null)
      setOrderSwipeDragX(0)
      orderSwipeRef.current = null
      return
    }

    const nextX = Math.max(-170, Math.min(deltaX, 170))
    setOrderSwipeDragX(nextX)

    if (Math.abs(nextX) > 8) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function handleOrderPointerUp(e: any, order: FoundOrder) {
    const swipe = orderSwipeRef.current

    if (!swipe || swipe.orderNumber !== order.order_number) {
      setOrderSwipeDragNumber(null)
      setOrderSwipeDragX(0)
      orderSwipeRef.current = null
      return
    }

    const deltaX = e.clientX - swipe.startX
    const deltaY = e.clientY - swipe.startY

    orderSwipeRef.current = null

    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // Не критично.
    }

    if (Math.abs(deltaX) > 95 && Math.abs(deltaY) < 65) {
      e.preventDefault()
      e.stopPropagation()
      swipedOrderNumberRef.current = order.order_number
      setOrderSwipeDragNumber(null)
      setOrderSwipeDragX(0)
      setDeleteOrderDialog(order)
      return
    }

    setOrderSwipeDragNumber(null)
    setOrderSwipeDragX(0)
  }

  function handleOrderPointerCancel() {
    orderSwipeRef.current = null
    setOrderSwipeDragNumber(null)
    setOrderSwipeDragX(0)
  }

  function handleOrderCardClick(order: FoundOrder) {
    if (swipedOrderNumberRef.current === order.order_number) {
      swipedOrderNumberRef.current = null
      return
    }

    openOrder(order.order_number)
  }

  async function cancelOrder(orderNumber: number) {
    if (!cashier || !selectedStore) return null

    const params = new URLSearchParams({
      store_id: String(selectedStore.store_id),
    })

    const res = await apiFetch(
      `${API_BASE}/cashier/orders/${orderNumber}/cancel?${params.toString()}`,
      { method: 'POST' }
    )

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(getErrorMessage(data, 'Не удалось отменить заказ'))
    }

    return res.json()
  }

  async function handleCancelOrder(orderNumber: number) {
    setError('')
    setCancelOrderLoading(true)

    try {
      await cancelOrder(orderNumber)

      if (selectedOrderNumber === orderNumber) {
        setSelectedOrderNumber(null)
        setOrderDetails(null)
      }

      await searchOrders(null)
      setDeleteOrderDialog(null)
    } catch (e: any) {
      setError(e.message || 'Ошибка отмены заказа')
    } finally {
      setCancelOrderLoading(false)
    }
  }

  
async function fetchStatus() {
  if (!selectedStore) return

  try {
    const params = new URLSearchParams({
      store_id: String(selectedStore.store_id),
    })

    const res = await apiFetch(`${API_BASE}/cashier/status?${params.toString()}`)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.detail || 'Не удалось получить статус')
    }

    const data = await res.json()

    setOwnerBalance(Number(data.owner_balance || 0))
    setCashBalance(Number(data.cash_balance || 0))
  } catch (e) {
    console.error('Ошибка получения статуса', e)
  }
}

useEffect(() => {
  if (selectedStore) {
    fetchStatus()
  }
}, [selectedStore])

async function openOrder(orderNumber: number) {
    if (!cashier || !selectedStore || !foundUser) return
  
    setError('')
    setOrderLoading(true)
    setSelectedOrderNumber(orderNumber)
  
    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        store_id: String(selectedStore.store_id),
        device_id: 'web',
      })
  
      const res = await apiFetch(`${API_BASE}/cashier/orders/${orderNumber}?${params.toString()}`)
  
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось открыть заказ')
      }
  
      const data = await res.json()
      const normalizedData = mapParitetOrderToFrontResponse(data, foundUser, selectedStore)

      setOrderDetails(normalizedData)
  
    } catch (e: any) {
      setError(e.message || 'Ошибка открытия заказа')
    } finally {
      setOrderLoading(false)
    }
  }

  async function openReceipt(orderNumber?: number) {
    if (!cashier || !selectedStore) return

    const targetOrderNumber = orderNumber ?? orderDetails?.order.order_number

    if (!targetOrderNumber) {
      setError('Заказ не выбран')
      return
    }

    setReceiptDialogOpen(true)
    setReceiptLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        store_id: String(selectedStore.store_id),
      })

      const res = await apiFetch(
        `${API_BASE}/cashier/orders/${targetOrderNumber}/receipt?${params.toString()}`
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось загрузить чек')
      }

      const data: OrderReceiptResponse = await res.json()
      setReceiptData(data)
    } catch (e: any) {
      setReceiptData(null)
      setError(e.message || 'Ошибка загрузки чека')
    } finally {
      setReceiptLoading(false)
    }
  }

  async function closeOrderScreen() {
    if (cashier && orderDetails && orderDetails.order.status === 'in_progress') {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account),
        device_id: 'web',
      })

      await apiFetch(
        `${API_BASE}/cashier/orders/${orderDetails.order.order_number}/unlock?${params.toString()}`,
        { method: 'POST' }
      ).catch(() => null)
    }

    setOrderPaymentQrDialog(null)
    setOrderPaymentMessage('')

    const keepOrderNumber = orderDetails?.order.order_number ?? null
    setOrderDetails(null)
    await refreshCurrentUser(keepOrderNumber)
  }

  async function unlockCurrentOrderIfNeeded() {
    const currentCashier = cashier
    const currentOrderDetails = orderDetails

    if (!currentCashier || !currentOrderDetails || currentOrderDetails.order.status !== 'in_progress') {
      return
    }

    const params = new URLSearchParams({
      cashier_account: String(currentCashier.cashier_account),
      device_id: 'web',
    })

    await apiFetch(
      `${API_BASE}/cashier/orders/${currentOrderDetails.order.order_number}/unlock?${params.toString()}`,
      { method: 'POST' }
    ).catch(() => null)
  }

  function clearWorkplaceState() {
    clearStoredStoreId()
    setSelectedStore(null)
    setSearchQuery('')
    setFoundUser(null)
    setOrders([])
    setStoreState(null)
    setSelectedOrderNumber(null)
    setOrderDetails(null)
    setError('')

    setCashTopupAmount('')

    setItemPickerOpen(false)
    setItemSearchQuery('')
    setStoreItems([])
    setItemCategories([])
    setSelectedItemCategory('')
    setSelectedItemSubcategory('')
    setQuickItemCode('')

    setQtyDialogLine(null)
    setQtyDraft('')

    setSbpDialogOpen(false)
    setSbpAmount('')
    setSbpMessage('')
    setOrderPaymentQrDialog(null)
    setOrderPaymentMessage('')

    setNewUserDialogOpen(false)
    setNewUserForm({
      user_fam: '',
      user_name: '',
      user_otch: '',
      date_of_birth: '',
      address: '',
      email: '',
      user_phone: '',
    })

    setStockDialogOpen(false)
    setStockMessage('')
    setStockForm({
      item: '',
      qty_delta: '',
      comment: '',
    })
    setStockSearchQuery('')
    setStockSearchItems([])

    setStockViewDialogOpen(false)
    setStockViewQuery('')
    setStockViewItems([])
  }

  async function switchStore() {
    await unlockCurrentOrderIfNeeded()
    clearWorkplaceState()
  }

  async function logoutCashier() {
    await unlockCurrentOrderIfNeeded()
    clearWorkplaceState()

    clearStoredSessionId()

    setCashier(null)
    setStores([])
    setSessionId('')
    setCashierPasswd('')
  }

  async function saveOrder() {
    if (!cashier || !selectedStore || !orderDetails || !foundUser) return

    const userId = Number(foundUser.user_id || 0)

    if (!userId) {
      setError('Не удалось сохранить заказ: в данных пайщика нет user_id')
      return
    }

    const payloadLines = (orderDetails.lines || []).map((line) => ({
      item: line.item,
      qty_final: Number(line.qty_final || 0),
    }))

    if (!payloadLines.length) {
      setError('Не удалось сохранить заказ: нет строк заказа')
      return
    }

    setSaveLoading(true)
    setError('')

    try {
      const currentOrderNumber = Number(orderDetails.order.order_number || 0)

      const res = await apiFetch(
        `${API_BASE}/cashier/orders/${currentOrderNumber}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Backend save endpoint currently requires an int, but Paritet save logic does not use it.
            // /cashier/search may return cashier.cashier_account = null, so keep payload valid.
            cashier_account: toSafeInt(cashier.cashier_account, 0),
            store_id: selectedStore.store_id,
            user_id: userId,
            lines: payloadLines,
            device_id: 'web',
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось сохранить заказ'))
      }

      const saved = await res.json()
      const savedOrderNumber = Number(saved?.order_number || saved?.order?.order_number || currentOrderNumber)

      if (!savedOrderNumber) {
        throw new Error('Заказ сохранён, но сервер не вернул номер заказа')
      }

      setSelectedOrderNumber(savedOrderNumber)
      setOrderDetails(mapParitetOrderToFrontResponse(saved, foundUser, selectedStore))

      await refreshCurrentUser(savedOrderNumber)
      await openOrder(savedOrderNumber)
    } catch (e: any) {
      setError(e.message || 'Ошибка сохранения заказа')
    } finally {
      setSaveLoading(false)
    }
  }

  async function loadStoreItems(
    query = itemSearchQuery,
    _category = selectedItemCategory,
    _subcategory = selectedItemSubcategory
  ) {
    if (!cashier || !selectedStore) return

    const normalizedQuery = query.trim()

    setItemsLoading(true)
    setError('')

    try {
      const params = buildItemSearchParams(normalizedQuery)
      const queryString = params.toString()
      const searchUrl = `${API_BASE}/cashier/items/search${queryString ? `?${queryString}` : ''}`

      console.debug('[cashier-items-search]', {
        query: normalizedQuery,
        searchParam: getItemSearchParam(normalizedQuery),
        url: searchUrl,
        store_id: selectedStore.store_id,
      })

      const res = await apiFetch(searchUrl, {
        headers: {
          store_id: String(selectedStore.store_id),
          'store-id': String(selectedStore.store_id),
        },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось загрузить товары')
      }

      const data = await res.json()
      const goods = extractParitetGoods(data)

      setStoreItems(goods.map(mapParitetProductToStoreItem))
      setItemCategories([])
    } catch (e: any) {
      setStoreItems([])
      setError(e.message || 'Ошибка загрузки товаров')
    } finally {
      setItemsLoading(false)
    }
  }

  async function openItemPicker() {
    setItemPickerOpen(true)
    setItemSearchQuery('')
    setSelectedItemCategory('')
    setSelectedItemSubcategory('')
    setStoreItems([])
    setItemCategories([])
    await loadStoreItems('', '', '')
  }

  useEffect(() => {
    if (!itemPickerOpen) return

    const timer = window.setTimeout(() => {
      void loadStoreItems(itemSearchQuery, selectedItemCategory, selectedItemSubcategory)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [itemPickerOpen, itemSearchQuery, selectedItemCategory, selectedItemSubcategory])

  function updateOrderLinesLocally(updater: (lines: OrderLine[]) => OrderLine[]) {
    setOrderDetails((prev) => {
      if (!prev) return prev

      const nextLines = updater(prev.lines || [])
      const nextOrderSum = nextLines
        .filter((line) => Number(line.qty_final || 0) > 0)
        .reduce((sum, line) => sum + toNumber(line.line_sum, 0), 0)

      return {
        ...prev,
        order: {
          ...prev.order,
          order_sum: nextOrderSum,
        },
        lines: nextLines,
      }
    })
  }

  async function searchQuickItems(query: string) {
    if (!cashier || !selectedStore || !orderDetails) return

    const normalizedQuery = query.trim()

    if (!normalizedQuery) {
      setQuickItemMatches([])
      setQuickItemDropdownOpen(false)
      return
    }

    // Для текстового поиска не дергаем backend на одном символе. Для числового ID/ШК можно искать сразу.
    if (!/^\d+$/.test(normalizedQuery) && normalizedQuery.length < 2) {
      setQuickItemMatches([])
      setQuickItemDropdownOpen(false)
      return
    }

    setQuickItemSearchLoading(true)

    try {
      const params = buildItemSearchParams(normalizedQuery)
      const queryString = params.toString()
      const searchUrl = `${API_BASE}/cashier/items/search${queryString ? `?${queryString}` : ''}`

      console.debug('[cashier-quick-item-search]', {
        query: normalizedQuery,
        searchParam: getItemSearchParam(normalizedQuery),
        url: searchUrl,
        store_id: selectedStore.store_id,
      })

      const res = await apiFetch(searchUrl, {
        headers: {
          store_id: String(selectedStore.store_id),
          'store-id': String(selectedStore.store_id),
        },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось найти товар')
      }

      const data = await res.json()
      const goods = extractParitetGoods(data)
      const mappedItems = goods.map(mapParitetProductToStoreItem)

      setQuickItemMatches(mappedItems)
      setQuickItemDropdownOpen(mappedItems.length > 0)
    } catch (e: any) {
      setQuickItemMatches([])
      setQuickItemDropdownOpen(false)
      setError(e.message || 'Ошибка поиска товара')
    } finally {
      setQuickItemSearchLoading(false)
    }
  }

  useEffect(() => {
    if (!orderDetails || orderDetails.readonly) {
      setQuickItemMatches([])
      setQuickItemDropdownOpen(false)
      return
    }

    const normalizedQuery = quickItemCode.trim()

    if (!normalizedQuery) {
      setQuickItemMatches([])
      setQuickItemDropdownOpen(false)
      return
    }

    const timer = window.setTimeout(() => {
      void searchQuickItems(normalizedQuery)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [quickItemCode, selectedStore?.store_id, orderDetails?.order.order_number, orderDetails?.readonly])

  async function addQuickItemToCurrentOrder(item: StoreItem) {
    await addItemToCurrentOrder(item, { keepSearchOpen: false })
    setQuickItemCode('')
    setQuickItemMatches([])
    setQuickItemDropdownOpen(false)
  }

  async function addItemToCurrentOrder(item: StoreItem, options: { keepSearchOpen?: boolean } = {}) {
    if (!orderDetails) return

    setItemsLoading(true)
    setError('')

    try {
      updateOrderLinesLocally((lines) => {
        const existingIndex = lines.findIndex((line) => line.item === item.item || line.good_id === item.item)

        if (existingIndex >= 0) {
          return lines.map((line, index) => {
            if (index !== existingIndex) return line

            const step = line.item_type === 'piece' ? 1 : 1
            const nextQty = toNumber(line.qty_final, 0) + step
            return recalcOrderLine(line, nextQty)
          })
        }

        return [...lines, mapStoreItemToOrderLine(item)]
      })

      if (options.keepSearchOpen !== false) {
        await loadStoreItems(itemSearchQuery)
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка добавления товара')
    } finally {
      setItemsLoading(false)
    }
  }

  async function handleAddButton() {
    if (quickItemCode.trim()) {
      setQuickItemDropdownOpen(true)
      if (quickItemMatches.length === 1 && /^\d+$/.test(quickItemCode.trim())) {
        await addQuickItemToCurrentOrder(quickItemMatches[0])
      } else if (quickItemMatches.length === 0) {
        await searchQuickItems(quickItemCode)
      }
      return
    }

    await openItemPicker()
  }

  function openQtyDialog(line: OrderLine) {
    if (!orderDetails || orderDetails.readonly) return

    setDeleteLineConfirmOpen(false)
    setDeleteLineDialogLine(null)
    setSwipeAnimatingLineId(null)
        setSwipeCommitX(0)
    setDeleteLineConfirmOpen(false)
    setDeleteLineDialogLine(null)
    setSwipeAnimatingLineId(null)
    setQtyDialogLine(line)
    setQtyDraft(String(line.qty_final))
    setQtyCaretIndex(String(line.qty_final).length)
  }

  function handleLinePointerDown(e: any, line: OrderLine) {
    if (!orderDetails || orderDetails.readonly || deleteLineConfirmOpen) return

    lineSwipeRef.current = {
      lineId: getOrderLineUiId(line),
      startX: e.clientX,
      startY: e.clientY,
    }

    setSwipeAnimatingLineId(null)
    setSwipeDragLineId(getOrderLineUiId(line))
    setSwipeDragX(0)

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Pointer capture может быть недоступен на части браузеров.
    }
  }

  function handleLinePointerMove(e: any, line: OrderLine) {
    const swipe = lineSwipeRef.current

    if (!swipe || swipe.lineId !== getOrderLineUiId(line)) {
      return
    }

    const deltaX = e.clientX - swipe.startX
    const deltaY = e.clientY - swipe.startY

    if (Math.abs(deltaY) > 70 && Math.abs(deltaY) > Math.abs(deltaX)) {
      setSwipeDragLineId(null)
      setSwipeDragX(0)
      lineSwipeRef.current = null
      return
    }

    const nextX = Math.max(0, Math.min(deltaX, 170))
    setSwipeDragX(nextX)

    if (nextX > 8) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function handleLinePointerUp(e: any, line: OrderLine) {
    const swipe = lineSwipeRef.current

    if (!swipe || swipe.lineId !== getOrderLineUiId(line)) {
      setSwipeDragLineId(null)
      setSwipeDragX(0)
      lineSwipeRef.current = null
      return
    }

    const deltaX = e.clientX - swipe.startX
    const deltaY = e.clientY - swipe.startY

    lineSwipeRef.current = null

    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // Не критично.
    }

    if (deltaX > 95 && Math.abs(deltaY) < 65) {
      e.preventDefault()
      e.stopPropagation()

      const commitX = Math.max(0, Math.min(deltaX, 220))

      swipedLineIdRef.current = getOrderLineUiId(line)
      setSwipeCommitX(commitX)
      setSwipeDragLineId(null)
      setSwipeDragX(0)
      setSwipeAnimatingLineId(getOrderLineUiId(line))

      window.setTimeout(() => {
        setSwipeAnimatingLineId(null)
      setSwipeCommitX(0)
        setQtyDialogLine(null)
        setDeleteLineDialogLine(line)
        setQtyDraft(String(line.qty_final))
        setDeleteLineConfirmOpen(true)
      }, 260)

      return
    }

    setSwipeDragLineId(null)
    setSwipeDragX(0)
  }

  function handleLinePointerCancel() {
    lineSwipeRef.current = null
    setSwipeDragLineId(null)
    setSwipeDragX(0)
  }

  function handleLineRowClick(line: OrderLine) {
    if (swipedLineIdRef.current === getOrderLineUiId(line)) {
      swipedLineIdRef.current = null
      return
    }

    if (deleteLineConfirmOpen) {
      return
    }

    openQtyDialog(line)
  }

  function changeQtyDraft(delta: number) {
    if (!qtyDialogLine) return

    const current = Number(qtyDraft || 0)
    const step = qtyDialogLine.item_type === 'piece' ? 1 : 0.001
    const next = Math.max(0, current + delta * step)

    const nextValue = qtyDialogLine.item_type === 'piece'
      ? String(Math.round(next))
      : next.toFixed(3)

    setQtyDraft(nextValue)
    setQtyCaretIndex(nextValue.length)
  }

  function normalizeQtyValue(value: string) {
    if (!qtyDialogLine) return value

    if (qtyDialogLine.item_type === 'piece') {
      return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || ''
    }

    let cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '')
    const dotIndex = cleaned.indexOf('.')

    if (dotIndex !== -1) {
      cleaned =
        cleaned.slice(0, dotIndex + 1) +
        cleaned.slice(dotIndex + 1).replace(/\./g, '')
    }

    cleaned = cleaned.replace(/^0+(?=\d)/, '')

    return cleaned
  }

  function insertQtyText(valueToInsert: string) {
    if (!qtyDialogLine || qtySaving) return

    const current = String(qtyDraft || '')
    const caret = Math.max(0, Math.min(qtyCaretIndex, current.length))

    if (qtyDialogLine.item_type === 'piece' && valueToInsert === '.') {
      return
    }

    if (qtyDialogLine.item_type === 'weight' && valueToInsert === '.' && current.includes('.')) {
      return
    }

    let insertValue = valueToInsert

    if (qtyDialogLine.item_type === 'weight' && valueToInsert === '.' && current.length === 0) {
      insertValue = '0.'
    }

    let next = current.slice(0, caret) + insertValue + current.slice(caret)

    if (current === '0' && valueToInsert !== '.' && caret === 1) {
      next = valueToInsert
    }

    next = normalizeQtyValue(next)

    const nextCaret = Math.max(0, Math.min(caret + insertValue.length, next.length))

    setQtyDraft(next)
    setQtyCaretIndex(nextCaret)
  }

  function appendQtyDigit(digit: string) {
    insertQtyText(digit)
  }

  function appendQtyDot() {
    insertQtyText('.')
  }

  function backspaceQtyDraft() {
    if (qtySaving) return

    const current = String(qtyDraft || '')
    const caret = Math.max(0, Math.min(qtyCaretIndex, current.length))

    if (caret <= 0) {
      return
    }

    const next = current.slice(0, caret - 1) + current.slice(caret)

    setQtyDraft(next)
    setQtyCaretIndex(caret - 1)
  }

  function clearQtyDraft() {
    if (qtySaving) return

    setQtyDraft('')
    setQtyCaretIndex(0)
  }

  async function saveQtyDraft() {
    if (!orderDetails || !qtyDialogLine) return

    const nextQty = Number(qtyDraft)

    if (!Number.isFinite(nextQty) || nextQty < 0) {
      setError('Введите корректное количество')
      return
    }

    setQtySaving(true)
    setError('')

    try {
      const targetLineId = getOrderLineUiId(qtyDialogLine)

      updateOrderLinesLocally((lines) =>
        lines.map((line) =>
          getOrderLineUiId(line) === targetLineId
            ? recalcOrderLine(line, nextQty)
            : line
        )
      )

      setQtyDialogLine(null)
      setQtyDraft('')
    } catch (e: any) {
      setError(e.message || 'Ошибка изменения количества')
    } finally {
      setQtySaving(false)
    }
  }

  function confirmDeleteQtyLineFromButton(lineArg?: OrderLine | null) {
    if (deleteLineTapLockRef.current || qtySaving) return

    deleteLineTapLockRef.current = true

    void deleteQtyLine(lineArg).finally(() => {
      window.setTimeout(() => {
        deleteLineTapLockRef.current = false
      }, 300)
    })
  }

  async function deleteQtyLine(lineArg?: OrderLine | null) {
    const lineToDelete = lineArg || deleteLineDialogLine || qtyDialogLine

    if (!orderDetails || !lineToDelete) return

    setQtySaving(true)
    setError('')

    try {
      const targetLineId = getOrderLineUiId(lineToDelete)

      updateOrderLinesLocally((lines) =>
        lines.map((line) =>
          getOrderLineUiId(line) === targetLineId
            ? recalcOrderLine(line, 0)
            : line
        )
      )

      setDeleteLineConfirmOpen(false)
      setDeleteLineDialogLine(null)
      setSwipeAnimatingLineId(null)
      setQtyDialogLine(null)
      setQtyDraft('')
    } catch (e: any) {
      setError(e.message || 'Ошибка удаления товара')
    } finally {
      setQtySaving(false)
    }
  }

  async function generateOrderPaymentQr(orderNumber: number, amount: number, oldBalance: number) {
    if (!selectedStore || !foundUser) return

    const userId = Number(foundUser.user_id || 0)
    if (!userId) {
      throw new Error('Не удалось сформировать QR: в данных пайщика нет user_id')
    }

    const normalizedAmount = Number(amount.toFixed(2))
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error('Не удалось сформировать QR: некорректная сумма пополнения')
    }

    setOrderPaymentQrLoading(true)
    setOrderPaymentMessage('')

    try {
      const params = new URLSearchParams({
        store_id: String(selectedStore.store_id),
        user_id: String(userId),
        amount: String(normalizedAmount),
      })

      const res = await apiFetch(`${API_BASE}/cashier/orders/${orderNumber}/pay?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось сформировать QR пополнения'))
      }

      const data = await res.json()
      const qrBase64 = String(data.qr_base64 || '')

      if (!qrBase64) {
        throw new Error('Сервер не вернул QR-картинку')
      }

      setOrderPaymentQrDialog({
        order_number: orderNumber,
        amount: Number(data.amount || normalizedAmount),
        old_balance: oldBalance,
        qr_base64: qrBase64,
        image_type: String(data.image_type || 'image/png'),
        qr_url: data.qr_url || null,
        ttl: Number(data.ttl || 15),
        created_at: Date.now(),
      })
    } finally {
      setOrderPaymentQrLoading(false)
    }
  }

  async function doneOrder(orderNumber: number) {
    if (!selectedStore) return

    const params = new URLSearchParams({
      store_id: String(selectedStore.store_id),
    })

    const res = await apiFetch(`${API_BASE}/cashier/orders/${orderNumber}/done?${params.toString()}`, {
      method: 'POST',
    })

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(getErrorMessage(data, 'Не удалось провести заказ'))
    }

    const data = await res.json()

    if (!data?.ok) {
      throw new Error(data?.error || 'Не удалось провести заказ')
    }

    return data
  }

  async function payOrder() {
    if (!cashier || !selectedStore || !orderDetails || !foundUser) return

    const orderNumber = Number(orderDetails.order.order_number || 0)

    if (!orderNumber) {
      setError('Сначала сохраните новый заказ')
      return
    }

    if (getOrderHasUnsavedChanges(orderDetails)) {
      setError('Сначала сохраните изменения заказа')
      return
    }

    const orderSum = Number(orderDetails.order.order_sum || 0)

    if (!Number.isFinite(orderSum) || orderSum <= 0) {
      setError('Некорректная сумма заказа')
      return
    }

    setPayLoading(true)
    setError('')
    setOrderPaymentMessage('')

    try {
      const searchData = await fetchCurrentShareholderData(foundUser.user_account)
      applySearchResponse(searchData, orderNumber)

      const freshBalance = Number(searchData.user.balance || 0)

      if (freshBalance >= orderSum) {
        try {
          await doneOrder(orderNumber)
        } catch (doneError: any) {
          const message = doneError?.message || 'Не удалось провести заказ'

          if (isInsufficientFundsError(message)) {
            await generateOrderPaymentQr(orderNumber, orderSum, freshBalance)
            setOrderPaymentMessage(message)
            return
          }

          throw doneError
        }

        await refreshCurrentUser(null, { updateCashierStatus: false })
        await fetchStatus()
		setOrderPaymentQrDialog(null)
        setOrderDetails(null)
        setSelectedOrderNumber(null)
        setOrderPaymentMessage('Заказ оплачен')
        return
      }

      await generateOrderPaymentQr(orderNumber, orderSum, freshBalance)
    } catch (e: any) {
      const message = e.message || 'Ошибка оплаты заказа'

      if (isInsufficientFundsError(message)) {
        setOrderPaymentMessage(message)
      } else {
        setError(message)
      }
    } finally {
      setPayLoading(false)
    }
  }


  function closeOrderPaymentQrDialog() {
    setOrderPaymentQrDialog(null)
    setOrderPaymentQrLoading(false)
  }

  useEffect(() => {
    if (!orderPaymentQrDialog || !foundUser) return

    const ttlMs = Math.max(1, Number(orderPaymentQrDialog.ttl || 15)) * 60 * 1000
    let stopped = false

    const pollBalance = async () => {
      if (stopped || !orderPaymentQrDialog || !foundUser) return

      const elapsed = Date.now() - orderPaymentQrDialog.created_at
      if (elapsed >= ttlMs) {
        setOrderPaymentQrDialog(null)
        setOrderPaymentMessage('Время действия QR истекло. При необходимости сформируйте новый QR.')
        return
      }

      try {
        const data = await fetchCurrentShareholderData(foundUser.user_account)
        applySearchResponse(data, orderPaymentQrDialog.order_number)

        const newBalance = Number(data.user.balance || 0)
        if (newBalance > Number(orderPaymentQrDialog.old_balance || 0)) {
          setOrderPaymentQrDialog(null)
          setOrderPaymentMessage('Баланс покупателя обновлён. Можно повторно нажать «Оплатить».')
        }
      } catch (e) {
        console.error('Ошибка проверки баланса покупателя по QR', e)
      }
    }

    const timer = window.setInterval(pollBalance, 30000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [orderPaymentQrDialog, foundUser?.user_account, cashier, selectedStore])

  function appendSbpAmountValue(value: string) {
    setSbpAmount((current) => {
      const raw = String(current || '').replace(',', '.').replace(/[^0-9.]/g, '')

      if (value === '.' && raw.includes('.')) {
        return raw
      }

      if (value === '.' && !raw) {
        return '0.'
      }

      const next = `${raw}${value}`
      const dotIndex = next.indexOf('.')

      if (dotIndex === -1) {
        return next.replace(/^0+(?=\d)/, '') || value
      }

      return (
        next.slice(0, dotIndex + 1) +
        next.slice(dotIndex + 1).replace(/\./g, '')
      ).replace(/^0+(?=\d)/, '')
    })
  }

  function backspaceSbpAmount() {
    setSbpAmount((current) => String(current || '').slice(0, -1))
  }

  function clearSbpAmount() {
    setSbpAmount('')
  }

  // SBP dialog autofocus and tablet keypad
  useEffect(() => {
    if (!sbpDialogOpen) {
      if (mainKeypadTarget === 'sbpTopup') {
        setMainKeypadTarget(null)
      }

      return
    }

    const timer = window.setTimeout(() => {
      sbpAmountInputRef.current?.focus({ preventScroll: true })

      if (shouldUseTouchKeypad()) {
        setMainKeypadTarget('sbpTopup')
      }
    }, 80)

    return () => {
      window.clearTimeout(timer)
    }
  }, [sbpDialogOpen, screenProfile])

  async function sbpTopupStub() {
    if (!cashier || !selectedStore) return

    const targetUserAccount = orderDetails?.order.user_account ?? foundUser?.user_account

    if (!targetUserAccount) {
      setError('Сначала найдите пайщика')
      return
    }

    setSbpLoading(true)
    setError('')

    try {
      const res = await apiFetch(`${API_BASE}/cashier/topup/sbp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_account: cashier.cashier_account,
          store_id: selectedStore.store_id,
          user_account: targetUserAccount,
          amount: Number(sbpAmount),
          device_id: 'web',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось пополнить П/С')
      }

      const data = await res.json()

      setSbpDialogOpen(false)
      setSbpMessage('')

      if (orderDetails) {
        await openOrder(orderDetails.order.order_number)
      } else {
        setFoundUser((prev) =>
          prev
            ? {
                ...prev,
                balance: data.user_balance_after,
              }
            : prev
        )
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка СБП-пополнения')
    } finally {
      setSbpLoading(false)
    }
  }


  if (selectedStore && cashier && orderDetails) {
    const order = orderDetails.order
    const fio = `${order.user_fam ?? ''} ${order.user_name ?? ''} ${order.user_otch ?? ''}`.trim()
    const activeOrderLines = (orderDetails.lines || []).filter((line) => Number(line.qty_final || 0) > 0)

    return (
      <div className="app">
        <header className="topbar orderTopbar" onPointerUp={handleTopbarPointerUp}>
          <div className="topbarLeft">
            <button className="menuButton" onClick={() => setSideMenuOpen(true)} aria-label="Открыть меню">
              ☰
            </button>
            <div>
              <div className="title">{order.order_number > 0 ? `Заказ № ${order.order_number}` : 'Новый заказ'}</div>
              <div className="subtitle">
                Кассир: {cashier.cashier_account} · ТВТ: {selectedStore.store_name} · Сессия: {sessionId.slice(0, 8)}
              </div>
            </div>
          </div>
          <button className="secondary" onClick={closeOrderScreen}>
            Назад к пайщику
          </button>
        </header>

        {renderSideMenu()}

        <main className="orderScreen">
          <section className="orderMain">
            <div className="orderTop">
              <div className="orderTopLeft">
                <h2>{fio || `Пайщик ${order.user_account}`}</h2>
                <p className="muted">
                  П/С: {order.user_account} · Телефон: {order.user_phone ?? '—'}
                </p>
              </div>

              <div className="orderSummary orderSummaryCompact">
                <div>
                  <span>Баланс пайщика</span>
                  <b>{formatMoney(order.user_balance)}</b>
                </div>
                <div>
                  <span>П/С владельца ТВТ</span>
                  <b>{formatMoney(ownerBalance)}</b>
                </div>
                <div>
                  <span>Нал. в кассе</span>
                  <b>{formatMoney(cashBalance)}</b>
                </div>
                <div>
                  <span>Лимит</span>
                  <b>{formatMoney(orderDetails.store.cash_limit)}</b>
                </div>
              </div>

              <div className="orderStatusBox">
                <span>{order.status_label}</span>
                <b>{formatMoney(order.order_sum)}</b>
              </div>
            </div>

            {error && <div className="error">{error}</div>}
            {orderPaymentMessage && <div className="notice">{orderPaymentMessage}</div>}

            {activeOrderLines.length === 0 ? (
              <div className="emptyOrder">
                В заказе пока нет товаров
              </div>
            ) : (
              <div className="linesTable">
                <div className="lineHeader">
                  <span>Товар</span>
                  <span>Кол-во</span>
                  <span>Цена</span>
                  <span>Сумма</span>
                </div>

                {activeOrderLines.map((line) => (
                  <button
                    className={[
                      'lineRow',
                      line.item_type === 'weight' ? 'weightLineRow' : '',
                      isOrderLineUnsaved(line) ? 'unsavedLineRow' : '',
                      'swipeLineRow',
                      swipeDragLineId === getOrderLineUiId(line) ? 'swipeDragging' : '',
                      swipeAnimatingLineId === getOrderLineUiId(line) ? 'swipeDeleteAnimating' : '',
                    ].filter(Boolean).join(' ')}
                    key={getOrderLineUiId(line)}
                    onPointerDown={(e) => handleLinePointerDown(e, line)}
                    onPointerUp={(e) => handleLinePointerUp(e, line)}
                    onPointerMove={(e) => handleLinePointerMove(e, line)}
                    onPointerCancel={handleLinePointerCancel}
                    style={getOrderLineRowStyle(line, swipeDragLineId, swipeAnimatingLineId, swipeDragX, swipeCommitX)}
                    onClick={() => handleLineRowClick(line)}
                  >
                    <span>
                      <b>{line.item_name}</b>
                      <small>
                        Код {line.item} · {line.item_type === 'weight' ? `Весовой, ${line.pack ?? 'кг'}` : 'Штучный'}
                      </small>
                    </span>
                    <span>{formatQty(line.qty_final, line.item_type)}</span>
                    <span>{formatMoney(line.price)}</span>
                    <span>{formatMoney(line.line_sum)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="quickAddRow" style={{ position: 'relative' }}>
              <label>Товар</label>
              <input
                value={quickItemCode}
                onChange={(e) => {
                  setQuickItemCode(e.target.value)
                  setQuickItemDropdownOpen(true)
                }}
                onFocus={() => {
                  if (quickItemMatches.length > 0) setQuickItemDropdownOpen(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddButton()
                  }
                  if (e.key === 'Escape') {
                    setQuickItemDropdownOpen(false)
                  }
                }}
                inputMode="text"
                placeholder="Введите ID, штрихкод или название товара"
                disabled={orderDetails.readonly}
                autoComplete="off"
              />
              <button className="primary" onClick={handleAddButton} disabled={orderDetails.readonly || itemsLoading || quickItemSearchLoading}>
                {quickItemCode.trim() ? 'Показать' : 'Выбрать товар'}
              </button>

              {quickItemCode.trim() && quickItemDropdownOpen && (
                <div
                  className="quickItemDropdown"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    zIndex: 50,
                    marginTop: 8,
                    maxHeight: 360,
                    overflowY: 'auto',
                    borderRadius: 16,
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    background: '#fff',
                    boxShadow: '0 18px 45px rgba(0, 0, 0, 0.18)',
                    padding: 8,
                  }}
                >
                  {quickItemSearchLoading && (
                    <div className="emptyBox">Ищем товары...</div>
                  )}

                  {!quickItemSearchLoading && quickItemMatches.length === 0 && (
                    <div className="emptyBox">Товары не найдены</div>
                  )}

                  {!quickItemSearchLoading && quickItemMatches.map((item) => (
                    <button
                      key={item.item}
                      type="button"
                      className="itemCard"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addQuickItemToCurrentOrder(item)}
                      disabled={itemsLoading || item.available_qty <= 0}
                      style={{ width: '100%', textAlign: 'left' }}
                    >
                      <div className="itemPhoto">
                        {item.photo_url ? (
                          <img src={item.photo_url} alt="" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>

                      <div className="itemInfo">
                        <b>{item.item_name}</b>
                        <span>
                          ID {item.item}{item.code ? ` · ШК ${item.code}` : ''} · {item.item_category || 'Без категории'}
                        </span>
                        <span>
                          {item.item_type === 'weight' ? `Весовой · ${item.pack || 'кг'}` : 'Штучный товар'}
                        </span>
                      </div>

                      <div className="itemNumbers">
                        <b>{formatMoney(item.price)}</b>
                        <span>Доступно: {formatQty(item.available_qty, item.item_type)}</span>
                        <span>Добавить</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="orderActions">
              <button className="secondary" onClick={closeOrderScreen}>
                Назад
              </button>
              <button className="primary" disabled={orderDetails.readonly || itemsLoading} onClick={handleAddButton}>
                {itemsLoading && quickItemCode.trim() ? 'Добавляем...' : 'Добавить'}
              </button>
              <button
                className="secondary"
                onClick={saveOrder}
                disabled={orderDetails.readonly || saveLoading}
              >
                {saveLoading ? 'Сохраняем...' : 'Сохранить'}
              </button>
              <button
                className="primary"
                onClick={payOrder}
                disabled={orderDetails.readonly || orderDetails.order.order_number <= 0 || activeOrderLines.length === 0 || payLoading || orderPaymentQrLoading}
              >
                {payLoading || orderPaymentQrLoading ? 'Оплачиваем...' : 'Оплатить'}
              </button>
              <button
                className="secondary"
                onClick={() => openReceipt(orderDetails.order.order_number)}
                disabled={orderDetails.order.order_number <= 0 || activeOrderLines.length === 0}
              >
                Чек
              </button>
            </div>

            {orderPaymentQrDialog && (
              <div className="qtyOverlay">
                <div className="qtyDialog">
                  <div className="qtyDialogHeader">
                    <div>
                      <h2>Пополнение баланса покупателя</h2>
                      <p className="muted">Заказ № {orderPaymentQrDialog.order_number}</p>
                    </div>
                    <button className="secondary" onClick={closeOrderPaymentQrDialog}>
                      Закрыть
                    </button>
                  </div>

                  <div className="qtyDialogBody">
                    {orderPaymentMessage && <div className="notice">{orderPaymentMessage}</div>}

                    <div className="cashTopupConfirmAmount">
                      <span>Сумма к оплате с учетом задолженности</span>
					  <b>{formatMoney(Number(orderPaymentQrDialog.amount || 0) / 100)}</b>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                      <img
                        src={buildQrImageSrc(orderPaymentQrDialog.qr_base64, orderPaymentQrDialog.image_type)}
                        alt="QR для пополнения баланса"
                        style={{ width: 300, height: 300, maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>

                    <p className="muted" style={{ textAlign: 'center', margin: 0 }}>
                      Проверяем баланс покупателя каждые 30 секунд. QR действует {orderPaymentQrDialog.ttl} мин.
                    </p>

                    {orderPaymentQrDialog.qr_url && (
                      <p className="muted" style={{ textAlign: 'center', wordBreak: 'break-all' }}>
                        {orderPaymentQrDialog.qr_url}
                      </p>
                    )}

                    <div className="qtyActions">
                      <button className="secondary" onClick={closeOrderPaymentQrDialog}>
                        Закрыть
                      </button>
                      <button className="primary" onClick={payOrder} disabled={payLoading || orderPaymentQrLoading}>
                        {payLoading || orderPaymentQrLoading ? 'Проверяем...' : 'Повторить оплату'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {receiptDialogOpen && (
              <div className="itemPickerOverlay">
                <div className="receiptDialog">
                  <div className="itemPickerHeader">
                    <div>
                      <h2>Чек заказа</h2>
                      <p className="muted">
                        {receiptData ? `Заказ № ${receiptData.order.order_number}` : 'Загрузка...'}
                      </p>
                    </div>
                    <button className="secondary" onClick={() => setReceiptDialogOpen(false)}>
                      Закрыть
                    </button>
                  </div>

                  {error && <div className="error">{error}</div>}

                  {receiptLoading && <div className="emptyBox">Загружаем чек...</div>}

                  {!receiptLoading && receiptData && (
                    <div className="receiptBody">
                      <div className="receiptHead">
                        <b>Коопторгъ</b>
                        <span>ТВТ: {receiptData.store.store_name}</span>
                        <span>Пайщик: {receiptData.order.user_account}</span>
                        <span>Статус: {receiptData.order.status_label}</span>
                        {receiptData.payment ? (
                          <span>Оплата: {new Date(receiptData.payment.created_at).toLocaleString('ru-RU')}</span>
                        ) : (
                          <span>Оплата: не проведена</span>
                        )}
                      </div>

                      <div className="receiptLines">
                        {receiptData.lines.map((line) => (
                          <div className="receiptLine" key={getOrderLineUiId(line)}>
                            <div>
                              <b>{line.item_name}</b>
                              <span>Код {line.item}</span>
                            </div>
                            <div>{formatQty(line.qty_final, line.item_type)}</div>
                            <div>{formatMoney(line.price)}</div>
                            <div>{formatMoney(line.line_sum)}</div>
                          </div>
                        ))}
                      </div>

                      <div className="receiptTotal">
                        <span>Итого</span>
                        <b>{formatMoney(receiptData.order.order_sum)}</b>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {qtyDialogLine && !deleteLineConfirmOpen && (
              <div className="qtyOverlay">
                <div className="qtyDialog">
                  <div className="qtyDialogHeader">
                    <h2>Выберите количество товара</h2>
                    <button className="secondary" onClick={() => setQtyDialogLine(null)}>
                      Отмена
                    </button>
                  </div>

                  <div className="qtyDialogBody">
                    <div className="qtyProduct">
                      <div className="qtyPhoto">
                        {qtyDialogLine.photo_url ? (
                          <img src={qtyDialogLine.photo_url} alt="" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>

                      <div>
                        <b>{qtyDialogLine.item_name}</b>
                        <p className="muted">
                          Код {qtyDialogLine.item} · {qtyDialogLine.item_type === 'weight' ? `Весовой, ${qtyDialogLine.pack ?? 'кг'}` : 'Штучный'}
                        </p>
                        <p className="muted">
                          Максимум: {formatQty(qtyDialogLine.max_qty_final, qtyDialogLine.item_type)}
                        </p>
                      </div>
                    </div>

                    <div className="qtyControl">
                      <button className="primary qtyBtn" onClick={() => changeQtyDraft(-1)} disabled={qtySaving}>
                        -
                      </button>
                      <button
                        type="button"
                        className="qtyDisplay"
                        aria-label="Количество товара"
                        onClick={() => setQtyCaretIndex(String(qtyDraft || '').length)}
                      >
                        {String(qtyDraft || '0').split('').map((char, index) => (
                          <span
                            key={`${char}-${index}`}
                            className="qtyDigitSlot"
                            onClick={(e) => {
                              e.stopPropagation()

                              if (!qtyDraft) {
                                setQtyCaretIndex(0)
                                return
                              }

                              const rect = e.currentTarget.getBoundingClientRect()
                              const nextIndex = e.clientX - rect.left < rect.width / 2 ? index : index + 1

                              setQtyCaretIndex(nextIndex)
                            }}
                          >
                            {qtyDraft && qtyCaretIndex === index && <span className="qtyCaret" />}
                            {char}
                          </span>
                        ))}
                        {qtyDraft && qtyCaretIndex >= String(qtyDraft).length && <span className="qtyCaret" />}
                        {!qtyDraft && <span className="qtyCaret" />}
                      </button>
                      <button className="primary qtyBtn" onClick={() => changeQtyDraft(1)} disabled={qtySaving}>
                        +
                      </button>
                    </div>

                    <div className="qtyKeypad" aria-label="Цифровая клавиатура количества">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          className="qtyKeyBtn"
                          onClick={() => appendQtyDigit(digit)}
                          disabled={qtySaving}
                        >
                          {digit}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="qtyKeyBtn secondary"
                        onClick={backspaceQtyDraft}
                        disabled={qtySaving}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="qtyKeyBtn"
                        onClick={() => appendQtyDigit('0')}
                        disabled={qtySaving}
                      >
                        0
                      </button>
                      {qtyDialogLine.item_type === 'weight' ? (
                        <button
                          type="button"
                          className="qtyKeyBtn"
                          onClick={appendQtyDot}
                          disabled={qtySaving}
                        >
                          .
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="qtyKeyBtn secondary"
                          onClick={clearQtyDraft}
                          disabled={qtySaving}
                        >
                          C
                        </button>
                      )}
                    </div>

                    <div className="qtySum">
                      Сумма: <b>{formatMoney(Number(qtyDraft || 0) * qtyDialogLine.price)}</b>
                    </div>

                    {error && <div className="error">{error}</div>}

                    <div className="qtyActions">
                      <button
                        className="danger"
                        onClick={() => {
                          setDeleteLineDialogLine(qtyDialogLine)
                          setDeleteLineConfirmOpen(true)
                        }}
                        disabled={qtySaving}
                      >
                        Удалить
                      </button>
                      <button className="secondary" onClick={() => setQtyDialogLine(null)} disabled={qtySaving}>
                        Отмена
                      </button>
                      <button className="primary" onClick={saveQtyDraft} disabled={qtySaving}>
                        ОК
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {deleteLineConfirmOpen && (deleteLineDialogLine || qtyDialogLine) && (
              <div className="qtyOverlay lineDeleteOverlay">
                <div className="lineDeleteDialog" role="dialog" aria-modal="true">
                  <div className="qtyDialogHeader">
                    <div>
                      <h2>Удалить товар?</h2>
                      <p className="muted">{(deleteLineDialogLine || qtyDialogLine)!.item_name}</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        setDeleteLineConfirmOpen(false)
                        setDeleteLineDialogLine(null)
      setSwipeAnimatingLineId(null)
                      }}
                      disabled={qtySaving}
                    >
                      Закрыть
                    </button>
                  </div>

                  <div className="lineDeleteBody">
                    <p>Товар будет удален из заказа, а резерв по этой позиции вернется в доступный остаток.</p>
                    <div className="lineDeleteSummary">
                      <span>Количество</span>
                      <b>{formatQty((deleteLineDialogLine || qtyDialogLine)!.qty_final, (deleteLineDialogLine || qtyDialogLine)!.item_type)}</b>
                    </div>
                  </div>

                  <div className="lineDeleteActions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setDeleteLineConfirmOpen(false)
                        setDeleteLineDialogLine(null)
      setSwipeAnimatingLineId(null)
                      }}
                      disabled={qtySaving}
                    >
                      Отмена
                    </button>
                    <button
                      className="danger"
                      onPointerUp={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        confirmDeleteQtyLineFromButton(deleteLineDialogLine || qtyDialogLine)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      disabled={qtySaving}
                    >
                      {qtySaving ? 'Удаляем...' : 'Удалить товар'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {itemPickerOpen && (
              <div className="itemPickerOverlay">
                <div className="itemPicker">
                  <div className="itemPickerHeader">
                    <div>
                      <h2>Добавить товар</h2>
                      <p className="muted">Автопоиск по штрихкоду или названию</p>
                    </div>
                    <button className="secondary" onClick={() => setItemPickerOpen(false)}>
                      Закрыть
                    </button>
                  </div>

                  <div className="itemSearchRow">
                    <input
                      placeholder="Введите код или название товара"
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                    />
                    <button
                      className="secondary"
                      onClick={() => {
                        setItemSearchQuery('')
                        setSelectedItemCategory('')
                        setSelectedItemSubcategory('')
                        loadStoreItems('', '', '')
                      }}
                    >
                      Очистить
                    </button>
                  </div>

                  {itemCategories.length > 0 && (
                    <div className="categoryPickers">
                    <select
                      value={selectedItemCategory}
                      onChange={(e) => {
                        const category = e.target.value
                        setSelectedItemCategory(category)
                        setSelectedItemSubcategory('')
                        loadStoreItems(itemSearchQuery, category, '')
                      }}
                    >
                      <option value="">Все категории</option>
                      {itemCategories.map((cat) => (
                        <option key={cat.category} value={cat.category}>
                          {cat.category} ({cat.items_count})
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedItemSubcategory}
                      disabled={!selectedItemCategory}
                      onChange={(e) => {
                        const subcategory = e.target.value
                        setSelectedItemSubcategory(subcategory)
                        loadStoreItems(itemSearchQuery, selectedItemCategory, subcategory)
                      }}
                    >
                      <option value="">Все подкатегории</option>
                      {(itemCategories.find((cat) => cat.category === selectedItemCategory)?.subcategories || []).map((sub) => (
                        <option key={sub.subcategory} value={sub.subcategory}>
                          {sub.subcategory} ({sub.items_count})
                        </option>
                      ))}
                    </select>
                    </div>
                  )}

                  {error && <div className="error">{error}</div>}

                  <div className="itemList">
                    {storeItems.length === 0 && (
                      <div className="emptyBox">Товары не найдены</div>
                    )}

                    {storeItems.map((item) => (
                      <button
                        key={item.item}
                        className="itemCard"
                        onClick={() => addItemToCurrentOrder(item)}
                        disabled={itemsLoading || item.available_qty <= 0}
                      >
                        <div className="itemPhoto">
                          {item.photo_url ? (
                            <img src={item.photo_url} alt="" />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>

                        <div className="itemInfo">
                          <b>{item.item_name}</b>
                          <span>
                            Код {item.item} · {item.item_category || 'Без категории'}
                          </span>
                          <span>
                            {item.item_type === 'weight'
                              ? `Весовой · средний вес ${formatQty(item.avg_weight, 'weight')} кг · ${item.pack || 'кг'}`
                              : 'Штучный товар'}
                          </span>
                        </div>

                        <div className="itemNumbers">
                          <b>{formatMoney(item.price)}</b>
                          <span>Остаток: {formatQty(item.item_stock, item.item_type)}</span>
                          <span>Резерв: {formatQty(item.reserve, item.item_type)}</span>
                          <span>Доступно: {formatQty(item.available_qty, item.item_type)}</span>
                          <span>Добавить</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    )
  }

  if (selectedStore && cashier) {
    const activeOrder = orders.find((o) => o.order_number === selectedOrderNumber)
    const total = activeOrder?.order_sum ?? 0

    return (
      <div className="app">
        <header className="topbar" onPointerUp={handleTopbarPointerUp}>
          <div className="topbarLeft">
            <button className="menuButton" onClick={() => setSideMenuOpen(true)} aria-label="Открыть меню">
              ☰
            </button>
            <div>
              <div className="title">Пайщик</div>
              <div className="subtitle">
                Кассир: {cashier.cashier_account} · ТВТ: {selectedStore.store_name} · Сессия: {sessionId.slice(0, 8)}
              </div>
            </div>
          </div>
          <div className="topbarActions">
            <button className="secondary" onClick={openStockViewDialog}>
              Остатки
            </button>
            <button
              className="secondary"
              onClick={() => {
                setStockDialogOpen(true)
                setStockMessage('')
                setError('')
                loadStockSearchItems('')
              }}
            >
              Приход
            </button>
            <button className="secondary" onClick={() => setNewUserDialogOpen(true)}>
              Анкета
            </button>
            <button className="secondary" onClick={switchStore}>
              Сменить ТВТ
            </button>
            <span className="topbarLogoutSpacer" aria-hidden="true">
              Выйти
            </span>
          </div>
        </header>

        {renderSideMenu()}

        {renderMainKeypad()}

        {deleteOrderDialog && (
          <div className="qtyOverlay">
            <div className="confirmDialog" role="dialog" aria-modal="true">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Удалить заказ?</h2>
                  <p className="muted">Заказ № {deleteOrderDialog.order_number}</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setDeleteOrderDialog(null)}
                  disabled={cancelOrderLoading}
                >
                  Закрыть
                </button>
              </div>

              <div className="confirmDialogBody">
                <p>
                  Заказ будет отменен. После подтверждения список заказов пайщика обновится.
                </p>
                <div className="confirmDialogSummary">
                  <span>Сумма заказа</span>
                  <b>{formatMoney(deleteOrderDialog.order_sum)}</b>
                </div>
              </div>

              <div className="confirmDialogActions">
                <button
                  className="secondary"
                  onClick={() => setDeleteOrderDialog(null)}
                  disabled={cancelOrderLoading}
                >
                  Отмена
                </button>
                <button
                  className="danger"
                  onClick={() => handleCancelOrder(deleteOrderDialog.order_number)}
                  disabled={cancelOrderLoading}
                >
                  {cancelOrderLoading ? 'Удаляем...' : 'Удалить заказ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {stockViewDialogOpen && (
          <div className="itemPickerOverlay">
            <div className="itemPicker">
              <div className="itemPickerHeader">
                <div>
                  <h2>Остатки на ТВТ</h2>
                  <p className="muted">Текущий остаток, резерв и доступное количество товара</p>
                </div>
                <button className="secondary" onClick={() => setStockViewDialogOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="stockViewSearchRow">
                <input
                  value={stockViewQuery}
                  onChange={(e) => setStockViewQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadStockViewItems(stockViewQuery)
                    }
                  }}
                  placeholder="Код, название, категория или подкатегория"
                />
                <button
                  className="primary"
                  onClick={() => loadStockViewItems(stockViewQuery)}
                  disabled={stockViewLoading}
                >
                  {stockViewLoading ? 'Ищем...' : 'Найти'}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setStockViewQuery('')
                    loadStockViewItems('')
                  }}
                >
                  Все
                </button>
              </div>

              {error && <div className="error">{error}</div>}

              <div className="stockViewTable">
                <div className="stockViewHeader">
                  <span>Товар</span>
                  <span>Цена</span>
                  <span>Остаток</span>
                  <span>Резерв</span>
                  <span>Доступно</span>
                </div>

                {stockViewItems.length === 0 && (
                  <div className="emptyBox">Товары не найдены</div>
                )}

                {stockViewItems.map((item) => (
                  <div className="stockViewRow" key={item.item}>
                    <div>
                      <b>{item.item_name}</b>
                      <span>
                        Код {item.item} · {item.item_category || 'Без категории'} · {item.item_subcategory || 'Без подкатегории'}
                      </span>
                    </div>
                    <div>{formatMoney(item.price)}</div>
                    <div>{formatQty(item.item_stock, item.item_type)}</div>
                    <div>{formatQty(item.reserve, item.item_type)}</div>
                    <div>
                      <b>{formatQty(item.available_qty, item.item_type)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {stockDialogOpen && (
          <div className="qtyOverlay stockOverlay">
            <div className="newUserDialog stockDialog">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Приход товара на ТВТ</h2>
                  <p className="muted">Остаток товара увеличится на выбранной точке выдачи</p>
                </div>
                <button className="secondary" onClick={() => setStockDialogOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="stockForm">
                <div className="stockInlineRow stockFull">
                  <div className="stockField">
                    <label>Код товара</label>
                    <input
                      value={stockForm.item}
                      onChange={(e) => updateStockField('item', e.target.value)}
                      placeholder="Например 2811"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="stockField">
                    <label>Количество прихода</label>
                    <input
                      value={stockForm.qty_delta}
                      onChange={(e) => updateStockField('qty_delta', e.target.value)}
                      placeholder="Например 1 или 1.250"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="stockSearchBlock stockFull">
                  <label>Поиск товара</label>
                  <div className="stockSearchRow">
                    <input
                      value={stockSearchQuery}
                      onChange={(e) => setStockSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          loadStockSearchItems(stockSearchQuery)
                        }
                      }}
                      placeholder="Введите код, название, категорию или подкатегорию"
                    />
                    <button
                      className="primary"
                      onClick={() => loadStockSearchItems(stockSearchQuery)}
                      disabled={stockSearchLoading}
                    >
                      {stockSearchLoading ? 'Ищем...' : 'Найти'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setStockSearchQuery('')
                        loadStockSearchItems('')
                      }}
                    >
                      Очистить
                    </button>
                  </div>

                  <div className="stockSearchResults">
                    {stockSearchItems.map((item) => (
                      <button
                        key={item.item}
                        className={String(item.item) === stockForm.item ? 'stockSearchItem selected' : 'stockSearchItem'}
                        onClick={() => selectStockItem(item)}
                      >
                        <div>
                          <b>{item.item_name}</b>
                          <span>Код {item.item} · {item.item_category || 'Без категории'}</span>
                        </div>
                        <div>
                          <b>{formatMoney(item.price)}</b>
                          <span>Остаток: {formatQty(item.item_stock, item.item_type)}</span>
                        </div>
                      </button>
                    ))}

                    {stockSearchItems.length === 0 && (
                      <div className="emptyBox">Товары не найдены</div>
                    )}
                  </div>
                </div>

                <label className="stockFull">Комментарий</label>
                <input
                  className="stockFull"
                  value={stockForm.comment}
                  onChange={(e) => updateStockField('comment', e.target.value)}
                  placeholder="Комментарий к приходу"
                />
              </div>

              {stockMessage && <div className="notice">{stockMessage}</div>}
              {error && <div className="error">{error}</div>}

              <div className="newUserActions">
                <button className="secondary" onClick={() => setStockDialogOpen(false)} disabled={stockLoading}>
                  Закрыть
                </button>
                <button className="primary" onClick={stockReceipt} disabled={stockLoading}>
                  {stockLoading ? 'Оприходуем...' : 'Оприходовать'}
                </button>
              </div>
            </div>
          </div>
        )}

        {newUserDialogOpen && (
          <div className="qtyOverlay">
            <div className="newUserDialog">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Анкета нового пайщика</h2>
                  <p className="muted">После сохранения новый пайщик сразу откроется в кассе</p>
                </div>
                <button className="secondary" onClick={() => setNewUserDialogOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="newUserForm">
                <label>Фамилия</label>
                <input
                  value={newUserForm.user_fam}
                  onChange={(e) => updateNewUserField('user_fam', e.target.value)}
                  placeholder="Фамилия"
                />

                <label>Имя</label>
                <input
                  value={newUserForm.user_name}
                  onChange={(e) => updateNewUserField('user_name', e.target.value)}
                  placeholder="Имя"
                />

                <label>Отчество</label>
                <input
                  value={newUserForm.user_otch}
                  onChange={(e) => updateNewUserField('user_otch', e.target.value)}
                  placeholder="Отчество"
                />

                <label>Телефон</label>
                <input
                  value={newUserForm.user_phone}
                  onChange={(e) => updateNewUserField('user_phone', e.target.value)}
                  placeholder="79130000000"
                  inputMode="tel"
                />

                <label>Дата рождения</label>
                <input
                  value={newUserForm.date_of_birth}
                  onChange={(e) => updateNewUserField('date_of_birth', e.target.value)}
                  type="date"
                />

                <label>Email</label>
                <input
                  value={newUserForm.email}
                  onChange={(e) => updateNewUserField('email', e.target.value)}
                  placeholder="email@example.ru"
                />

                <label className="newUserFull">Адрес</label>
                <input
                  className="newUserFull"
                  value={newUserForm.address}
                  onChange={(e) => updateNewUserField('address', e.target.value)}
                  placeholder="Адрес проживания"
                />
              </div>

              {error && <div className="error">{error}</div>}

              <div className="newUserActions">
                <button className="secondary" onClick={() => setNewUserDialogOpen(false)} disabled={newUserLoading}>
                  Отмена
                </button>
                <button className="primary" onClick={createShareholder} disabled={newUserLoading}>
                  {newUserLoading ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {cashTopupConfirmOpen && foundUser && (
          <div className="qtyOverlay cashTopupConfirmOverlay">
            <div className="cashTopupConfirmDialog" role="dialog" aria-modal="true">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Подтвердить пополнение?</h2>
                  <p className="muted">
                    Пополнение П/С наличными
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setCashTopupConfirmOpen(false)}
                  disabled={cashTopupLoading}
                >
                  Закрыть
                </button>
              </div>

              <div className="cashTopupConfirmBody">
                <div className="cashTopupConfirmRow">
                  <span>Пайщик</span>
                  <b>{foundUser.user_account}</b>
                </div>

                <div className="cashTopupConfirmRow">
                  <span>ФИО</span>
                  <b>
                    {`${foundUser.user_fam ?? ''} ${foundUser.user_name ?? ''} ${foundUser.user_otch ?? ''}`.trim() || '—'}
                  </b>
                </div>

                <div className="cashTopupConfirmAmount">
                  <span>Сумма пополнения</span>
                  <b>{formatMoney(Number(cashTopupAmount))}</b>
                </div>

                <p className="cashTopupConfirmHint">
                  После подтверждения сумма будет зачислена на П/С пайщика, а наличные кассира увеличатся.
                </p>

                {error && <div className="error">{error}</div>}

                <div className="cashTopupConfirmActions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCashTopupConfirmOpen(false)}
                    disabled={cashTopupLoading}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={cashTopup}
                    disabled={cashTopupLoading}
                  >
                    {cashTopupLoading ? 'Пополняем...' : 'Подтвердить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {txDialogOpen && (
          <div className="itemPickerOverlay">
            <div className="itemPicker">
              <div className="itemPickerHeader">
                <div>
                  <h2>История П/С</h2>
                  <p className="muted">
                    Пайщик: {foundUser?.user_account ?? '—'}
                  </p>
                </div>
                <button className="secondary" onClick={() => setTxDialogOpen(false)}>
                  Закрыть
                </button>
              </div>

              {error && <div className="error">{error}</div>}

              {txLoading ? (
                <div className="emptyBox">Загружаем историю...</div>
              ) : (
                <div className="txTable">
                  <div className="txHeader">
                    <span>Дата</span>
                    <span>Операция</span>
                    <span>Заказ</span>
                    <span>Изменение</span>
                    <span>Баланс после</span>
                  </div>

                  {txRows.length === 0 && (
                    <div className="emptyBox">Операций по П/С пока нет</div>
                  )}

                  {txRows.map((row) => (
                    <div className={row.amount_delta >= 0 ? 'txRow plus' : 'txRow minus'} key={row.line_id}>
                      <span>{new Date(row.created_at).toLocaleString('ru-RU')}</span>
                      <span>
                        <b>{row.transaction_type_label}</b>
                        <small>{row.line_type_label}</small>
                      </span>
                      <span>{row.order_number ? `№ ${row.order_number}` : '—'}</span>
                      <span>
                        {row.amount_delta > 0 ? '+' : ''}
                        {formatMoney(row.amount_delta)}
                      </span>
                      <span>{formatMoney(row.balance_after)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {sbpDialogOpen && !orderDetails && (
          <div className="qtyOverlay">
            <div className="qtyDialog">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Пополнение П/С через СБП</h2>
                  <p className="muted">Заглушка: сумма будет зачислена на П/С выбранного пайщика с технического счета 9999999</p>
                </div>
                <button className="secondary" onClick={() => setSbpDialogOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="qtyDialogBody">
                {sbpMessage && <div className="notice">{sbpMessage}</div>}

                <label>Сумма пополнения</label>
                <input
                      value={sbpAmount}
                      onChange={(e) => setSbpAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          sbpTopupStub()
                        }
                      }}
                      readOnly={shouldUseTouchKeypad()}
                      inputMode={shouldUseTouchKeypad() ? 'none' : 'decimal'}
                      enterKeyHint="done"
                      placeholder="0.00"
                    />

                    {screenProfile === 'tablet_10' && (
                      <div className="sbpKeypad">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            className="sbpKeyBtn"
                            onClick={() => appendSbpAmountValue(digit)}
                            disabled={sbpLoading}
                          >
                            {digit}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="sbpKeyBtn secondary"
                          onClick={backspaceSbpAmount}
                          disabled={sbpLoading}
                        >
                          ←
                        </button>

                        <button
                          type="button"
                          className="sbpKeyBtn"
                          onClick={() => appendSbpAmountValue('0')}
                          disabled={sbpLoading}
                        >
                          0
                        </button>

                        <button
                          type="button"
                          className="sbpKeyBtn"
                          onClick={() => appendSbpAmountValue('.')}
                          disabled={sbpLoading}
                        >
                          .
                        </button>

                        <div className="sbpKeypadActions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={clearSbpAmount}
                            disabled={sbpLoading}
                          >
                            Очистить
                          </button>

                          <button
                            type="button"
                            className="primary"
                            onClick={sbpTopupStub}
                            disabled={sbpLoading || Number(sbpAmount) <= 0}
                          >
                            {sbpLoading ? 'Пополняем...' : 'Пополнить'}
                          </button>
                        </div>
                      </div>
                    )}

                {error && <div className="error">{error}</div>}

                <div className="qtyActions">
                  <button className="secondary" onClick={() => setSbpDialogOpen(false)} disabled={sbpLoading}>
                    Отмена
                  </button>
                  <button className="primary" onClick={sbpTopupStub} disabled={sbpLoading || Number(sbpAmount) <= 0}>
                    {sbpLoading ? 'Пополняем...' : 'Пополнить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="cashierScreen">
          <section className="leftPanel">
            <div className="avatarBox">
              <div className="avatarCircle">👤</div>
            </div>

            <div className="searchRow">
              <input
                className="bigInput"
                placeholder="№ П/С, телефон или номер заказа"
                value={searchQuery}
                readOnly={shouldUseTouchKeypad()}
                inputMode={shouldUseTouchKeypad() ? 'none' : 'decimal'}
                autoComplete="off"
                enterKeyHint="search"
                onFocus={() => {
                  if (shouldUseTouchKeypad()) setMainKeypadTarget('search')
                }}
                onClick={() => {
                  if (shouldUseTouchKeypad()) setMainKeypadTarget('search')
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') searchUser()
                }}
              />
              <button className="primary" onClick={searchUser} disabled={searchLoading}>
                {searchLoading ? 'Ищем...' : 'Искать'}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setSearchQuery('')
                  setFoundUser(null)
                  setOrders([])
                  setStoreState(null)
                  setSelectedOrderNumber(null)
                  setError('')
                }}
              >
                Очистить
              </button>
            </div>

            {error && <div className="error">{error}</div>}
            {orderPaymentMessage && <div className="notice">{orderPaymentMessage}</div>}
            {orderLoading && <div className="notice">Открываем заказ...</div>}

            <div className="infoGrid">
              <div className="infoField">
                <span>П/С пайщика</span>
                <b>{foundUser?.user_account ?? '—'}</b>
              </div>
              <div className="infoField">
                <span>ФИО</span>
                <b>
                  {foundUser
                    ? `${foundUser.user_fam ?? ''} ${foundUser.user_name ?? ''} ${foundUser.user_otch ?? ''}`.trim()
                    : '—'}
                </b>
              </div>
              <div className="infoField">
                <span>Телефон</span>
                <b>{foundUser?.user_phone ?? '—'}</b>
              </div>
              <div className="infoField">
                <span>Сумма на П/С</span>
                <b>{formatMoney(foundUser?.balance)}</b>
              </div>
            </div>

            <div className="bottomActions">
              <div className="sumBox">
                <label>Сумма пополнения</label>
                <input
                  value={cashTopupAmount}
                  onChange={(e) => setCashTopupAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!cashTopupConfirmOpen) {
                        openCashTopupConfirm()
                      }
                    }
                  }}
                  onFocus={() => {
                    if (shouldUseTouchKeypad()) setMainKeypadTarget('cashTopup')
                  }}
                  onClick={() => {
                    if (shouldUseTouchKeypad()) setMainKeypadTarget('cashTopup')
                  }}
                  placeholder="Сумма наличными"
                  readOnly={shouldUseTouchKeypad()}
                  inputMode={shouldUseTouchKeypad() ? 'none' : 'decimal'}
                  enterKeyHint="done"
                />
              </div>
              <button
                className="secondary"
                onClick={openCashTopupConfirm}
                disabled={!foundUser || cashTopupLoading}
              >
                {cashTopupLoading ? 'Пополняем...' : 'Пополнить'}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (!foundUser) {
                    setError('Сначала найдите пайщика')
                    return
                  }
                  setSbpAmount('')
                  setSbpMessage('СБП-заглушка для пополнения П/С пайщика')
                  setSbpDialogOpen(true)
                }}
              >
                СБП
              </button>
              <button
                className="secondary"
                onClick={openTransactionsDialog}
                disabled={!foundUser}
              >
                История П/С
              </button>
            </div>
          </section>

          <section className="rightPanel">
            <div className="balanceStrip">
              <div>
                <span>П/С владельца ТВТ</span>
                <b>{formatMoney(ownerBalance)}</b>
              </div>
              <div>
                <span>Нал. в кассе</span>
                <b>{formatMoney(cashBalance)}</b>
              </div>
              <div>
                <span>Лимит</span>
                <b>{formatMoney(storeState?.cash_limit)}</b>
              </div>
            </div>

            <div className="ordersHeader">
              <div>
                <h2>Заказы пайщика</h2>
                <button
                  className="primary smallButton"
                  onClick={createOrder}
                  disabled={!foundUser || searchLoading}
                >
                  Создать заказ
                </button>
              </div>
              <div className="totalBox">
                Итого: <b>{formatMoney(total)}</b>
              </div>
            </div>

            <div className="ordersList">
              {orders.length === 0 && (
                <div className="emptyBox">Заказы не найдены</div>
              )}

              {orders.map((order) => (
                <div
                  key={order.order_number}
                  className={[
                    order.order_number === selectedOrderNumber ? 'orderCard selected' : 'orderCard',
                    isOrderCancelable(order) ? 'orderCardSwipeable' : '',
                    orderSwipeDragNumber === order.order_number ? 'orderCardSwiping' : '',
                  ].filter(Boolean).join(' ')}
                  style={getOrderCardSwipeStyle(order.order_number, orderSwipeDragNumber, orderSwipeDragX)}
                  onPointerDown={(e) => handleOrderPointerDown(e, order)}
                  onPointerMove={(e) => handleOrderPointerMove(e, order)}
                  onPointerUp={(e) => handleOrderPointerUp(e, order)}
                  onPointerCancel={handleOrderPointerCancel}
                  onClick={() => handleOrderCardClick(order)}
                  role="button"
                  tabIndex={0}
                  title={isOrderCancelable(order) ? 'Свайп вправо или влево — удалить заказ' : undefined}
                >
                  <div>
                    <b>Заказ № {order.order_number}</b>
                    <span>{order.status_label}</span>
                  </div>
                  <div className="orderCardRight">
                    <div className="orderCardAmountRow">
                      <b>{formatMoney(order.order_sum)}</b>
                    </div>
                    <span>{order.delivery_date || 'без даты'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (cashier) {
    return (
      <div className="app">
        <div className="centerBox">
          <div className="panel wide">
            <h1>Выбор точки выдачи</h1>
            <p className="muted">
              Кассир: {cashier.user_fam} {cashier.user_name} {cashier.user_otch} · {cashier.cashier_account}
            </p>

            <div className="storeList">
              {stores.map((store) => (
                <button
                  key={store.store_id}
                  className="storeButton"
                  onClick={() => selectStore(store)}
                >
                  <span className="storeName">{store.store_name}</span>
                  <span className="storeAddress">{store.store_address || 'Адрес не указан'}</span>
                  <span className="storeMeta">
                    ТВТ {store.store_id} · Владелец {store.owner_account ?? '—'}
                  </span>
                </button>
              ))}
            </div>

            <button className="secondary full" onClick={logoutCashier}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="centerBox">
        <div className="panel loginPanel">
          <img className="loginIntroImage" src={introImage} alt="Коопторгъ" />

          <label>Логин кассира</label>
          <input
            value={cashierAccount}
            onChange={(e) => setCashierAccount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login()
            }}
            type="text"
            autoComplete="username"
            name="cashier_login"
          />

          <label>Пароль</label>
          <input
            value={cashierPasswd}
            onChange={(e) => setCashierPasswd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login()
            }}
            type="password"
            autoComplete="new-password"
            name="cashier_passwd_no_autofill"
          />

          {error && <div className="error">{error}</div>}

          <button className="primary full" onClick={login} disabled={loading}>
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
