# Universal POS Desktop

Electron point-of-sale starter for a range of small businesses: retail, grocery, cafes, clothing, electronics, salons, service businesses, and more.

## Run from Windows Command Prompt

Install Node.js, download or clone the repository, then run in its folder:

```cmd
npm install
npm start
```

## Build a double-clickable Windows app

```cmd
npm run dist:win
```

The `dist` folder contains a Windows installer (which can create a desktop shortcut) and a portable executable. Builds should be made on Windows for Windows.

## Included

- Configurable business name, business type, currency, and default tax rate
- Product and service catalog with categories, SKUs/barcodes, units, and optional inventory tracking
- Point of sale with item search, quantities, discounts, customer, payment method, and tax calculation
- Stock adjustments and low-stock reminders
- Customer list, sales history, and JSON export/backup
- Local JSON data file in Electron's per-user application data folder; works offline after dependencies are installed

## Important limitations

This is a local single-device starter, not a certified accounting or payment terminal. It does not process card payments, synchronize multiple registers, print receipts, or provide user accounts. Confirm local tax and recordkeeping requirements before using it for live business transactions. Make regular exports/backups.
