export interface Role {
  id: number
  name: string
  description?: string | null
  isSystem?: boolean
  permissions?: string[]
}

export interface PermissionDef {
  id: number
  module: string
  action: string
}

export interface AuthUser {
  id: number
  username: string
  fullName: string
  email: string | null
  role: Role
  permissions: string[]
}

export interface UserRecord {
  id: number
  username: string
  fullName: string
  email: string | null
  status: 'active' | 'inactive'
  role: Role
  lastLogin: string | null
  createdAt: string
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface Customer {
  id: number
  customerCode: string | null
  name: string
  phone: string | null
  alternatePhone: string | null
  email: string | null
  address: string | null
  panVatNumber: string | null
  idCardType: string | null
  idCardNumber: string | null
  idCardImageUrl: string | null
  openingBalance: string
  creditLimit: string
  isActive: boolean
}

export interface Supplier {
  id: number
  supplierCode: string | null
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  panVatNumber: string | null
  paymentTermsDays: number
  isActive: boolean
}

export interface Category {
  id: number
  name: string
  parentId: number | null
  isActive: boolean
  children?: Category[]
}

export interface StockBalance {
  id: number
  quantity: string
  warehouse: { id: number; name: string; code: string }
}

export interface ItemUnitConversion {
  id: number
  unitId: number
  factor: string
  unit: { id: number; name: string; abbreviation: string | null }
}

export interface Item {
  id: number
  itemCode: string
  barcode: string | null
  name: string
  description: string | null
  imageUrl: string | null
  taxType: string
  taxRateId: number | null
  purchasePrice: string
  sellingPrice: string
  priceListPrices?: ItemPriceListEntry[]
  minimumStock: string
  reorderLevel: string
  isStockItem: boolean
  isActive: boolean
  category: { id: number; name: string } | null
  brand: { id: number; name: string } | null
  unit: { id: number; name: string; abbreviation: string } | null
  unitConversions?: ItemUnitConversion[]
  stockBalances: StockBalance[]
}

export interface TopSellingItem {
  itemId: number
  name: string
  itemCode: string
  quantity: number
  revenue: number
}

export interface TaxRate {
  id: number
  name: string
  rate: number
  isDefault: boolean
}

export interface PriceList {
  id: number
  code: string
  name: string
  description: string | null
  isDefault: boolean
}

export interface ItemPriceListEntry {
  id: number
  priceListId: number
  unitId: number | null
  price: string
  unit?: { id: number; name: string; abbreviation: string | null } | null
  priceList?: { id: number; name: string; code: string }
}

export interface WalkinCustomer {
  id: number
  name: string
  customerCode: string | null
}

export interface CompanySettings {
  companyName: string
  companyLogo: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  phone: string | null
  email: string | null
  panVatNumber: string | null
  currencyCode: string
  invoiceFooter: string | null
}

export interface SalesInvoiceLine {
  id: string | number
  itemId: number
  unitId?: number | null
  conversionFactor?: string
  quantity: string
  unitPrice: string
  discountPct: string
  taxAmount: string
  lineTotal: string
  item?: Item
  unit?: { id: number; name: string; abbreviation: string | null } | null
}

export interface SalesInvoiceDetail {
  id: string | number
  invoiceNumber: string
  invoiceDate: string
  subtotal: string
  discountAmount: string
  taxAmount: string
  grandTotal: string
  paidAmount: string
  outstandingAmount: string
  isCredit: boolean
  paymentMethod?: string | null
  notes: string | null
  customer: { id: number; name: string } | null
  items: SalesInvoiceLine[]
}

export interface DashboardStats {
  today: { sales: string; collected: string; invoiceCount: number }
  month: { sales: string; tax: string; invoiceCount: number }
  totals: {
    customers: number
    items: number
    lowStock: number
    receivable: string
    payable: string
  }
  topItems: TopSellingItem[]
}
