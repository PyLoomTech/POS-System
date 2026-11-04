import { prisma } from '../config/database';

/**
 * Generate the next sequential document number for a given series.
 * Uses a database transaction with row-level lock to ensure uniqueness.
 */
export async function getNextNumber(seriesCode: string): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    // Lock the row for update
    const series = await tx.$queryRaw<any[]>`
      SELECT * FROM numbering_series WHERE series_code = ${seriesCode} FOR UPDATE
    `;

    if (!series || series.length === 0) {
      throw new Error(`Numbering series '${seriesCode}' not found.`);
    }

    const s = series[0];
    const currentYear = new Date().getFullYear().toString();

    let lastNumber = Number(s.last_number);

    // Reset yearly if configured and year changed
    if (s.reset_yearly && s.current_year !== currentYear) {
      lastNumber = 0;
    }

    const nextNumber = lastNumber + 1;
    const paddedNumber = String(nextNumber).padStart(s.padding, '0');

    // Update the series
    await tx.$executeRaw`
      UPDATE numbering_series
      SET last_number = ${nextNumber}, current_year = ${currentYear}
      WHERE series_code = ${seriesCode}
    `;

    return `${s.prefix}-${currentYear}-${paddedNumber}`;
  });
}
