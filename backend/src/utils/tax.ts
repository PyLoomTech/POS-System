import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface TaxLineItem {
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxType: 'taxable_exclusive' | 'taxable_inclusive' | 'non_taxable' | 'zero_rated' | 'exempt';
  taxRate?: number; // percentage e.g. 13
}

export interface TaxCalculationResult {
  lineTotal: Decimal;
  baseAmount: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  nonTaxableAmount: Decimal;
}

export function calculateLineTax(item: TaxLineItem): TaxCalculationResult {
  const qty = new Decimal(item.quantity);
  const price = new Decimal(item.unitPrice);
  const discPct = new Decimal(item.discountPct || 0);
  const rate = new Decimal(item.taxRate || 0);

  const grossAmount = qty.times(price);
  const discountAmount = grossAmount.times(discPct).dividedBy(100);
  const baseAmount = grossAmount.minus(discountAmount);

  let taxableAmount = new Decimal(0);
  let taxAmount = new Decimal(0);
  let nonTaxableAmount = new Decimal(0);
  let lineTotal = new Decimal(0);

  switch (item.taxType) {
    case 'taxable_exclusive':
      taxableAmount = baseAmount;
      taxAmount = baseAmount.times(rate).dividedBy(100);
      lineTotal = baseAmount.plus(taxAmount);
      break;
    case 'taxable_inclusive':
      // Price already includes tax — extract it
      taxAmount = baseAmount.times(rate).dividedBy(new Decimal(100).plus(rate));
      taxableAmount = baseAmount.minus(taxAmount);
      lineTotal = baseAmount;
      break;
    case 'non_taxable':
    case 'zero_rated':
    case 'exempt':
      nonTaxableAmount = baseAmount;
      lineTotal = baseAmount;
      break;
  }

  return { lineTotal, baseAmount, discountAmount, taxableAmount, taxAmount, nonTaxableAmount };
}

export interface InvoiceTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  nonTaxableAmount: Decimal;
  grandTotal: Decimal;
}

export function calculateInvoiceTotals(items: TaxCalculationResult[]): InvoiceTotals {
  const subtotal = items.reduce((s, i) => s.plus(i.baseAmount), new Decimal(0));
  const discountAmount = items.reduce((s, i) => s.plus(i.discountAmount), new Decimal(0));
  const taxableAmount = items.reduce((s, i) => s.plus(i.taxableAmount), new Decimal(0));
  const taxAmount = items.reduce((s, i) => s.plus(i.taxAmount), new Decimal(0));
  const nonTaxableAmount = items.reduce((s, i) => s.plus(i.nonTaxableAmount), new Decimal(0));
  const grandTotal = taxableAmount.plus(taxAmount).plus(nonTaxableAmount);

  return { subtotal, discountAmount, taxableAmount, taxAmount, nonTaxableAmount, grandTotal };
}

export function calculateChange(cashTendered: number, amountDue: number): Decimal {
  const tendered = new Decimal(cashTendered);
  const due = new Decimal(amountDue);
  const change = tendered.minus(due);
  return change.isNegative() ? new Decimal(0) : change;
}
