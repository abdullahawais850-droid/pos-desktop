# Bill Slip Preview Does Not Appear in Packaged App

## Issue

After creating and launching the Windows installer or portable app, clicking **Complete sale** does not show the expected in-app bill slip preview. The source may appear to contain the preview-related code, which makes the behavior confusing.

## What the repository code shows

The preview behavior is split across two places:

- `renderer.js` in the packaged source calls `window.posAPI.printReceipt(...)` directly when a sale is completed. It does not define or open the screenshot-style preview modal itself.
- `main.js` injects CSS and JavaScript into the loaded renderer to add a preview modal and intercept the Complete sale click.

That means the preview is not a normal part of the renderer page. It depends on the injected script running successfully, finding the expected button and cart markup, and running after the page has loaded. If that injection fails, or the packaged build is older than the source, the app continues using the renderer's direct print flow and no in-app preview appears.

## Why the source can look correct while the app is not

A packaged Electron app runs the files included at build time. Updating code in the repository does not update an already-built installer or portable executable. Also, a preview implemented through runtime injection is harder to verify than markup and handlers that are directly present in the renderer files.

## Recommended durable fix

Implement the preview as first-class renderer UI:

1. Put the modal markup in `index.html` (or create it from `renderer.js`).
2. Add modal styling in a stylesheet loaded by `index.html` and included in `package.json`'s `build.files`.
3. Have the renderer's `completeSale()` create a pending sale and open the preview instead of calling the print API immediately.
4. On **Print slip & complete sale**, call the print API and only then record the sale and decrement stock after printing succeeds.
5. On **Cancel sale** or **Close**, dismiss the preview without saving the sale or changing stock.
6. Remove the `main.js` click interception so there is only one implementation of sale completion.

This keeps the preview, sale state, and button handlers together in the renderer rather than relying on injected code that must match its DOM.

## Reproduction and verification

1. Build the Windows app from a clean checkout after the fix.
2. Install or run the newly produced artifact—not an older installed app or portable executable.
3. Add an in-stock catalog item to the sale and click **Complete sale**.
4. Confirm the preview shows the store name, business type, receipt/date/customer/payment, item rows, subtotal, discount, tax, total, and footer.
5. Dismiss with **Close** or **Cancel sale** and verify sales history and inventory are unchanged.
6. Reopen the preview, print successfully, and verify exactly one sale is recorded and stock is reduced once.

## Diagnostic information if it still fails

If a fresh build still does not show the preview after moving it into the renderer, capture the Electron DevTools Console errors or launch the app from a terminal and save its output. Include the app version/commit used to build it. These details distinguish renderer errors from accidentally launching an older packaged artifact.
