import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Pyloom POS database...');

  // 1. Roles
  const roles = await Promise.all([
    prisma.role.upsert({ where: { name: 'Super Administrator' }, update: {}, create: { name: 'Super Administrator', description: 'Full system access', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Administrator' }, update: {}, create: { name: 'Administrator', description: 'Administrative access', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Manager' }, update: {}, create: { name: 'Manager', description: 'Management access', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Cashier' }, update: {}, create: { name: 'Cashier', description: 'POS billing only', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Accountant' }, update: {}, create: { name: 'Accountant', description: 'Accounting and reports', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Inventory Manager' }, update: {}, create: { name: 'Inventory Manager', description: 'Inventory operations', isSystem: true } }),
    prisma.role.upsert({ where: { name: 'Purchase Officer' }, update: {}, create: { name: 'Purchase Officer', description: 'Purchase management', isSystem: true } }),
  ]);
  console.log('Roles seeded.');

  // 2. Permissions
  const permDefs = [
    ['users','view'],['users','create'],['users','edit'],
    ['customers','view'],['customers','create'],['customers','edit'],
    ['suppliers','view'],['suppliers','create'],['suppliers','edit'],
    ['items','view'],['items','create'],['items','edit'],
    ['inventory','view'],['inventory','create'],['inventory','approve'],
    ['purchases','view'],['purchases','create'],['purchases','approve'],
    ['sales','view'],['sales','create'],['sales','cancel'],['sales','return'],
    ['returns','view'],['returns','create'],
    ['payments','view'],['payments','create'],
    ['accounting','view'],['accounting','post'],['accounting','journal'],
    ['reports','view'],['reports','export'],
    ['settings','view'],['settings','edit'],
    ['dashboard','view'],
  ];
  const perms: any[] = [];
  for (const [module, action] of permDefs) {
    const p = await prisma.permission.upsert({
      where: { module_action: { module, action } },
      update: {},
      create: { module, action },
    });
    perms.push(p);
  }
  console.log('Permissions seeded.');

  // 3. Role → permission matrix, assigned by designation
  const superAdminRole = roles[0];

  const ROLE_PERMISSIONS: Record<string, 'all' | string[]> = {
    'Super Administrator': 'all',
    Administrator: 'all',
    // Runs the shop day to day: full operations, but no user administration
    // and no company-settings changes.
    Manager: [
      'dashboard:view', 'users:view',
      'customers:view', 'customers:create', 'customers:edit',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'items:view', 'items:create', 'items:edit',
      'inventory:view', 'inventory:create', 'inventory:approve',
      'purchases:view', 'purchases:create', 'purchases:approve',
      'sales:view', 'sales:create', 'sales:cancel', 'sales:return',
      'returns:view', 'returns:create',
      'payments:view', 'payments:create',
      'accounting:view',
      'reports:view', 'reports:export',
      'settings:view',
    ],
    // Till operator: bill customers, take payments, handle a return at the counter.
    Cashier: [
      'dashboard:view',
      'customers:view', 'customers:create',
      'items:view',
      'sales:view', 'sales:create', 'sales:return',
      'returns:view',
      'payments:view', 'payments:create',
    ],
    // Books plus stock oversight: ledger, journal, VAT, reports and inventory.
    Accountant: [
      'dashboard:view',
      'customers:view', 'suppliers:view',
      'items:view',
      'inventory:view', 'inventory:create', 'inventory:approve',
      'sales:view', 'purchases:view', 'returns:view',
      'payments:view', 'payments:create',
      'accounting:view', 'accounting:post', 'accounting:journal',
      'reports:view', 'reports:export',
    ],
    // Stock keeper: items, stock levels, adjustments and goods receipts.
    'Inventory Manager': [
      'dashboard:view',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'items:view', 'items:create', 'items:edit',
      'inventory:view', 'inventory:create', 'inventory:approve',
      'purchases:view', 'purchases:create',
      'sales:view',
      'reports:view', 'reports:export',
    ],
    // Buys stock: suppliers, purchase invoices and supplier payments.
    'Purchase Officer': [
      'dashboard:view',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'items:view', 'items:create',
      'inventory:view', 'inventory:create',
      'purchases:view', 'purchases:create', 'purchases:approve',
      'payments:view', 'payments:create',
      'reports:view', 'reports:export',
    ],
  };

  // Bootstrap the defaults only once. After that an administrator owns the
  // matrix via Users → Roles & Permissions, so re-running the seed must not
  // silently overwrite their customization.
  const configuredRoles = await prisma.rolePermission.count();
  if (configuredRoles > 0) {
    console.log('Role permissions already configured — kept as-is (edit in Users → Roles & Permissions).');
  } else {
    for (const role of roles) {
      const grant = ROLE_PERMISSIONS[role.name];
      if (!grant) continue;
      const wanted =
        grant === 'all' ? perms.map((p) => `${p.module}:${p.action}`) : grant;
      const granted = perms.filter((p) => wanted.includes(`${p.module}:${p.action}`));
      for (const p of granted) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
          update: {},
          create: { roleId: role.id, permissionId: p.id },
        }).catch(() => {});
      }
      console.log(`  ${role.name}: ${granted.length} permission(s)`);
    }
    console.log('Role permissions assigned.');
  }

  // 4. Default super admin user
  const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin@2081', 12);
    await prisma.user.create({
      data: {
        username: 'admin',
        fullName: 'System Administrator',
        email: 'admin@pyloom.com',
        passwordHash: hash,
        roleId: superAdminRole.id,
        status: 'active',
      },
    });
    console.log('Default admin user created. Username: admin | Password: Admin@2081');
    console.log('IMPORTANT: Change the default password immediately after first login!');
  }

  // 5. Tax rates
  await prisma.taxRate.upsert({ where: { id: 1 }, update: {}, create: { name: 'VAT 13%', rate: 13.00, isDefault: true, isActive: true } });
  await prisma.taxRate.upsert({ where: { id: 2 }, update: {}, create: { name: 'Zero Rated', rate: 0.00, isDefault: false, isActive: true } });
  await prisma.taxRate.upsert({ where: { id: 3 }, update: {}, create: { name: 'Non-taxable', rate: 0.00, isDefault: false, isActive: true } });
  console.log('Tax rates seeded.');

  // 6. Units
  const units = [
    ['Piece','Pcs'],['Packet','Pkt'],['Box','Box'],['Kilogram','Kg'],
    ['Gram','g'],['Liter','Ltr'],['Meter','m'],['Dozen','Dz'],['Set','Set'],
  ];
  for (const [name, abbreviation] of units) {
    await prisma.unit.upsert({ where: { name }, update: {}, create: { name, abbreviation } });
  }
  console.log('Units seeded.');

  // 7. Warehouse
  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { code: 'MAIN', name: 'Main Store', isDefault: true, isActive: true },
  });
  console.log('Warehouse seeded.');

  await prisma.priceList.upsert({
    where: { code: 'DEFAULT' },
    update: { isActive: true },
    create: {
      code: 'DEFAULT',
      name: 'Default Price List',
      description: 'Default retail price list using item selling prices.',
      isDefault: true,
      isActive: true,
    },
  });
  console.log('Default price list seeded.');

  // 8. Walk-in customer
  const walkin = await prisma.customer.findFirst({ where: { isWalkin: true } });
  if (!walkin) {
    await prisma.customer.create({ data: { name: 'Walk-in Customer', isWalkin: true, customerCode: 'WALKIN' } });
  }
  console.log('Walk-in customer seeded.');

  // 9. Numbering series
  const series = [
    ['SALES_INV','SI'],['PURCHASE_INV','PI'],['SALES_RETURN','SR'],
    ['PURCHASE_RETURN','PR'],['JOURNAL_VOUCHER','JV'],['RECEIPT_VOUCHER','RV'],
    ['PAYMENT_VOUCHER','PV'],['CREDIT_NOTE','CN'],['DEBIT_NOTE','DN'],
    ['CASH_SESSION','CS'],['STOCK_ADJ','SA'],
  ];
  for (const [seriesCode, prefix] of series) {
    await prisma.numberingSeries.upsert({
      where: { seriesCode },
      update: {},
      create: { seriesCode, prefix, lastNumber: 0, padding: 6, resetYearly: true },
    });
  }
  console.log('Numbering series seeded.');

  // 10. Chart of Accounts
  const accountDefs = [
    // Assets
    { code: '10000', name: 'Assets', type: 'asset', isGroup: true, parent: null },
    { code: '11000', name: 'Current Assets', type: 'asset', isGroup: true, parent: '10000' },
    { code: '11100', name: 'Cash in Hand', type: 'asset', isGroup: false, parent: '11000', isSystem: true },
    { code: '11200', name: 'Bank Account', type: 'asset', isGroup: false, parent: '11000', isSystem: true },
    { code: '11300', name: 'Accounts Receivable', type: 'asset', isGroup: false, parent: '11000', isSystem: true },
    { code: '11400', name: 'Inventory', type: 'asset', isGroup: false, parent: '11000', isSystem: true },
    { code: '11500', name: 'Prepaid Expenses', type: 'asset', isGroup: false, parent: '11000' },
    { code: '12000', name: 'Fixed Assets', type: 'asset', isGroup: true, parent: '10000' },
    { code: '12100', name: 'Equipment', type: 'asset', isGroup: false, parent: '12000' },
    // Liabilities
    { code: '20000', name: 'Liabilities', type: 'liability', isGroup: true, parent: null },
    { code: '21000', name: 'Current Liabilities', type: 'liability', isGroup: true, parent: '20000' },
    { code: '21100', name: 'Accounts Payable', type: 'liability', isGroup: false, parent: '21000', isSystem: true },
    { code: '21200', name: 'VAT Payable', type: 'liability', isGroup: false, parent: '21000', isSystem: true },
    { code: '21300', name: 'Customer Credit Liability', type: 'liability', isGroup: false, parent: '21000' },
    // Equity
    { code: '30000', name: 'Equity', type: 'equity', isGroup: true, parent: null },
    { code: '31000', name: 'Owner Capital', type: 'equity', isGroup: false, parent: '30000' },
    { code: '32000', name: 'Retained Earnings', type: 'equity', isGroup: false, parent: '30000' },
    { code: '33000', name: 'Opening Balance Equity', type: 'equity', isGroup: false, parent: '30000', isSystem: true },
    // Revenue
    { code: '40000', name: 'Revenue', type: 'revenue', isGroup: true, parent: null },
    { code: '41000', name: 'Sales Revenue', type: 'revenue', isGroup: false, parent: '40000', isSystem: true },
    { code: '42000', name: 'Sales Returns', type: 'revenue', isGroup: false, parent: '40000' },
    { code: '43000', name: 'Sales Discounts', type: 'revenue', isGroup: false, parent: '40000' },
    { code: '44000', name: 'Other Income', type: 'revenue', isGroup: false, parent: '40000' },
    // Cost of Sales
    { code: '50000', name: 'Cost of Sales', type: 'expense', isGroup: true, parent: null },
    { code: '51000', name: 'Cost of Goods Sold', type: 'expense', isGroup: false, parent: '50000', isSystem: true },
    { code: '52000', name: 'Inventory Adjustments', type: 'expense', isGroup: false, parent: '50000' },
    // Expenses
    { code: '60000', name: 'Expenses', type: 'expense', isGroup: true, parent: null },
    { code: '61000', name: 'Rent Expense', type: 'expense', isGroup: false, parent: '60000' },
    { code: '62000', name: 'Salary Expense', type: 'expense', isGroup: false, parent: '60000' },
    { code: '63000', name: 'Utilities Expense', type: 'expense', isGroup: false, parent: '60000' },
    { code: '64000', name: 'Bank Charges', type: 'expense', isGroup: false, parent: '60000' },
    { code: '65000', name: 'Other Expenses', type: 'expense', isGroup: false, parent: '60000' },
  ];

  // Insert in order (parents first)
  for (const a of accountDefs) {
    const parentId = a.parent
      ? (await prisma.account.findUnique({ where: { accountCode: a.parent } }))?.id
      : null;
    await prisma.account.upsert({
      where: { accountCode: a.code },
      update: {},
      create: {
        accountCode: a.code,
        name: a.name,
        accountType: a.type as any,
        isGroup: a.isGroup,
        isSystem: (a as any).isSystem || false,
        parentId: parentId || null,
      },
    });
  }
  console.log('Chart of accounts seeded.');

  // 11. Default company settings
  const co = await prisma.companySettings.findFirst();
  if (!co) {
    await prisma.companySettings.create({
      data: {
        companyName: 'My Retail Store',
        currencyCode: 'NPR',
        timezone: 'Asia/Kathmandu',
        invoiceFooter: 'Thank you for your business!',
      },
    });
  }
  console.log('Company settings seeded.');

  // 12. Default fiscal period (current year)
  const year = new Date().getFullYear();
  const fpExists = await prisma.fiscalPeriod.findFirst({ where: { name: `FY ${year}/${year + 1}` } });
  if (!fpExists) {
    await prisma.fiscalPeriod.create({
      data: {
        name: `FY ${year}/${year + 1}`,
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year + 1}-12-31`),
        isClosed: false,
      },
    });
  }
  console.log('Fiscal period seeded.');

  console.log('\n========================================');
  console.log('  Pyloom POS Database Seed Complete!  ');
  console.log('  Default Admin: admin / Admin@2081   ');
  console.log('  CHANGE PASSWORD AFTER FIRST LOGIN!  ');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
