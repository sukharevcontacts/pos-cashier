import { useEffect, useRef, useState } from 'react'
import introImage from './assets/intro.jpg'
import './styles.css'

type ScreenProfile = 'auto' | 'tablet_10'
type MainKeypadTarget = 'search' | 'cashTopup' | 'sbpTopup' | 'cashoutPin' | null
type SearchInputSource = 'main' | 'keypad'
type TextSelectionRange = { start: number; end: number }
type SideMenuTab = 'root' | 'shareholder' | 'stock' | 'chats' | 'reports' | 'settings'

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
  default_warehouse?: number | null
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
  if (data.detail?.error) return String(data.detail.error)
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

type CashQrDialog = {
  amount: number
  old_balance: number
  qr_base64: string
  image_type: string
  qr_url: string | null
  ttl: number
  created_at: number
}

type CashoutCheckDialog = {
  amount: number
  amountwithcomission: number
  customerbalance: number
  cashierbalance: number
  moneyincashbox: number
}

type CashSuccessDialog = {
  title: string
  text: string
  customerbalance?: number
  cashierbalance?: number
  moneyincashbox?: number
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
    isfractional?: boolean | null
    item_type?: 'piece' | 'weight'
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
const CASHIER_STORAGE_KEY = 'cashier'
const STORES_STORAGE_KEY = 'stores'

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

function readStoredStoreId() {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(STORE_ID_STORAGE_KEY) || ''
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function saveStoredJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function clearStoredJson(key: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(key)
}

function readStoredCashier(): Cashier | null {
  return readStoredJson<Cashier | null>(CASHIER_STORAGE_KEY, null)
}

function saveStoredCashier(value: Cashier) {
  saveStoredJson(CASHIER_STORAGE_KEY, value)
}

function clearStoredCashier() {
  clearStoredJson(CASHIER_STORAGE_KEY)
}

function readStoredStores(): Store[] {
  return readStoredJson<Store[]>(STORES_STORAGE_KEY, [])
}

function saveStoredStores(value: Store[]) {
  saveStoredJson(STORES_STORAGE_KEY, value)
}

function clearStoredStores() {
  clearStoredJson(STORES_STORAGE_KEY)
}

function readStoredSelectedStore(stores: Store[]) {
  const storedStoreId = readStoredStoreId()
  if (!storedStoreId) return null
  return stores.find((store) => String(store.store_id) === String(storedStoreId)) || null
}

function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function isFractionalFlag(value: unknown) {
  return value === true || value === 'true' || value === 'weight'
}

function formatQty(value: number | null | undefined, isfractional?: boolean | string | null) {
  const n = Number(value ?? 0)

  if (!isFractionalFlag(isfractional)) {
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
  const qty = 1
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

function mapBackendOrderLineToFront(line: any): OrderLine {
  const qtyFinal = toNumber(line?.qty_final ?? line?.qty, 0)
  const price = toNumber(line?.price, 0)
  const isfractional = isFractionalFlag(line?.isfractional ?? line?.item_type)
  const item = toNumber(line?.item ?? line?.good_id ?? line?.id, 0)
  const itemName = String(line?.item_name ?? line?.good_name ?? line?.name ?? '')
  const unit = String(line?.unit ?? line?.pack ?? '')

  return {
    ...line,
    order_line_id: line?.order_line_id != null ? toNumber(line.order_line_id, 0) : null,
    good_id: toNumber(line?.good_id ?? item, item),
    good_name: String(line?.good_name ?? itemName),
    unit,
    id: toNumber(line?.id ?? item, item),
    name: String(line?.name ?? itemName),
    code: line?.code ?? null,
    isfractional,
    is_local: Boolean(line?.is_local ?? false),
    is_dirty: Boolean(line?.is_dirty ?? false),
    item,
    item_name: itemName,
    photo_url: line?.photo_url ?? null,
    avg_weight: line?.avg_weight ?? null,
    pack: line?.pack ?? line?.unit ?? null,
    qty: toNumber(line?.qty ?? qtyFinal, qtyFinal),
    price,
    qty_final: qtyFinal,
    line_sum: toNumber(line?.line_sum, qtyFinal * price),
    item_stock: toNumber(line?.item_stock, 0),
    reserve: toNumber(line?.reserve, 0),
    available_qty: toNumber(line?.available_qty, 0),
    max_qty_final: toNumber(line?.max_qty_final, qtyFinal + toNumber(line?.available_qty, 0)),
  }
}

function mapParitetOrderToFrontResponse(data: any, foundUser: FoundUser, selectedStore: Store): OrderDetailsResponse {
  const payload = data?.payload || data || {}
  const lines = Array.isArray(payload.items)
    ? payload.items.map(mapParitetOrderLineToFront)
    : Array.isArray(data?.lines)
      ? data.lines.map(mapBackendOrderLineToFront)
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
      user_balance: toNumber(foundUser.balance, 0),
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
      user_balance: toNumber(foundUser.balance, 0),
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
  const [cashier, setCashier] = useState<Cashier | null>(() => readStoredCashier())
  const [stores, setStores] = useState<Store[]>(() => readStoredStores())
  const [selectedStore, setSelectedStore] = useState<Store | null>(() => readStoredSelectedStore(readStoredStores()))
  const [storeSelectLoading, setStoreSelectLoading] = useState(false)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [sideMenuTab, setSideMenuTab] = useState<SideMenuTab>('root')
  const [screenProfile, setScreenProfile] = useState<ScreenProfile>('auto')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [mainKeypadTarget, setMainKeypadTarget] = useState<MainKeypadTarget>(null)
  const lastTopbarTapAt = useRef(0)

  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const mainKeypadValueInputRef = useRef<HTMLInputElement | null>(null)
  const activeSearchInputSourceRef = useRef<SearchInputSource>('main')
  const searchCaretRangeRef = useRef<TextSelectionRange>({ start: 0, end: 0 })
  const isRestoringSearchCaretRef = useRef(false)
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
  const [cashOperationMessage, setCashOperationMessage] = useState('')
  const [cashSuccessDialog, setCashSuccessDialog] = useState<CashSuccessDialog | null>(null)
  const [cashQrDialog, setCashQrDialog] = useState<CashQrDialog | null>(null)
  const [cashQrLoading, setCashQrLoading] = useState(false)
  const [cashoutCheckDialog, setCashoutCheckDialog] = useState<CashoutCheckDialog | null>(null)
  const [cashoutPin, setCashoutPin] = useState('')
  const [cashoutLoading, setCashoutLoading] = useState(false)

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
  const [stockSuccessDialog, setStockSuccessDialog] = useState<{ itemName: string; qty: string } | null>(null)
  const [stockForm, setStockForm] = useState({
    item: '',
    qty_delta: '',
    comment: '',
  })
  const [stockSelectedItem, setStockSelectedItem] = useState<StoreItem | null>(null)
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [stockSearchLoading, setStockSearchLoading] = useState(false)
  const [stockSearchItems, setStockSearchItems] = useState<StoreItem[]>([])
  const [stockQtyCaretIndex, setStockQtyCaretIndex] = useState(0)
  const stockSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [stockViewDialogOpen, setStockViewDialogOpen] = useState(false)
  const [stockViewQuery, setStockViewQuery] = useState('')
  const [stockViewLoading, setStockViewLoading] = useState(false)
  const [stockViewItems, setStockViewItems] = useState<StoreItem[]>([])
  const [stockViewSelectedItem, setStockViewSelectedItem] = useState<StoreItem | null>(null)
  const [stockViewOperation, setStockViewOperation] = useState<'post' | 'writeoff'>('post')
  const [stockViewQty, setStockViewQty] = useState('')
  const [stockViewComment, setStockViewComment] = useState('')
  const [stockViewQtyCaretIndex, setStockViewQtyCaretIndex] = useState(0)
  const [stockViewMessage, setStockViewMessage] = useState('')
  const [stockViewSuccessDialog, setStockViewSuccessDialog] = useState<{ itemName: string; qty: string; operation: 'post' | 'writeoff' } | null>(null)


  const [orderDetails, setOrderDetails] = useState<OrderDetailsResponse | null>(null)
  const [deleteOrderDialog, setDeleteOrderDialog] = useState<FoundOrder | null>(null)
  const [cancelOrderLoading, setCancelOrderLoading] = useState(false)
  const [orderSwipeDragNumber, setOrderSwipeDragNumber] = useState<number | null>(null)
  const [orderSwipeDragX, setOrderSwipeDragX] = useState(0)
  const orderSwipeRef = useRef<{ orderNumber: number; startX: number; startY: number } | null>(null)
  const swipedOrderNumberRef = useRef<number | null>(null)
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderBalanceRefreshLoading, setOrderBalanceRefreshLoading] = useState(false)
  const lastOrderBalanceRefreshTapAtRef = useRef(0)
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
  const [itemPickerMode, setItemPickerMode] = useState<'order' | 'stockReceipt' | 'stockView'>('order')
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
    clearStoredCashier()
    clearStoredStores()
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

  async function selectStore(store: Store, explicitSessionId?: string) {
    const activeSessionId = explicitSessionId || sessionId || readStoredSessionId()

    if (!activeSessionId) {
      throw new Error('Нет активной сессии')
    }

    const defaultWarehouse = store.default_warehouse

    if (defaultWarehouse == null) {
      throw new Error('У точки выдачи не указан склад')
    }

    setStoreSelectLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/auth/select-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': activeSessionId,
        },
        body: JSON.stringify({
          session_id: activeSessionId,
          store_id: store.store_id,
          default_warehouse: defaultWarehouse,
        }),
      })

      if (res.status === 401) {
        handleUnauthorizedResponse()
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось выбрать точку выдачи'))
      }

      setSelectedStore(store)
      saveStoredStoreId(store.store_id)
    } finally {
      setStoreSelectLoading(false)
    }
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
    if (typeof window === 'undefined') return false

    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
    const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

    return hasCoarsePointer || hasTouchPoints
  }

  function normalizeSearchValue(value: string) {
    return String(value || '').replace(/\D/g, '')
  }

  function clampTextSelectionRange(start: number, end: number, valueLength: number): TextSelectionRange {
    const safeStart = Math.max(0, Math.min(start, valueLength))
    const safeEnd = Math.max(safeStart, Math.min(end, valueLength))

    return { start: safeStart, end: safeEnd }
  }

  function getInputSelectionRange(input: HTMLInputElement | null, fallbackLength: number): TextSelectionRange {
    if (!input) {
      return { start: fallbackLength, end: fallbackLength }
    }

    const selectionStart = input.selectionStart ?? fallbackLength
    const selectionEnd = input.selectionEnd ?? selectionStart

    return clampTextSelectionRange(selectionStart, selectionEnd, fallbackLength)
  }

  function setStoredSearchCaretRange(range: TextSelectionRange) {
    searchCaretRangeRef.current = range
  }

  function restoreSearchCaret(range: TextSelectionRange, source?: SearchInputSource) {
    const targetSource = source || activeSearchInputSourceRef.current
    setStoredSearchCaretRange(range)

    window.requestAnimationFrame(() => {
      const input = targetSource === 'keypad' ? mainKeypadValueInputRef.current : searchInputRef.current

      if (!input) return

      isRestoringSearchCaretRef.current = true

      try {
        input.focus({ preventScroll: true })
        input.setSelectionRange(range.start, range.end)
      } catch {
        // Некоторые мобильные браузеры могут отказать в установке курсора.
      }

      window.setTimeout(() => {
        isRestoringSearchCaretRef.current = false
      }, 0)
    })
  }

  function rememberSearchCaret(input: HTMLInputElement | null, source: SearchInputSource) {
    if (isRestoringSearchCaretRef.current) return

    activeSearchInputSourceRef.current = source

    const currentLength = input ? String(input.value || '').length : normalizeSearchValue(searchQuery).length
    const range = getInputSelectionRange(input, currentLength)

    setStoredSearchCaretRange(range)
  }

  function handleSearchInputChange(value: string, input: HTMLInputElement, source: SearchInputSource) {
    activeSearchInputSourceRef.current = source

    const rawSelectionStart = input.selectionStart ?? value.length
    const rawSelectionEnd = input.selectionEnd ?? rawSelectionStart
    const next = normalizeSearchValue(value)
    const nextRange = clampTextSelectionRange(
      normalizeSearchValue(value.slice(0, rawSelectionStart)).length,
      normalizeSearchValue(value.slice(0, rawSelectionEnd)).length,
      next.length,
    )

    setSearchQuery(next)
    setStoredSearchCaretRange(nextRange)

    if (next !== value) {
      restoreSearchCaret(nextRange, source)
    }
  }

  function setSearchQueryFromKeypad(nextValue: string, nextRange: TextSelectionRange) {
    const normalized = normalizeSearchValue(nextValue)
    const clampedRange = clampTextSelectionRange(nextRange.start, nextRange.end, normalized.length)

    setSearchQuery(normalized)
    restoreSearchCaret(clampedRange)
  }

  function insertSearchKeypadValue(value: string) {
    const current = normalizeSearchValue(searchQuery)
    const range = clampTextSelectionRange(
      searchCaretRangeRef.current.start,
      searchCaretRangeRef.current.end,
      current.length,
    )
    const insertValue = normalizeSearchValue(value)

    if (!insertValue) return

    const next = `${current.slice(0, range.start)}${insertValue}${current.slice(range.end)}`
    const nextCaret = range.start + insertValue.length

    setSearchQueryFromKeypad(next, { start: nextCaret, end: nextCaret })
  }

  function backspaceSearchKeypadValue() {
    const current = normalizeSearchValue(searchQuery)
    const range = clampTextSelectionRange(
      searchCaretRangeRef.current.start,
      searchCaretRangeRef.current.end,
      current.length,
    )

    if (range.start !== range.end) {
      const next = `${current.slice(0, range.start)}${current.slice(range.end)}`
      setSearchQueryFromKeypad(next, { start: range.start, end: range.start })
      return
    }

    if (range.start <= 0) {
      setSearchQueryFromKeypad(current, { start: 0, end: 0 })
      return
    }

    const next = `${current.slice(0, range.start - 1)}${current.slice(range.start)}`
    const nextCaret = range.start - 1

    setSearchQueryFromKeypad(next, { start: nextCaret, end: nextCaret })
  }

  function appendMainKeypadValue(value: string) {
    if (mainKeypadTarget === 'search') {
      insertSearchKeypadValue(value)
      return
    }

    if (mainKeypadTarget === 'cashoutPin') {
      if (value === '.') return
      setCashoutPin((current) => `${current || ''}${value}`.replace(/\D/g, '').slice(0, 4))
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
      backspaceSearchKeypadValue()
      return
    }

    if (mainKeypadTarget === 'cashTopup') {
      setCashTopupAmount((current) => String(current || '').slice(0, -1))
      return
    }

    if (mainKeypadTarget === 'cashoutPin') {
      setCashoutPin((current) => String(current || '').slice(0, -1))
      return
    }

    if (mainKeypadTarget === 'sbpTopup') {
      setSbpAmount((current) => String(current || '').slice(0, -1))
    }
  }

  function clearMainKeypadValue() {
    if (mainKeypadTarget === 'search') {
      setSearchQueryFromKeypad('', { start: 0, end: 0 })
      return
    }

    if (mainKeypadTarget === 'cashTopup') {
      setCashTopupAmount('')
      return
    }

    if (mainKeypadTarget === 'cashoutPin') {
      setCashoutPin('')
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

    if (mainKeypadTarget === 'cashoutPin') {
      setMainKeypadTarget(null)
      void cashout()
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
    const isCashoutPin = mainKeypadTarget === 'cashoutPin'
    const isMoneyInput = isCashTopup || isSbpTopup

    const title =
      mainKeypadTarget === 'search'
        ? '№ П/С, телефон или заказ'
        : isCashoutPin
          ? 'PIN выдачи'
          : isSbpTopup
            ? 'Сумма СБП'
            : 'Сумма наличными'

    const value =
      mainKeypadTarget === 'search'
        ? searchQuery
        : isCashoutPin
          ? cashoutPin
          : isSbpTopup
            ? sbpAmount
            : cashTopupAmount

    const submitText =
      mainKeypadTarget === 'search'
        ? 'Найти'
        : isCashoutPin
          ? 'Выдать'
          : 'Пополнить'

    return (
      <div className="mainKeypadPanel">
        <div className="mainKeypadHeader">
          <div className="mainKeypadValueBox">
            <b>{title}</b>
            {mainKeypadTarget === 'search' ? (
              <input
                ref={mainKeypadValueInputRef}
                className="mainKeypadValueInput"
                type="text"
                value={value}
                placeholder="0"
                inputMode="none"
                autoComplete="off"
                onFocus={(e) => rememberSearchCaret(e.currentTarget, 'keypad')}
                onClick={(e) => rememberSearchCaret(e.currentTarget, 'keypad')}
                onKeyUp={(e) => rememberSearchCaret(e.currentTarget, 'keypad')}
                onSelect={(e) => rememberSearchCaret(e.currentTarget, 'keypad')}
                onChange={(e) => handleSearchInputChange(e.target.value, e.currentTarget, 'keypad')}
              />
            ) : (
              <span>{value || '0'}</span>
            )}
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

  function closeSideMenu() {
    setSideMenuOpen(false)
    setSideMenuTab('root')
  }

  function openShareholderScreenFromSideMenu() {
    closeSideMenu()
    setMainKeypadTarget(null)

    // Возвращаемся к экрану выбранного пайщика.
    // Самого пайщика, строку поиска и список заказов не очищаем.
    const unlockPromise = unlockCurrentOrderIfNeeded()

    setOrderPaymentQrDialog(null)
    setOrderPaymentMessage('')
    setReceiptDialogOpen(false)
    setReceiptData(null)
    setOrderDetails(null)
    setSelectedOrderNumber(null)
    setError('')

    void unlockPromise
  }

  function renderSideMenu() {
    if (!cashier) return null

    return (
      <>
        {sideMenuOpen && (
          <button
            className="sideMenuBackdrop"
            aria-label="Закрыть меню"
            onClick={closeSideMenu}
          />
        )}

        <aside className={sideMenuOpen ? 'sideMenu open' : 'sideMenu'}>
          <div className="sideMenuHeader">
            <div>
              <b>Меню кассы</b>
              <span>Кассир {cashier.cashier_account}</span>
            </div>
            <button className="secondary menuCloseButton" onClick={closeSideMenu}>
              ×
            </button>
          </div>

          {sideMenuTab === 'root' && (
            <div className="sideMenuRoot">
              <div className="sideMenuRootMain">
                <button type="button" className="sideMenuTabButton" onClick={openShareholderScreenFromSideMenu}>
                  1. Пайщик
                </button>

                <button
                  type="button"
                  className="sideMenuTabButton"
                  onClick={() => {
                    closeSideMenu()
                    void openStockViewDialog()
                  }}
                >
                  2. Запасы
                </button>

                <button
                  type="button"
                  className="sideMenuTabButton"
                  onClick={() => setSideMenuTab('chats')}
                >
                  3. Чаты
                </button>

                <button
                  type="button"
                  className="sideMenuTabButton"
                  onClick={() => setSideMenuTab('reports')}
                >
                  4. Отчеты
                </button>

                <button
                  type="button"
                  className="sideMenuTabButton"
                  onClick={() => setSideMenuTab('settings')}
                >
                  5. Настройки
                </button>
              </div>

              <div className="sideMenuRootActions">
                <button className="secondary full" onClick={switchStore} disabled={!selectedStore}>
                  Сменить ТВТ
                </button>
                <button className="secondary full" onClick={logoutCashier}>
                  Выйти
                </button>
              </div>
            </div>
          )}

          {sideMenuTab === 'stock' && (
            <div className="sideMenuSubWindow">
              <div className="sideMenuSubHeader">
                <button type="button" className="secondary sideMenuBackButton" onClick={() => setSideMenuTab('root')}>
                  ← Меню
                </button>
                <div className="sideMenuSubTitle">
                  <span>2. Запасы</span>
                  <b>Запасы</b>
                </div>
              </div>

              <div className="sideMenuEmptyState">
                <b>Экран запасов</b>
                <p>Поиск товара, оприходование и списание доступны в основном экране «Запасы».</p>
                <button
                  type="button"
                  className="primary full"
                  onClick={() => {
                    closeSideMenu()
                    void openStockViewDialog()
                  }}
                >
                  Открыть запасы
                </button>
              </div>
            </div>
          )}

          {sideMenuTab === 'chats' && (
            <div className="sideMenuSubWindow">
              <div className="sideMenuSubHeader">
                <button type="button" className="secondary sideMenuBackButton" onClick={() => setSideMenuTab('root')}>
                  ← Меню
                </button>
                <div className="sideMenuSubTitle">
                  <span>3. Чаты</span>
                  <b>Чаты</b>
                </div>
              </div>

              <div className="sideMenuEmptyState">
                <b>Чаты в разработке</b>
                <p>Скоро здесь появятся чаты с пайщиками и сервисные уведомления.</p>
              </div>
            </div>
          )}

          {sideMenuTab === 'settings' && (
            <div className="sideMenuSubWindow">
              <div className="sideMenuSubHeader">
                <button type="button" className="secondary sideMenuBackButton" onClick={() => setSideMenuTab('root')}>
                  ← Меню
                </button>
                <div className="sideMenuSubTitle">
                  <span>5. Настройки</span>
                  <b>Настройки кассы</b>
                </div>
              </div>

              <div className="sideMenuSettingsList">
                <div className="sideMenuSection">
                  <span className="sideMenuCaption">Внешний вид</span>
                  <b>Адаптация под экран</b>
                  <label htmlFor="screen-profile-select">Режим интерфейса</label>
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
              </div>
            </div>
          )}

          {sideMenuTab === 'reports' && (
            <div className="sideMenuSubWindow">
              <div className="sideMenuSubHeader">
                <button type="button" className="secondary sideMenuBackButton" onClick={() => setSideMenuTab('root')}>
                  ← Меню
                </button>
                <div className="sideMenuSubTitle">
                  <span>4. Отчеты</span>
                  <b>Отчеты</b>
                </div>
              </div>

              <div className="sideMenuEmptyState">
                <b>Отчеты в разработке</b>
                <p>Скоро здесь появятся отчеты по кассе, заказам и операциям.</p>
              </div>
            </div>
          )}
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
      saveStoredCashier(data.cashier)
      saveStoredStores(data.stores)
      setSessionId(data.session_id)
      setCashier(data.cashier)
      setStores(data.stores)

      if (data.stores.length === 1) {
        await selectStore(data.stores[0], data.session_id)
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

  function applySearchResponse(
    data: SearchResponse,
    keepSelectedOrderNumber?: number | null,
    options: { preserveUserBalance?: number | null } = {}
  ) {
    const nextUser =
      options.preserveUserBalance !== undefined && options.preserveUserBalance !== null
        ? {
            ...data.user,
            balance: options.preserveUserBalance,
          }
        : data.user

    setFoundUser(nextUser)
    setOrders(data.orders)
    setStoreState(data.store)

    if (keepSelectedOrderNumber !== undefined) {
      if (keepSelectedOrderNumber) {
        const exists = data.orders.some((o) => Number(o.order_number) === Number(keepSelectedOrderNumber))
        setSelectedOrderNumber(exists ? keepSelectedOrderNumber : null)
      } else {
        setSelectedOrderNumber(null)
      }
    }

    return {
      ...data,
      user: nextUser,
    }
  }

  async function refreshCurrentUser(
    keepSelectedOrderNumber?: number | null,
    options: { updateCashierStatus?: boolean; preserveUserBalance?: number | null } = {}
  ) {
    if (!cashier || !selectedStore || !foundUser) return

    try {
      const data = await fetchCurrentShareholderData(foundUser.user_account)
      const appliedData = applySearchResponse(data, keepSelectedOrderNumber, {
        preserveUserBalance: options.preserveUserBalance,
      })

      if (options.updateCashierStatus !== false) {
        await fetchStatus()
      }

      return appliedData
    } catch (e: any) {
      setError(e.message || 'Ошибка обновления данных пайщика')
      return null
    }
  }

  function getVisibleOrderUserBalance(order: OrderDetailsResponse['order']) {
    if (foundUser && String(foundUser.user_account) === String(order.user_account)) {
      return Number(foundUser.balance || 0)
    }

    return Number(order.user_balance || 0)
  }

  async function refreshOrderUserBalance() {
    if (!cashier || !selectedStore || !orderDetails || orderBalanceRefreshLoading) return

    const targetUserAccount = orderDetails.order.user_account ?? foundUser?.user_account

    if (!targetUserAccount) {
      setError('Не удалось определить пайщика для обновления баланса')
      return
    }

    setOrderBalanceRefreshLoading(true)
    setError('')

    try {
      const data = await fetchCurrentShareholderData(targetUserAccount)
      const freshBalance = Number(data.user.balance || 0)
      const keepOrderNumber = Number(orderDetails.order.order_number || selectedOrderNumber || 0)

      applySearchResponse(data, keepOrderNumber || undefined)

      setOrderDetails((prev) =>
        prev
          ? {
              ...prev,
              order: {
                ...prev.order,
                user_balance: freshBalance,
              },
            }
          : prev
      )

      // Здесь обновляем только баланс пайщика в заказе.
      // Баланс владельца ТВТ и наличные не трогаем, чтобы не сбросить их в 0.

    } catch (e: any) {
      setError(e.message || 'Ошибка обновления баланса пайщика')
    } finally {
      setOrderBalanceRefreshLoading(false)
    }
  }
  function handleOrderBalancePointerUp() {
    const now = Date.now()

    if (now - lastOrderBalanceRefreshTapAtRef.current <= 450) {
      lastOrderBalanceRefreshTapAtRef.current = 0
      void refreshOrderUserBalance()
      return
    }

    lastOrderBalanceRefreshTapAtRef.current = now
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
      const exists = data.orders.some((o) => Number(o.order_number) === Number(keepSelectedOrderNumber))
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

    if (field === 'qty_delta') {
      setStockQtyCaretIndex(String(value || '').length)
    }
  }

  function isStockQtyFractional() {
    return stockSelectedItem?.isfractional === true
  }

  function normalizeStockQtyValue(value: string) {
    if (!isStockQtyFractional()) {
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

  function setStockQtyDraft(nextValue: string) {
    const normalized = normalizeStockQtyValue(nextValue)
    updateStockField('qty_delta', normalized)
    setStockQtyCaretIndex(normalized.length)
  }

  function insertStockQtyText(valueToInsert: string) {
    if (stockLoading || !stockSelectedItem) return

    const isFractional = isStockQtyFractional()
    const current = String(stockForm.qty_delta || '')
    const caret = Math.max(0, Math.min(stockQtyCaretIndex, current.length))

    if (!isFractional && valueToInsert === '.') {
      return
    }

    if (isFractional && valueToInsert === '.' && current.includes('.')) {
      return
    }

    let insertValue = valueToInsert

    if (isFractional && valueToInsert === '.' && current.length === 0) {
      insertValue = '0.'
    }

    let next = current.slice(0, caret) + insertValue + current.slice(caret)

    if (current === '0' && valueToInsert !== '.' && caret === 1) {
      next = valueToInsert
    }

    next = normalizeStockQtyValue(next)

    const nextCaret = Math.max(0, Math.min(caret + insertValue.length, next.length))

    updateStockField('qty_delta', next)
    setStockQtyCaretIndex(nextCaret)
  }

  function appendStockQtyDigit(digit: string) {
    insertStockQtyText(digit)
  }

  function appendStockQtyDot() {
    insertStockQtyText('.')
  }

  function backspaceStockQtyDraft() {
    if (stockLoading) return

    const current = String(stockForm.qty_delta || '')
    const caret = Math.max(0, Math.min(stockQtyCaretIndex, current.length))

    if (caret <= 0) {
      return
    }

    const next = current.slice(0, caret - 1) + current.slice(caret)

    updateStockField('qty_delta', next)
    setStockQtyCaretIndex(caret - 1)
  }

  function clearStockQtyDraft() {
    if (stockLoading) return

    updateStockField('qty_delta', '')
    setStockQtyCaretIndex(0)
  }

  function changeStockQtyDraft(delta: number) {
    if (stockLoading || !stockSelectedItem) return

    const current = Number(stockForm.qty_delta || 0)
    const step = stockSelectedItem.isfractional ? 0.001 : 1
    const next = Math.max(0, current + delta * step)
    const nextValue = stockSelectedItem.isfractional
      ? next.toFixed(3)
      : String(Math.round(next))

    setStockQtyDraft(nextValue)
  }

  function changeStockSelectedItem() {
    setStockSelectedItem(null)
    setStockForm((prev) => ({
      ...prev,
      item: '',
      qty_delta: '',
      comment: '',
    }))
    setStockQtyDraft('')
    setStockQtyCaretIndex(0)
    setStockMessage('Выберите новый товар из текущей выборки или через поиск')
    window.setTimeout(() => {
      stockSearchInputRef.current?.focus()
    }, 0)
  }

  function resetStockReceiptState() {
    setStockMessage('')
    setStockSuccessDialog(null)
    setStockForm({
      item: '',
      qty_delta: '',
      comment: '',
    })
    setStockSelectedItem(null)
    setStockSearchQuery('')
    setStockSearchItems([])
    setStockQtyCaretIndex(0)
  }

  function openStockReceiptScreen() {
    resetStockReceiptState()
    setStockDialogOpen(true)
    setError('')
    window.setTimeout(() => {
      stockSearchInputRef.current?.focus()
    }, 0)
  }

  function closeStockReceiptScreen() {
    setStockDialogOpen(false)
    resetStockReceiptState()
    setError('')
  }

  async function handleStockProductAction() {
    const normalizedQuery = stockSearchQuery.trim()

    if (!normalizedQuery) {
      await openItemPicker('stockReceipt')
      return
    }

    if (stockSearchItems.length === 1) {
      selectStockItem(stockSearchItems[0])
      return
    }

    if (stockSearchItems.length === 0) {
      await loadStockSearchItems(normalizedQuery)
    }
  }

  async function searchProductsForSelector(query: string, options: { limit?: number; showavailable?: boolean } = {}) {
    if (!cashier || !selectedStore) return []

    const normalizedQuery = query.trim()
    const params = buildItemSearchParams(normalizedQuery)
    const searchParam = getItemSearchParam(normalizedQuery)

    if (searchParam?.key === 'q') {
      params.set('showavailable', options.showavailable === false ? 'false' : 'true')
    }

    const queryString = params.toString()
    const searchUrl = `${API_BASE}/cashier/items/search${queryString ? `?${queryString}` : ''}`

    console.debug('[cashier-product-selector-search]', {
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
      throw new Error(data?.detail || 'Не удалось найти товары')
    }

    const data = await res.json()
    const goods = extractParitetGoods(data)
    const mappedItems = goods.map(mapParitetProductToStoreItem)

    return options.limit ? mappedItems.slice(0, options.limit) : mappedItems
  }

  async function loadProductSelectorResults(query: string, target: 'picker' | 'stockReceipt' | 'stockView' = 'picker') {
    const setLoading = target === 'picker' ? setItemsLoading : target === 'stockView' ? setStockViewLoading : setStockSearchLoading
    const setItems = target === 'picker' ? setStoreItems : target === 'stockView' ? setStockViewItems : setStockSearchItems

    setLoading(true)
    setError('')

    try {
      const limit = target === 'picker' ? 100 : target === 'stockView' ? 150 : 30
      const showavailable = target === 'picker' ? true : false
      const items = await searchProductsForSelector(query, { limit, showavailable })
      setItems(items)
    } catch (e: any) {
      setItems([])
      setError(e.message || 'Ошибка поиска товара')
    } finally {
      setLoading(false)
    }
  }

  async function loadStockSearchItems(query = stockSearchQuery) {
    await loadProductSelectorResults(query, 'stockReceipt')
  }

  function getProductKindLabel(item: StoreItem) {
    return item.isfractional ? `Весовой · ${item.pack || item.unit || 'кг'}` : 'Штучный товар'
  }

  function selectStockItem(item: StoreItem) {
    setStockSelectedItem(item)
    updateStockField('item', String(item.item))
    setStockQtyCaretIndex(String(stockForm.qty_delta || '').length)
    setStockMessage(`Выбран товар: ${item.item_name}, код ${item.item}`)
  }

  function resetStockViewWorkState() {
    setStockViewSelectedItem(null)
    setStockViewOperation('post')
    setStockViewQty('')
    setStockViewComment('')
    setStockViewQtyCaretIndex(0)
    setStockViewMessage('')
    setStockViewSuccessDialog(null)
    setStockViewItems([])
  }

  function selectStockViewItem(item: StoreItem) {
    setStockViewSelectedItem(item)
    setStockViewQty('')
    setStockViewComment('')
    setStockViewQtyCaretIndex(0)
    setStockViewMessage(`Выбран товар: ${item.item_name}, код ${item.item}`)
  }

  function isStockViewQtyFractional() {
    return stockViewSelectedItem?.isfractional === true
  }

  function normalizeStockViewQtyValue(value: string) {
    if (!isStockViewQtyFractional()) {
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

  function setStockViewQtyDraft(nextValue: string) {
    const normalized = normalizeStockViewQtyValue(nextValue)
    setStockViewQty(normalized)
    setStockViewQtyCaretIndex(normalized.length)
  }

  function insertStockViewQtyText(valueToInsert: string) {
    if (stockViewLoading || !stockViewSelectedItem) return

    const isFractional = isStockViewQtyFractional()
    const current = String(stockViewQty || '')
    const caret = Math.max(0, Math.min(stockViewQtyCaretIndex, current.length))

    if (!isFractional && valueToInsert === '.') {
      return
    }

    if (isFractional && valueToInsert === '.' && current.includes('.')) {
      return
    }

    let insertValue = valueToInsert

    if (isFractional && valueToInsert === '.' && current.length === 0) {
      insertValue = '0.'
    }

    let next = current.slice(0, caret) + insertValue + current.slice(caret)

    if (current === '0' && valueToInsert !== '.' && caret === 1) {
      next = valueToInsert
    }

    next = normalizeStockViewQtyValue(next)

    const nextCaret = Math.max(0, Math.min(caret + insertValue.length, next.length))

    setStockViewQty(next)
    setStockViewQtyCaretIndex(nextCaret)
  }

  function appendStockViewQtyDigit(digit: string) {
    insertStockViewQtyText(digit)
  }

  function appendStockViewQtyDot() {
    insertStockViewQtyText('.')
  }

  function backspaceStockViewQtyDraft() {
    if (stockViewLoading) return

    const current = String(stockViewQty || '')
    const caret = Math.max(0, Math.min(stockViewQtyCaretIndex, current.length))

    if (caret <= 0) return

    const next = current.slice(0, caret - 1) + current.slice(caret)

    setStockViewQty(next)
    setStockViewQtyCaretIndex(caret - 1)
  }

  function clearStockViewQtyDraft() {
    if (stockViewLoading) return

    setStockViewQty('')
    setStockViewQtyCaretIndex(0)
  }

  function changeStockViewQtyDraft(delta: number) {
    if (stockViewLoading || !stockViewSelectedItem) return

    const isFractional = isStockViewQtyFractional()
    const step = isFractional ? 0.1 : 1
    const current = Number(stockViewQty || 0)
    const next = Math.max(0, current + delta * step)
    const nextValue = isFractional ? Number(next.toFixed(3)).toString() : String(Math.trunc(next))

    setStockViewQtyDraft(nextValue === '0' ? '' : nextValue)
  }

  async function handleStockViewProductAction() {
    const normalizedQuery = stockViewQuery.trim()

    if (!normalizedQuery) {
      await openItemPicker('stockView')
      return
    }

    await searchStockViewItemsFresh(normalizedQuery, { selectSingle: true })
  }

  async function refreshStockViewSelectedItem(productId: number) {
    const items = await searchProductsForSelector(String(productId), { limit: 1, showavailable: false })
    const refreshedItem = items.find((item) => item.item === productId) || items[0]

    if (refreshedItem) {
      setStockViewSelectedItem(refreshedItem)
      setStockViewItems((prev) => {
        if (!prev.some((item) => item.item === refreshedItem.item)) {
          return [refreshedItem, ...prev]
        }

        return prev.map((item) => (item.item === refreshedItem.item ? refreshedItem : item))
      })
    }

    return refreshedItem || null
  }

  function validateStockViewOperation() {
    if (!stockViewSelectedItem) {
      return 'Сначала выберите товар'
    }

    const qty = Number(stockViewQty)

    if (!qty || qty <= 0) {
      return 'Введите количество'
    }

    if (stockViewOperation === 'writeoff' && qty > toNumber(stockViewSelectedItem.available_qty, 0)) {
      return 'Нельзя списать больше доступного количества'
    }

    return ''
  }

  async function performStockViewOperation() {
    if (!cashier || !selectedStore || !stockViewSelectedItem) return

    const validationError = validateStockViewOperation()

    if (validationError) {
      setError(validationError)
      return
    }

    const qty = Number(stockViewQty)
    const operation = stockViewOperation

    setStockViewLoading(true)
    setError('')
    setStockViewMessage('')

    try {
      const params = new URLSearchParams({
        product_id: String(stockViewSelectedItem.item),
        count: String(qty),
        store_id: String(selectedStore.store_id),
      })

      if (stockViewComment.trim()) {
        params.set('comment', stockViewComment.trim())
      }

      const action = operation === 'writeoff' ? 'writeoff' : 'post'
      const res = await apiFetch(`${API_BASE}/cashier/items/goods/${action}?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, operation === 'writeoff' ? 'Не удалось списать товар' : 'Не удалось оприходовать товар'))
      }

      const itemName = stockViewSelectedItem.item_name
      const formattedQty = formatQty(qty, stockViewSelectedItem.isfractional)
      const operationText = operation === 'writeoff' ? 'Списано' : 'Оприходовано'

      setStockViewMessage(`${operationText}: ${itemName} · количество ${formattedQty}`)
      setStockViewSuccessDialog({
        itemName,
        qty: formattedQty,
        operation,
      })
        setStockViewQty('')
      setStockViewComment('')
      setStockViewQtyCaretIndex(0)

      await refreshStockViewSelectedItem(stockViewSelectedItem.item)
    } catch (e: any) {
      setError(e.message || (operation === 'writeoff' ? 'Ошибка списания товара' : 'Ошибка оприходования товара'))
    } finally {
      setStockViewLoading(false)
    }
  }

  async function searchStockViewItemsFresh(
    query = stockViewQuery,
    options: { selectSingle?: boolean } = {}
  ) {
    const normalizedQuery = query.trim()

    setStockViewLoading(true)
    setError('')

    try {
      const items = await searchProductsForSelector(normalizedQuery, { limit: 150, showavailable: false })
      setStockViewItems(items)

      if (options.selectSingle && items.length === 1) {
        selectStockViewItem(items[0])
      }

      return items
    } catch (e: any) {
      setStockViewItems([])
      setError(e.message || 'Ошибка поиска товара')
      return []
    } finally {
      setStockViewLoading(false)
    }
  }

  async function loadStockViewItems(query = stockViewQuery) {
    return searchStockViewItemsFresh(query)
  }


  async function openStockViewDialog() {
    setStockViewDialogOpen(true)
    setStockViewQuery('')
    resetStockViewWorkState()
    setError('')
    await loadStockViewItems('')
  }

  async function stockReceipt() {
    if (!cashier || !selectedStore) return

    const itemCode = Number(stockForm.item || stockSelectedItem?.item || 0)
    const qtyDelta = Number(stockForm.qty_delta)

    if (!itemCode || itemCode <= 0) {
      setError('Сначала выберите товар')
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
      const params = new URLSearchParams({
        product_id: String(itemCode),
        count: String(qtyDelta),
        store_id: String(selectedStore.store_id),
      })

      if (stockForm.comment.trim()) {
        params.set('comment', stockForm.comment.trim())
      }

      const res = await apiFetch(`${API_BASE}/cashier/items/goods/post?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось оприходовать товар')
      }

      const successItemName = stockSelectedItem?.item_name || `товар ${itemCode}`
      const successQty = formatQty(qtyDelta, stockSelectedItem?.isfractional)

      setStockMessage(`Оприходовано: ${successItemName} · количество ${successQty}`)
      setStockSuccessDialog({
        itemName: successItemName,
        qty: successQty,
      })

      setStockForm((prev) => ({
        ...prev,
        qty_delta: '',
        comment: '',
      }))

      if (stockSearchQuery.trim()) {
        await loadStockSearchItems(stockSearchQuery)
      }
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

  function getCashOperationAmount() {
    return Number(String(cashTopupAmount || '').replace(',', '.'))
  }

  function applyCashBalances(data: any) {
    const customerbalance = Number(data.customerbalance ?? 0)
    const cashierbalance = Number(data.cashierbalance ?? 0)
    const moneyincashbox = Number(data.moneyincashbox ?? 0)

    setFoundUser((prev) =>
      prev
        ? {
            ...prev,
            balance: customerbalance,
          }
        : prev
    )

    setOwnerBalance(cashierbalance)
    setCashBalance(moneyincashbox)
    setStoreState((prev) =>
      prev
        ? {
            ...prev,
            owner_balance: cashierbalance,
            cash_balance: moneyincashbox,
          }
        : selectedStore
          ? {
              store_id: selectedStore.store_id,
              owner_account: selectedStore.owner_account || 0,
              owner_balance: cashierbalance,
              cash_balance: moneyincashbox,
              cash_limit: 0,
            }
          : prev
    )
  }

  function showCashSuccess(title: string, text: string, data?: any) {
    setCashSuccessDialog({
      title,
      text,
      customerbalance: data?.customerbalance,
      cashierbalance: data?.cashierbalance,
      moneyincashbox: data?.moneyincashbox,
    })
  }

  function validateCashOperationBase() {
    if (!cashier || !selectedStore || !foundUser) {
      setError('Сначала найдите пайщика')
      return null
    }

    const amount = getCashOperationAmount()

    if (!amount || amount <= 0) {
      setError('Введите сумму операции')
      return null
    }

    return { amount, user: foundUser, store: selectedStore }
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
    const base = validateCashOperationBase()
    if (!base) return

    const { amount, user, store } = base

    setCashTopupLoading(true)
    setError('')
    setCashOperationMessage('')

    try {
      if (!user.user_id) {
        throw new Error('Не удалось выполнить пополнение: в данных пайщика нет user_id')
      }

      const params = new URLSearchParams({
        user_id: String(user.user_id),
        amount: String(amount),
        store_id: String(store.store_id),
      })

      const res = await apiFetch(`${API_BASE}/cash/transfer?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось пополнить П/С'))
      }

      const data = await res.json()

      applyCashBalances(data)
      setCashTopupAmount('')
      setCashTopupConfirmOpen(false)
      setCashOperationMessage('Пополнение выполнено')
      showCashSuccess('Пополнение выполнено', 'Деньги зачислены на П/С пайщика.', data)
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

async function openOrder(orderNumber: number, userForBalance: FoundUser | null = foundUser) {
    if (!cashier || !selectedStore || !foundUser) return
  
    setError('')
    setOrderLoading(true)
    setSelectedOrderNumber(orderNumber)
  
    try {
      const params = new URLSearchParams({
        cashier_account: String(cashier.cashier_account ?? ''),
        store_id: String(selectedStore.store_id),
        device_id: 'web',
      })
  
      const res = await apiFetch(`${API_BASE}/cashier/orders/${orderNumber}?${params.toString()}`)
  
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || 'Не удалось открыть заказ')
      }
  
      const data = await res.json()
      const normalizedData = mapParitetOrderToFrontResponse(data, userForBalance || foundUser, selectedStore)

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
    setStockSuccessDialog(null)
    setStockForm({
      item: '',
      qty_delta: '',
      comment: '',
    })
    setStockSelectedItem(null)
    setStockSearchQuery('')
    setStockSearchItems([])

    setStockViewDialogOpen(false)
    setStockViewQuery('')
    setStockViewItems([])
    resetStockViewWorkState()
  }

  async function switchStore() {
    await unlockCurrentOrderIfNeeded()
    clearWorkplaceState()
  }

  async function logoutCashier() {
    await unlockCurrentOrderIfNeeded()
    clearWorkplaceState()

    clearStoredSessionId()
    clearStoredCashier()
    clearStoredStores()

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

    const balanceBeforeSave = toNumber(orderDetails.order.user_balance ?? foundUser.balance, 0)

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

      const refreshed = await refreshCurrentUser(savedOrderNumber, {
        preserveUserBalance: balanceBeforeSave,
      })
      const freshUser = refreshed?.user
        ? {
            ...refreshed.user,
            balance: balanceBeforeSave,
          }
        : {
            ...foundUser,
            balance: balanceBeforeSave,
          }

      await openOrder(savedOrderNumber, freshUser)
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
    await loadProductSelectorResults(query, 'picker')
    setItemCategories([])
  }

  async function openItemPicker(mode: 'order' | 'stockReceipt' | 'stockView' = 'order') {
    setItemPickerMode(mode)
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


  async function handleProductSelectedFromPicker(item: StoreItem) {
    if (itemPickerMode === 'stockReceipt') {
      selectStockItem(item)
      setItemPickerOpen(false)
      return
    }

    if (itemPickerMode === 'stockView') {
      selectStockViewItem(item)
      setItemPickerOpen(false)
      return
    }

    await addItemToCurrentOrder(item)
  }

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
      const searchParam = getItemSearchParam(normalizedQuery)

      if (searchParam?.key === 'q') {
        params.set('showavailable', 'true')
      }

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


  useEffect(() => {
    if (!stockDialogOpen) {
      return
    }

    const normalizedQuery = stockSearchQuery.trim()

    if (!normalizedQuery) {
      setStockSearchItems([])
      return
    }

    if (!/^\d+$/.test(normalizedQuery) && normalizedQuery.length < 2) {
      setStockSearchItems([])
      return
    }

    const timer = window.setTimeout(() => {
      void loadStockSearchItems(normalizedQuery)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [stockDialogOpen, stockSearchQuery, selectedStore?.store_id])

  useEffect(() => {
    if (!stockViewDialogOpen) {
      return
    }

    const normalizedQuery = stockViewQuery.trim()

    if (!normalizedQuery) {
      setStockViewItems([])
      return
    }

    if (!/^\d+$/.test(normalizedQuery) && normalizedQuery.length < 2) {
      setStockViewItems([])
      return
    }

    const timer = window.setTimeout(() => {
      void searchStockViewItemsFresh(normalizedQuery)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [stockViewDialogOpen, stockViewQuery, selectedStore?.store_id])

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
        const activeIndex = lines.findIndex(
          (line) =>
            (line.item === item.item || line.good_id === item.item) &&
            toNumber(line.qty_final, 0) > 0
        )

        if (activeIndex >= 0) {
          return lines.map((line, index) => {
            if (index !== activeIndex) return line

            const step = 1
            const nextQty = toNumber(line.qty_final, 0) + step
            return recalcOrderLine(line, nextQty)
          })
        }

        const deletedIndex = lines.findIndex(
          (line) =>
            (line.item === item.item || line.good_id === item.item) &&
            toNumber(line.qty_final, 0) <= 0
        )

        if (deletedIndex >= 0) {
          return lines.map((line, index) =>
            index === deletedIndex ? mapStoreItemToOrderLine(item) : line
          )
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

    await openItemPicker('order')
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
    const step = qtyDialogLine.isfractional ? 0.001 : 1
    const next = Math.max(0, current + delta * step)

    const nextValue = qtyDialogLine.isfractional
      ? next.toFixed(3)
      : String(Math.round(next))

    setQtyDraft(nextValue)
    setQtyCaretIndex(nextValue.length)
  }

  function normalizeQtyValue(value: string) {
    if (!qtyDialogLine) return value

    if (!qtyDialogLine.isfractional) {
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

    if (!qtyDialogLine.isfractional && valueToInsert === '.') {
      return
    }

    if (qtyDialogLine.isfractional && valueToInsert === '.' && current.includes('.')) {
      return
    }

    let insertValue = valueToInsert

    if (qtyDialogLine.isfractional && valueToInsert === '.' && current.length === 0) {
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
    await openCashQrTopup()
  }

  async function openCashQrTopup() {
    const base = validateCashOperationBase()
    if (!base) return

    const { amount, user, store } = base

    setSbpLoading(true)
    setCashQrLoading(true)
    setError('')
    setCashOperationMessage('')

    try {
      const params = new URLSearchParams({
        amount: String(amount),
        login: String(user.user_account),
        store_id: String(store.store_id),
      })

      const res = await apiFetch(`${API_BASE}/cash/qr?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось сформировать QR пополнения'))
      }

      const data = await res.json()
      const qrBase64 = String(data.qr_base64 || '')

      if (!qrBase64 && !data.qr_url) {
        throw new Error('Сервер не вернул QR для пополнения')
      }

      setCashQrDialog({
		amount: Number(data.amount ? Number(data.amount) / 100 : amount),
        old_balance: Number(user.balance || 0),
        qr_base64: qrBase64,
        image_type: String(data.image_type || 'image/png'),
        qr_url: data.qr_url || null,
        ttl: Number(data.ttl || 15),
        created_at: Date.now(),
      })
    } catch (e: any) {
      setError(e.message || 'Ошибка СБП-пополнения')
    } finally {
      setSbpLoading(false)
      setCashQrLoading(false)
    }
  }

  function closeCashQrDialog() {
    setCashQrDialog(null)
    setCashQrLoading(false)
  }

  async function openCashoutCheck() {
    const base = validateCashOperationBase()
    if (!base) return

    const { amount, user, store } = base

    // Реальный остаток наличных в кассе берем только из /cashier/status
    // (/cashier/search содержит legacy-поля store.cash_balance/owner_balance и может возвращать 0/null).
    const cashInBox = Number(cashBalance || 0)
    if (cashInBox < amount) {
      setError('Недостаточно средств в кассе')
      return
    }

    if (!user.user_id) {
      setError('Не удалось выполнить выдачу: в данных пайщика нет user_id')
      return
    }

    setCashoutLoading(true)
    setError('')
    setCashOperationMessage('')

    try {
      const params = new URLSearchParams({
        user_id: String(user.user_id),
        amount: String(amount),
        store_id: String(store.store_id),
      })

      const res = await apiFetch(`${API_BASE}/cash/cashout/check?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось проверить выдачу'))
      }

      const data = await res.json()
      const amountWithComission = Number(data.amountwithcomission || amount)
      const customerBalance = Number(data.customerbalance || 0)

      if (customerBalance < amountWithComission) {
        throw new Error('Недостаточно средств пайщика')
      }

      setCashoutCheckDialog({
        amount,
        amountwithcomission: amountWithComission,
        customerbalance: customerBalance,
        cashierbalance: Number(data.cashierbalance || 0),
        moneyincashbox: Number(data.moneyincashbox || 0),
      })
      setCashoutPin('')

      if (shouldUseTouchKeypad()) {
        setMainKeypadTarget('cashoutPin')
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка проверки выдачи')
    } finally {
      setCashoutLoading(false)
    }
  }

  async function cashout() {
    if (!selectedStore || !foundUser || !cashoutCheckDialog) return

    if (!foundUser.user_id) {
      setError('Не удалось выполнить выдачу: в данных пайщика нет user_id')
      return
    }

    if (cashoutPin.length !== 4) {
      setError('Введите PIN-код из 4 цифр')
      return
    }

    setCashoutLoading(true)
    setError('')
    setCashOperationMessage('')

    try {
      const params = new URLSearchParams({
        user_id: String(foundUser.user_id),
        amount: String(cashoutCheckDialog.amount),
        pin: cashoutPin,
        store_id: String(selectedStore.store_id),
      })

      const res = await apiFetch(`${API_BASE}/cash/cashout?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(getErrorMessage(data, 'Не удалось выполнить выдачу'))
      }

      const data = await res.json()

      applyCashBalances(data)
      setCashoutCheckDialog(null)
      setCashoutPin('')
      setCashTopupAmount('')
      if (mainKeypadTarget === 'cashoutPin') setMainKeypadTarget(null)
      setCashOperationMessage('Выдача выполнена')
      showCashSuccess('Выдача выполнена', 'Наличные выданы пайщику.', data)
    } catch (e: any) {
      setError(e.message || 'Ошибка выдачи')
    } finally {
      setCashoutLoading(false)
    }
  }

  useEffect(() => {
    if (!cashQrDialog || !foundUser) return

    const ttlMs = Math.max(1, Number(cashQrDialog.ttl || 15)) * 60 * 1000
    let stopped = false

    const pollBalance = async () => {
      if (stopped || !cashQrDialog || !foundUser) return

      const elapsed = Date.now() - cashQrDialog.created_at
      if (elapsed >= ttlMs) {
        setCashQrDialog(null)
        setCashOperationMessage('Время действия QR истекло. При необходимости сформируйте новый QR.')
        return
      }

      try {
        const data = await fetchCurrentShareholderData(foundUser.user_account)
        const newBalance = Number(data.user.balance || 0)

        setFoundUser(data.user)
        setOrders(data.orders)
        setStoreState(data.store)

        if (newBalance > Number(cashQrDialog.old_balance || 0)) {
          setCashQrDialog(null)
          setCashTopupAmount('')
          setCashOperationMessage('Баланс пайщика обновлён')
          setCashSuccessDialog({
            title: 'СБП-пополнение выполнено',
            text: 'Баланс пайщика обновлён.',
            customerbalance: newBalance,
          })
        }
      } catch (e) {
        console.error('Ошибка проверки баланса пайщика по QR', e)
      }
    }

    const timer = window.setInterval(pollBalance, 30000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [cashQrDialog, foundUser?.user_account, cashier, selectedStore])



  if (selectedStore && cashier && stockDialogOpen) {
    const stockActionButtonLabel = stockSearchQuery.trim()
      ? (stockSearchLoading ? 'Ищем...' : 'Показать')
      : 'Выбрать товар'

    return (
      <div className="app">
        <header className="topbar orderTopbar" onPointerUp={handleTopbarPointerUp}>
          <div className="topbarLeft">
            <button className="menuButton" onClick={() => setSideMenuOpen(true)} aria-label="Открыть меню">
              ☰
            </button>
            <div>
              <div className="title">Приход товара</div>
              <div className="subtitle">
                Кассир: {cashier.cashier_account} · ТВТ: {selectedStore.store_name} · Сессия: {sessionId.slice(0, 8)}
              </div>
            </div>
          </div>
          <button className="secondary" onClick={closeStockReceiptScreen} disabled={stockLoading}>
            Назад
          </button>
        </header>

        {renderSideMenu()}

        <main className="stockReceiptScreen">
          <section className="stockReceiptMain">
            <div className="stockReceiptTop">
              <div>
                <h2>Оприходование товара</h2>
                <p className="muted">Найдите товар по ID, штрихкоду или названию, укажите количество и комментарий.</p>
              </div>
              <div className="stockReceiptStatus">
                <span>Точка выдачи</span>
                <b>{selectedStore.store_name}</b>
              </div>
            </div>

            <div className="stockReceiptLayout">
              <section className="stockReceiptSelectorCard">
                <div className="stockSearchBlock productSelectorBlock">
                  <label>Товар</label>
                  <div className="stockSearchRow productSelectorSearchRow stockReceiptSearchRow">
                    <input
                      ref={stockSearchInputRef}
                      value={stockSearchQuery}
                      onChange={(e) => setStockSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleStockProductAction()
                        }
                      }}
                      placeholder="ID, штрихкод или название товара"
                      autoComplete="off"
                    />
                    <button
                      className="primary"
                      onClick={handleStockProductAction}
                      disabled={stockSearchLoading}
                    >
                      {stockActionButtonLabel}
                    </button>
                  </div>

                  {stockSelectedItem && (
                    <div className="selectedProductCard stockReceiptSelectedProduct">
                      <div className="itemPhoto">
                        {stockSelectedItem.photo_url ? (
                          <img src={stockSelectedItem.photo_url} alt="" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>
                      <div>
                        <b>{stockSelectedItem.item_name}</b>
                        <span>Код {stockSelectedItem.item} · {getProductKindLabel(stockSelectedItem)}</span>
                        <span>
                          Остаток: {formatQty(stockSelectedItem.item_stock, stockSelectedItem.isfractional)} · Доступно: {formatQty(stockSelectedItem.available_qty, stockSelectedItem.isfractional)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary smallButton"
                        onClick={changeStockSelectedItem}
                        disabled={stockLoading}
                      >
                        Сменить товар
                      </button>
                    </div>
                  )}

                  {stockSearchQuery.trim() && stockSearchItems.length > 0 && (
                    <div className="stockSearchResults stockReceiptSearchResults">
                      {stockSearchItems.map((item) => (
                        <button
                          key={item.item}
                          className={String(item.item) === stockForm.item ? 'stockSearchItem selected' : 'stockSearchItem'}
                          onClick={() => selectStockItem(item)}
                          type="button"
                        >
                          <div>
                            <b>{item.item_name}</b>
                            <span>Код {item.item} · {getProductKindLabel(item)}</span>
                          </div>
                          <div>
                            <b>{formatMoney(item.price)}</b>
                            <span>Остаток: {formatQty(item.item_stock, item.isfractional)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {stockSearchQuery.trim() && !stockSearchLoading && stockSearchItems.length === 0 && !stockSelectedItem && (
                    <div className="emptyBox">Введите запрос или нажмите «Выбрать товар» для выбора из классификатора.</div>
                  )}
                </div>
              </section>

              <section className="stockReceiptOperationCard">
                <div className="stockField stockQtyBlock">
                  <label>Количество прихода</label>

                  {!stockSelectedItem ? (
                    <div className="emptyBox stockQtyHint">
                      Сначала выберите товар. После выбора откроется клавиатура количества: для штучного товара без точки, для весового — с десятичной точкой.
                    </div>
                  ) : (
                    <>
                      <div className="qtyControl stockQtyControl">
                        <button
                          type="button"
                          className="primary qtyBtn"
                          onClick={() => changeStockQtyDraft(-1)}
                          disabled={stockLoading}
                        >
                          -
                        </button>

                        <button
                          type="button"
                          className="qtyDisplay"
                          aria-label="Количество прихода"
                          onClick={() => setStockQtyCaretIndex(String(stockForm.qty_delta || '').length)}
                        >
                          {String(stockForm.qty_delta || '0').split('').map((char, index) => (
                            <span
                              key={`${char}-${index}`}
                              className="qtyDigitSlot"
                              onClick={(e) => {
                                e.stopPropagation()

                                if (!stockForm.qty_delta) {
                                  setStockQtyCaretIndex(0)
                                  return
                                }

                                const rect = e.currentTarget.getBoundingClientRect()
                                const nextIndex = e.clientX - rect.left < rect.width / 2 ? index : index + 1

                                setStockQtyCaretIndex(nextIndex)
                              }}
                            >
                              {stockForm.qty_delta && stockQtyCaretIndex === index && <span className="qtyCaret" />}
                              {char}
                            </span>
                          ))}
                          {stockForm.qty_delta && stockQtyCaretIndex >= String(stockForm.qty_delta).length && <span className="qtyCaret" />}
                          {!stockForm.qty_delta && <span className="qtyCaret" />}
                        </button>

                        <button
                          type="button"
                          className="primary qtyBtn"
                          onClick={() => changeStockQtyDraft(1)}
                          disabled={stockLoading}
                        >
                          +
                        </button>
                      </div>

                      <div className="qtyKeypad stockQtyKeypad" aria-label="Цифровая клавиатура прихода">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            className="qtyKeyBtn"
                            onClick={() => appendStockQtyDigit(digit)}
                            disabled={stockLoading}
                          >
                            {digit}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="qtyKeyBtn secondary"
                          onClick={backspaceStockQtyDraft}
                          disabled={stockLoading}
                        >
                          ←
                        </button>

                        <button
                          type="button"
                          className="qtyKeyBtn"
                          onClick={() => appendStockQtyDigit('0')}
                          disabled={stockLoading}
                        >
                          0
                        </button>

                        {stockSelectedItem.isfractional ? (
                          <button
                            type="button"
                            className="qtyKeyBtn"
                            onClick={appendStockQtyDot}
                            disabled={stockLoading}
                          >
                            .
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="qtyKeyBtn secondary"
                            onClick={clearStockQtyDraft}
                            disabled={stockLoading}
                          >
                            C
                          </button>
                        )}
                      </div>

                      <p className="muted stockQtyKindHint">
                        {stockSelectedItem.isfractional
                          ? `Весовой товар: можно вводить дробное количество, ${stockSelectedItem.unit || stockSelectedItem.pack || 'кг'}`
                          : 'Штучный товар: ввод только целыми числами'}
                      </p>
                    </>
                  )}
                </div>

                <label>Комментарий</label>
                <input
                  value={stockForm.comment}
                  onChange={(e) => updateStockField('comment', e.target.value)}
                  placeholder="Комментарий к приходу"
                />

                {stockMessage && <div className="notice">{stockMessage}</div>}
                {error && <div className="error">{error}</div>}

                <div className="stockReceiptActions">
                  <button className="secondary" onClick={closeStockReceiptScreen} disabled={stockLoading}>
                    Назад
                  </button>
                  <button className="primary" onClick={stockReceipt} disabled={stockLoading || !stockForm.item}>
                    {stockLoading ? 'Оприходуем...' : 'Оприходовать'}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </main>

        {stockSuccessDialog && (
          <div className="qtyOverlay">
            <div className="confirmDialog">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Операция выполнена</h2>
                  <p className="muted">Товар успешно оприходован на выбранную точку выдачи.</p>
                </div>
              </div>

              <div className="confirmDialogBody">
                <div className="confirmDialogSummary">
                  <span>Товар</span>
                  <b>{stockSuccessDialog.itemName}</b>
                </div>
                <div className="confirmDialogSummary">
                  <span>Количество</span>
                  <b>{stockSuccessDialog.qty}</b>
                </div>
              </div>

              <div className="confirmDialogActions">
                <button className="secondary" onClick={() => setStockSuccessDialog(null)}>
                  Ок
                </button>
                <button className="primary" onClick={closeStockReceiptScreen}>
                  Закрыть приход
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
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
          <div className="topbarActions">
            <button className="secondary" onClick={openStockReceiptScreen}>
              Приход
            </button>
            <button className="secondary" onClick={closeOrderScreen}>
              Назад к пайщику
            </button>
          </div>
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
                <div
                  className={`orderBalanceCard${orderBalanceRefreshLoading ? ' isRefreshing' : ''}`}
                  onPointerUp={handleOrderBalancePointerUp}
                  role="button"
                  tabIndex={0}
                  title="Дважды нажмите, чтобы обновить баланс"
                >
                  <span>{orderBalanceRefreshLoading ? 'Обновление...' : 'Баланс пайщика'}</span>
                  <b>{formatMoney(getVisibleOrderUserBalance(order))}</b>
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
                      line.isfractional ? 'weightLineRow' : '',
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
                        Код {line.item} · {line.isfractional ? `Весовой, ${line.pack ?? 'кг'}` : 'Штучный'}
                      </small>
                    </span>
                    <span>{formatQty(line.qty_final, line.isfractional)}</span>
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
                          {item.isfractional ? `Весовой · ${item.pack || 'кг'}` : 'Штучный товар'}
                        </span>
                      </div>

                      <div className="itemNumbers">
                        <b>{formatMoney(item.price)}</b>
                        <span>Доступно: {formatQty(item.available_qty, item.isfractional)}</span>
                        <span>{itemPickerMode === 'order' ? 'Добавить' : 'Выбрать'}</span>
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
                            <div>{formatQty(line.qty_final, line.isfractional)}</div>
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
                          Код {qtyDialogLine.item} · {qtyDialogLine.isfractional ? `Весовой, ${qtyDialogLine.pack ?? 'кг'}` : 'Штучный'}
                        </p>
                        <p className="muted">
                          Максимум: {formatQty(qtyDialogLine.max_qty_final, qtyDialogLine.isfractional)}
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
                      {qtyDialogLine.isfractional ? (
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
                      <b>{formatQty((deleteLineDialogLine || qtyDialogLine)!.qty_final, (deleteLineDialogLine || qtyDialogLine)!.isfractional)}</b>
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
                      <h2>{itemPickerMode === 'stockReceipt' ? 'Выбрать товар для прихода' : itemPickerMode === 'stockView' ? 'Выбрать товар для запасов' : 'Добавить товар'}</h2>
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
                        onClick={() => handleProductSelectedFromPicker(item)}
                        disabled={itemsLoading || (itemPickerMode === 'order' && item.available_qty <= 0)}
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
                            {item.isfractional
                              ? `Весовой · средний вес ${formatQty(item.avg_weight, true)} кг · ${item.pack || 'кг'}`
                              : 'Штучный товар'}
                          </span>
                        </div>

                        <div className="itemNumbers">
                          <b>{formatMoney(item.price)}</b>
                          <span>Остаток: {formatQty(item.item_stock, item.isfractional)}</span>
                          <span>Резерв: {formatQty(item.reserve, item.isfractional)}</span>
                          <span>Доступно: {formatQty(item.available_qty, item.isfractional)}</span>
                          <span>{itemPickerMode === 'order' ? 'Добавить' : 'Выбрать'}</span>
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
              Запасы
            </button>
            <button className="secondary" onClick={openStockReceiptScreen}>
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
          <div className="itemPickerOverlay stockWorkOverlay">
            <div className="itemPicker stockWorkScreen">
              <div className="itemPickerHeader stockWorkHeader">
                <div>
                  <h2>Запасы</h2>
                  <p className="muted">Поиск товара, оприходование и списание доступного количества</p>
                </div>
                <button className="secondary" onClick={() => setStockViewDialogOpen(false)} disabled={stockViewLoading}>
                  Закрыть
                </button>
              </div>

              <div className="stockWorkLayout">
                <section className="stockWorkSelectorCard">
                  <div className="productSelectorBlock">
                    <div className="stockSearchRow productSelectorSearchRow stockWorkSearchRow">
                      <input
                        value={stockViewQuery}
                        onChange={(e) => setStockViewQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            void handleStockViewProductAction()
                          }
                        }}
                        placeholder="Код, штрихкод или название товара"
                      />
                      <button
                        className="primary"
                        onClick={handleStockViewProductAction}
                        disabled={stockViewLoading}
                      >
                        {stockViewLoading ? 'Ищем...' : stockViewQuery.trim() ? 'Показать' : 'Выбрать товар'}
                      </button>
                    </div>

                    {stockViewSelectedItem && (
                      <div className="selectedProductCard stockWorkSelectedProduct">
                        <div className="itemPhoto">
                          {stockViewSelectedItem.photo_url ? (
                            <img src={stockViewSelectedItem.photo_url} alt="" />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>
                        <div>
                          <b>{stockViewSelectedItem.item_name}</b>
                          <span>Код {stockViewSelectedItem.item} · {getProductKindLabel(stockViewSelectedItem)}</span>
                          <span>Цена: {formatMoney(stockViewSelectedItem.price)}</span>
                          <span>
                            Остаток: {formatQty(stockViewSelectedItem.item_stock, stockViewSelectedItem.isfractional)} · Резерв: {formatQty(stockViewSelectedItem.reserve, stockViewSelectedItem.isfractional)}
                          </span>
                          <span>Доступно: {formatQty(stockViewSelectedItem.available_qty, stockViewSelectedItem.isfractional)}</span>
                        </div>
                        <button
                          type="button"
                          className="secondary smallButton"
                          onClick={() => {
                            setStockViewSelectedItem(null)
                            setStockViewQty('')
                            setStockViewComment('')
                            setStockViewQtyCaretIndex(0)
                            setStockViewMessage('Выберите новый товар из текущей выборки или через поиск')
                          }}
                        >
                          Сменить товар
                        </button>
                      </div>
                    )}

                    {stockViewItems.length > 0 && (
                      <div className="stockSearchResults stockWorkSearchResults">
                        {stockViewItems.map((item) => (
                          <button
                            key={item.item}
                            className={stockViewSelectedItem?.item === item.item ? 'stockSearchItem selected' : 'stockSearchItem'}
                            onClick={() => selectStockViewItem(item)}
                          >
                            <div>
                              <b>{item.item_name}</b>
                              <span>Код {item.item} · {getProductKindLabel(item)}</span>
                            </div>
                            <div>
                              <b>{formatMoney(item.price)}</b>
                              <span>Остаток: {formatQty(item.item_stock, item.isfractional)}</span>
                              <span>Доступно: {formatQty(item.available_qty, item.isfractional)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {stockViewItems.length === 0 && !stockViewLoading && (
                      <div className="emptyBox">Введите товар или нажмите «Выбрать товар»</div>
                    )}
                  </div>
                </section>

                <section className="stockWorkOperationCard">
                  <div>
                    <h3>Операция</h3>
                    <div className="stockWorkOperationSwitch">
                      <button
                        type="button"
                        className={stockViewOperation === 'post' ? 'stockWorkOperationButton post active' : 'stockWorkOperationButton post'}
                        onClick={() => setStockViewOperation('post')}
                      >
                        <b>Оприходовать</b>
                        <span>Остаток увеличится</span>
                      </button>
                      <button
                        type="button"
                        className={stockViewOperation === 'writeoff' ? 'stockWorkOperationButton writeoff active' : 'stockWorkOperationButton writeoff'}
                        onClick={() => setStockViewOperation('writeoff')}
                      >
                        <b>Списать</b>
                        <span>Доступное количество уменьшится</span>
                      </button>
                    </div>
                  </div>

                  <div className="stockField stockQtyBlock">
                    <label>{stockViewOperation === 'writeoff' ? 'Количество списания' : 'Количество прихода'}</label>

                    {!stockViewSelectedItem ? (
                      <div className="emptyBox stockQtyHint">
                        Сначала выберите товар. Для штучного товара доступен ввод только целыми числами, для весового — дробное количество.
                      </div>
                    ) : (
                      <>
                        <div className="qtyControl stockQtyControl">
                          <button
                            type="button"
                            className="primary qtyBtn"
                            onClick={() => changeStockViewQtyDraft(-1)}
                            disabled={stockViewLoading}
                          >
                            -
                          </button>

                          <button
                            type="button"
                            className="qtyDisplay"
                            aria-label="Количество операции"
                            onClick={() => setStockViewQtyCaretIndex(String(stockViewQty || '').length)}
                          >
                            {String(stockViewQty || '0').split('').map((char, index) => (
                              <span
                                key={`${char}-${index}`}
                                className="qtyDigitSlot"
                                onClick={(e) => {
                                  e.stopPropagation()

                                  if (!stockViewQty) {
                                    setStockViewQtyCaretIndex(0)
                                    return
                                  }

                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const nextIndex = e.clientX - rect.left < rect.width / 2 ? index : index + 1

                                  setStockViewQtyCaretIndex(nextIndex)
                                }}
                              >
                                {stockViewQty && stockViewQtyCaretIndex === index && <span className="qtyCaret" />}
                                {char}
                              </span>
                            ))}
                            {stockViewQty && stockViewQtyCaretIndex >= String(stockViewQty).length && <span className="qtyCaret" />}
                            {!stockViewQty && <span className="qtyCaret" />}
                          </button>

                          <button
                            type="button"
                            className="primary qtyBtn"
                            onClick={() => changeStockViewQtyDraft(1)}
                            disabled={stockViewLoading}
                          >
                            +
                          </button>
                        </div>

                        <div className="qtyKeypad stockQtyKeypad" aria-label="Цифровая клавиатура запасов">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              className="qtyKeyBtn"
                              onClick={() => appendStockViewQtyDigit(digit)}
                              disabled={stockViewLoading}
                            >
                              {digit}
                            </button>
                          ))}

                          <button
                            type="button"
                            className="qtyKeyBtn secondary"
                            onClick={backspaceStockViewQtyDraft}
                            disabled={stockViewLoading}
                          >
                            ←
                          </button>

                          <button
                            type="button"
                            className="qtyKeyBtn"
                            onClick={() => appendStockViewQtyDigit('0')}
                            disabled={stockViewLoading}
                          >
                            0
                          </button>

                          {stockViewSelectedItem.isfractional ? (
                            <button
                              type="button"
                              className="qtyKeyBtn"
                              onClick={appendStockViewQtyDot}
                              disabled={stockViewLoading}
                            >
                              .
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="qtyKeyBtn secondary"
                              onClick={clearStockViewQtyDraft}
                              disabled={stockViewLoading}
                            >
                              C
                            </button>
                          )}
                        </div>

                        <p className="muted stockQtyKindHint">
                          {stockViewSelectedItem.isfractional
                            ? `Весовой товар: можно вводить дробное количество, ${stockViewSelectedItem.unit || stockViewSelectedItem.pack || 'кг'}`
                            : 'Штучный товар: ввод только целыми числами'}
                        </p>

                        {stockViewOperation === 'writeoff' && (
                          <p className="muted stockQtyHint">
                            Доступно для списания: {formatQty(stockViewSelectedItem.available_qty, stockViewSelectedItem.isfractional)}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <label>Комментарий</label>
                  <input
                    value={stockViewComment}
                    onChange={(e) => setStockViewComment(e.target.value)}
                    placeholder="Комментарий к операции"
                  />

                  {stockViewMessage && <div className="notice">{stockViewMessage}</div>}
                  {error && <div className="error">{error}</div>}

                  <div className="stockWorkActions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setStockViewQty('')
                        setStockViewComment('')
                        setStockViewQtyCaretIndex(0)
                        setStockViewMessage('')
                      }}
                      disabled={stockViewLoading}
                    >
                      Очистить
                    </button>
                    <button
                      className={stockViewOperation === 'writeoff' ? 'danger' : 'primary'}
                      onClick={performStockViewOperation}
                      disabled={stockViewLoading || !stockViewSelectedItem}
                    >
                      {stockViewLoading
                        ? 'Выполняем...'
                        : stockViewOperation === 'writeoff'
                          ? 'Списать'
                          : 'Оприходовать'}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}



        {stockViewSuccessDialog && (
          <div className="qtyOverlay">
            <div className="cashTopupConfirmDialog">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Операция выполнена</h2>
                  <p className="muted">
                    {stockViewSuccessDialog.operation === 'writeoff' ? 'Списание товара' : 'Оприходование товара'}
                  </p>
                </div>
                <button className="secondary" onClick={() => setStockViewSuccessDialog(null)}>
                  Закрыть
                </button>
              </div>

              <div className="cashTopupConfirmBody">
                <div className="cashTopupConfirmRow">
                  <span>Товар</span>
                  <b>{stockViewSuccessDialog.itemName}</b>
                </div>
                <div className="cashTopupConfirmAmount">
                  <span>Количество</span>
                  <b>{stockViewSuccessDialog.qty}</b>
                </div>
                <div className="cashTopupConfirmActions">
                  <button className="secondary" onClick={() => setStockViewSuccessDialog(null)}>
                    Новая операция
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setStockViewSuccessDialog(null)
                      setStockViewDialogOpen(false)
                    }}
                  >
                    Закрыть
                  </button>
                </div>
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
                <div className="stockSearchBlock stockFull productSelectorBlock">
                  <label>Товар</label>
                  <div className="stockSearchRow productSelectorSearchRow">
                    <input
                      ref={stockSearchInputRef}
                      value={stockSearchQuery}
                      onChange={(e) => setStockSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          loadStockSearchItems(stockSearchQuery)
                        }
                      }}
                      placeholder="ID, штрихкод или название товара"
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
                      onClick={() => openItemPicker('stockReceipt')}
                    >
                      Выбрать товар
                    </button>
                  </div>

                  {stockSelectedItem && (
                    <div className="selectedProductCard">
                      <div className="itemPhoto">
                        {stockSelectedItem.photo_url ? (
                          <img src={stockSelectedItem.photo_url} alt="" />
                        ) : (
                          <span>📦</span>
                        )}
                      </div>
                      <div>
                        <b>{stockSelectedItem.item_name}</b>
                        <span>Код {stockSelectedItem.item} · {getProductKindLabel(stockSelectedItem)}</span>
                        <span>Остаток: {formatQty(stockSelectedItem.item_stock, stockSelectedItem.isfractional)} · Доступно: {formatQty(stockSelectedItem.available_qty, stockSelectedItem.isfractional)}</span>
                      </div>
                      <button
                        type="button"
                        className="secondary smallButton"
                        onClick={changeStockSelectedItem}
                      >
                        Сменить товар
                      </button>
                    </div>
                  )}

                  {stockSearchItems.length > 0 && (
                    <div className="stockSearchResults">
                      {stockSearchItems.map((item) => (
                        <button
                          key={item.item}
                          className={String(item.item) === stockForm.item ? 'stockSearchItem selected' : 'stockSearchItem'}
                          onClick={() => selectStockItem(item)}
                        >
                          <div>
                            <b>{item.item_name}</b>
                            <span>Код {item.item} · {getProductKindLabel(item)}</span>
                          </div>
                          <div>
                            <b>{formatMoney(item.price)}</b>
                            <span>Остаток: {formatQty(item.item_stock, item.isfractional)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="stockField stockFull stockQtyBlock">
                  <label>Количество прихода</label>

                  {!stockSelectedItem ? (
                    <div className="emptyBox stockQtyHint">
                      Сначала выберите товар. После выбора откроется клавиатура количества: для штучного товара без точки, для весового — с десятичной точкой.
                    </div>
                  ) : (
                    <>
                      <div className="qtyControl stockQtyControl">
                        <button
                          type="button"
                          className="primary qtyBtn"
                          onClick={() => changeStockQtyDraft(-1)}
                          disabled={stockLoading}
                        >
                          -
                        </button>

                        <button
                          type="button"
                          className="qtyDisplay"
                          aria-label="Количество прихода"
                          onClick={() => setStockQtyCaretIndex(String(stockForm.qty_delta || '').length)}
                        >
                          {String(stockForm.qty_delta || '0').split('').map((char, index) => (
                            <span
                              key={`${char}-${index}`}
                              className="qtyDigitSlot"
                              onClick={(e) => {
                                e.stopPropagation()

                                if (!stockForm.qty_delta) {
                                  setStockQtyCaretIndex(0)
                                  return
                                }

                                const rect = e.currentTarget.getBoundingClientRect()
                                const nextIndex = e.clientX - rect.left < rect.width / 2 ? index : index + 1

                                setStockQtyCaretIndex(nextIndex)
                              }}
                            >
                              {stockForm.qty_delta && stockQtyCaretIndex === index && <span className="qtyCaret" />}
                              {char}
                            </span>
                          ))}
                          {stockForm.qty_delta && stockQtyCaretIndex >= String(stockForm.qty_delta).length && <span className="qtyCaret" />}
                          {!stockForm.qty_delta && <span className="qtyCaret" />}
                        </button>

                        <button
                          type="button"
                          className="primary qtyBtn"
                          onClick={() => changeStockQtyDraft(1)}
                          disabled={stockLoading}
                        >
                          +
                        </button>
                      </div>

                      <div className="qtyKeypad stockQtyKeypad" aria-label="Цифровая клавиатура прихода">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            className="qtyKeyBtn"
                            onClick={() => appendStockQtyDigit(digit)}
                            disabled={stockLoading}
                          >
                            {digit}
                          </button>
                        ))}

                        <button
                          type="button"
                          className="qtyKeyBtn secondary"
                          onClick={backspaceStockQtyDraft}
                          disabled={stockLoading}
                        >
                          ←
                        </button>

                        <button
                          type="button"
                          className="qtyKeyBtn"
                          onClick={() => appendStockQtyDigit('0')}
                          disabled={stockLoading}
                        >
                          0
                        </button>

                        {stockSelectedItem.isfractional ? (
                          <button
                            type="button"
                            className="qtyKeyBtn"
                            onClick={appendStockQtyDot}
                            disabled={stockLoading}
                          >
                            .
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="qtyKeyBtn secondary"
                            onClick={clearStockQtyDraft}
                            disabled={stockLoading}
                          >
                            C
                          </button>
                        )}
                      </div>

                      <p className="muted stockQtyKindHint">
                        {stockSelectedItem.isfractional
                          ? `Весовой товар: можно вводить дробное количество, ${stockSelectedItem.unit || stockSelectedItem.pack || 'кг'}`
                          : 'Штучный товар: ввод только целыми числами'}
                      </p>
                    </>
                  )}
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
                <button className="primary" onClick={stockReceipt} disabled={stockLoading || !stockForm.item}>
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

        {cashQrDialog && foundUser && (
          <div className="qtyOverlay">
            <div className="qtyDialog cashQrDialog" role="dialog" aria-modal="true">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Пополнение П/С через СБП</h2>
                  <p className="muted">Пайщик {foundUser.user_account}</p>
                </div>
                <button className="secondary" onClick={closeCashQrDialog} disabled={cashQrLoading}>
                  Закрыть
                </button>
              </div>

              <div className="qtyDialogBody">
                <div className="cashTopupConfirmAmount">
                  <span>Сумма пополнения</span>
                  <b>{formatMoney(cashQrDialog.amount)}</b>
                </div>

                <div className="cashQrImageBox">
                  {cashQrDialog.qr_base64 ? (
                    <img
                      src={buildQrImageSrc(cashQrDialog.qr_base64, cashQrDialog.image_type)}
                      alt="QR для пополнения баланса"
                    />
                  ) : (
                    <div className="emptyBox">QR-картинка недоступна</div>
                  )}
                </div>

                <p className="muted cashQrHint">
                  Проверяем баланс пайщика каждые 30 секунд. QR действует {cashQrDialog.ttl} мин.
                </p>

                {cashQrDialog.qr_url && (
                  <p className="muted cashQrUrl">{cashQrDialog.qr_url}</p>
                )}

                <div className="qtyActions">
                  <button className="secondary" onClick={closeCashQrDialog} disabled={cashQrLoading}>
                    Закрыть
                  </button>
                  <button className="primary" onClick={openCashQrTopup} disabled={cashQrLoading || sbpLoading}>
                    {cashQrLoading || sbpLoading ? 'Формируем...' : 'Сформировать заново'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {cashoutCheckDialog && foundUser && (
          <div className="qtyOverlay">
            <div className="cashTopupConfirmDialog cashoutPinDialog" role="dialog" aria-modal="true">
              <div className="qtyDialogHeader">
                <div>
                  <h2>Подтвердить выдачу</h2>
                  <p className="muted">Введите PIN-код пайщика</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setCashoutCheckDialog(null)
                    setCashoutPin('')
                    if (mainKeypadTarget === 'cashoutPin') setMainKeypadTarget(null)
                  }}
                  disabled={cashoutLoading}
                >
                  Закрыть
                </button>
              </div>

              <div className="cashTopupConfirmBody">
                <div className="cashTopupConfirmRow">
                  <span>Пайщик</span>
                  <b>{foundUser.user_account}</b>
                </div>

                <div className="cashTopupConfirmAmount">
                  <span>Сумма выдачи</span>
                  <b>{formatMoney(cashoutCheckDialog.amount)}</b>
                </div>

                <div className="cashTopupConfirmRow">
                  <span>С учетом комиссии</span>
                  <b>{formatMoney(cashoutCheckDialog.amountwithcomission)}</b>
                </div>

                <label>PIN-код</label>
                <input
                  value={cashoutPin}
                  onChange={(e) => setCashoutPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onFocus={() => {
                    if (shouldUseTouchKeypad()) setMainKeypadTarget('cashoutPin')
                  }}
                  onClick={() => {
                    if (shouldUseTouchKeypad()) setMainKeypadTarget('cashoutPin')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void cashout()
                    }
                  }}
                  type={shouldUseTouchKeypad() ? 'text' : 'password'}
                  readOnly={shouldUseTouchKeypad()}
                  inputMode={shouldUseTouchKeypad() ? 'none' : 'numeric'}
                  enterKeyHint="done"
                  maxLength={4}
                  placeholder="4 цифры"
                />

                {error && <div className="error">{error}</div>}

                <div className="cashTopupConfirmActions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCashoutCheckDialog(null)
                      setCashoutPin('')
                      if (mainKeypadTarget === 'cashoutPin') setMainKeypadTarget(null)
                    }}
                    disabled={cashoutLoading}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={cashout}
                    disabled={cashoutLoading || cashoutPin.length !== 4}
                  >
                    {cashoutLoading ? 'Выдаем...' : 'Выдать'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {cashSuccessDialog && (
          <div className="qtyOverlay">
            <div className="cashTopupConfirmDialog" role="dialog" aria-modal="true">
              <div className="qtyDialogHeader">
                <div>
                  <h2>{cashSuccessDialog.title}</h2>
                  <p className="muted">{cashSuccessDialog.text}</p>
                </div>
                <button className="secondary" onClick={() => setCashSuccessDialog(null)}>
                  Закрыть
                </button>
              </div>

              <div className="cashTopupConfirmBody">
                {cashSuccessDialog.customerbalance !== undefined && (
                  <div className="cashTopupConfirmRow">
                    <span>Баланс пайщика</span>
                    <b>{formatMoney(cashSuccessDialog.customerbalance)}</b>
                  </div>
                )}
                {cashSuccessDialog.cashierbalance !== undefined && (
                  <div className="cashTopupConfirmRow">
                    <span>П/С владельца ТВТ</span>
                    <b>{formatMoney(cashSuccessDialog.cashierbalance)}</b>
                  </div>
                )}
                {cashSuccessDialog.moneyincashbox !== undefined && (
                  <div className="cashTopupConfirmRow">
                    <span>Нал. в кассе</span>
                    <b>{formatMoney(cashSuccessDialog.moneyincashbox)}</b>
                  </div>
                )}

                <div className="cashTopupConfirmActions">
                  <button className="primary" onClick={() => setCashSuccessDialog(null)}>
                    ОК
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

        {false && sbpDialogOpen && !orderDetails && (
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
                ref={searchInputRef}
                className="bigInput"
                placeholder="№ П/С, телефон или номер заказа"
                value={searchQuery}
                inputMode={shouldUseTouchKeypad() ? 'none' : 'decimal'}
                autoComplete="off"
                enterKeyHint="search"
                onFocus={(e) => {
                  activeSearchInputSourceRef.current = 'main'
                  rememberSearchCaret(e.currentTarget, 'main')
                  if (shouldUseTouchKeypad()) setMainKeypadTarget('search')
                }}
                onClick={(e) => {
                  activeSearchInputSourceRef.current = 'main'
                  rememberSearchCaret(e.currentTarget, 'main')
                  if (shouldUseTouchKeypad()) setMainKeypadTarget('search')
                }}
                onKeyUp={(e) => rememberSearchCaret(e.currentTarget, 'main')}
                onSelect={(e) => rememberSearchCaret(e.currentTarget, 'main')}
                onChange={(e) => handleSearchInputChange(e.target.value, e.currentTarget, 'main')}
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
                  searchCaretRangeRef.current = { start: 0, end: 0 }
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
            {cashOperationMessage && <div className="notice">{cashOperationMessage}</div>}
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
                <label>Сумма операции</label>
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
                onClick={openCashQrTopup}
                disabled={!foundUser || sbpLoading || cashQrLoading}
              >
                {sbpLoading || cashQrLoading ? 'QR...' : 'СБП'}
              </button>
              <button
                className="secondary"
                onClick={openCashoutCheck}
                disabled={!foundUser || cashoutLoading}
              >
                {cashoutLoading ? 'Проверяем...' : 'Выдать'}
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
                  onClick={() => selectStore(store).catch((e: any) => {
                    setError(e.message || 'Ошибка выбора точки выдачи')
                  })}
                  disabled={storeSelectLoading}
                >
                  <span className="storeName">{store.store_name}</span>
                  <span className="storeAddress">{store.store_address || 'Адрес не указан'}</span>
                  <span className="storeMeta">
                    ТВТ {store.store_id} · Склад {store.default_warehouse ?? '—'} · Владелец {store.owner_account ?? '—'}
                  </span>
                </button>
              ))}
            </div>

            <button className="secondary full" onClick={logoutCashier} disabled={storeSelectLoading}>
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
